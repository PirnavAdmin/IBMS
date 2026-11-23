using System;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Billing.Application.Common;
using Billing.Application.Interfaces;
using Billing.Domain.Entities;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using MimeKit;

namespace Billing.Infrastructure.Services;

public class EmailService : IEmailService
{
    private readonly ITenantEmailSettingRepository _settingRepository;
    private readonly ISecretEncryptionService _encryptionService;
    private readonly ISmtpSecurityValidator _securityValidator;
    private readonly ICurrentUserService? _currentUserService;
    private readonly ITenantRepository? _tenantRepository;
    private readonly ILogger<EmailService> _logger;
    private readonly IConfiguration _configuration;

    public EmailService(
        ITenantEmailSettingRepository settingRepository,
        ISecretEncryptionService encryptionService,
        ISmtpSecurityValidator securityValidator,
        ILogger<EmailService> logger,
        IConfiguration configuration,
        ICurrentUserService? currentUserService = null,
        ITenantRepository? tenantRepository = null)
    {
        _settingRepository = settingRepository;
        _encryptionService = encryptionService;
        _securityValidator = securityValidator;
        _logger = logger;
        _configuration = configuration;
        _currentUserService = currentUserService;
        _tenantRepository = tenantRepository;
    }

    public async Task SendEmailAsync(
        string toEmail,
        string subject,
        string body,
        byte[]? attachmentBytes = null,
        string? attachmentName = null)
    {
        var tenantId = _currentUserService?.TenantId;
        if (!tenantId.HasValue || tenantId.Value <= 0)
        {
            throw new InvalidOperationException("Email dispatch failed: No tenant context could be resolved for the current operation. Please specify the target tenant ID explicitly.");
        }

        await SendEmailForTenantAsync(tenantId.Value, toEmail, subject, body, attachmentBytes, attachmentName);
    }

    public async Task SendEmailForTenantAsync(
        int tenantId,
        string toEmail,
        string subject,
        string body,
        byte[]? attachmentBytes = null,
        string? attachmentName = null,
        CancellationToken cancellationToken = default)
    {
        if (tenantId <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(tenantId), "Tenant ID must be greater than zero.");
        }

        var setting = await _settingRepository.GetByTenantIdAsync(tenantId, cancellationToken);

        if (setting == null)
        {
            var fallbackEmail = _configuration["EmailSettings:Email"]?.Trim();
            var fallbackPass = _configuration["EmailSettings:AppPassword"]?.Trim();

            if (!string.IsNullOrWhiteSpace(fallbackEmail) && !string.IsNullOrWhiteSpace(fallbackPass))
            {
                var tenant = _tenantRepository != null ? await _tenantRepository.GetByIdAsync(tenantId) : null;
                var companyName = !string.IsNullOrWhiteSpace(tenant?.Name) ? tenant.Name.Trim() : $"Workspace #{tenantId}";
                var registeredEmail = !string.IsNullOrWhiteSpace(tenant?.CompanyEmail)
                    ? tenant.CompanyEmail.Trim()
                    : tenant?.Users?.FirstOrDefault(u => !string.IsNullOrWhiteSpace(u.Email))?.Email?.Trim();

                var senderEmail = !string.IsNullOrWhiteSpace(registeredEmail) ? registeredEmail : fallbackEmail;
                var cleanPass = fallbackPass.Replace(" ", "");
                var passwordEnc = _encryptionService != null ? _encryptionService.Protect(cleanPass) : cleanPass;

                _logger.LogInformation("Auto-initializing tenant-wise SMTP configuration for workspace #{TenantId} (Company: '{Company}', Sender: '{Sender}').", tenantId, companyName, senderEmail);
                setting = new TenantEmailSetting
                {
                    TenantId = tenantId,
                    Provider = "Gmail",
                    SmtpHost = _configuration["EmailSettings:Host"] ?? "smtp.gmail.com",
                    SmtpPort = int.TryParse(_configuration["EmailSettings:Port"], out var p) ? p : 587,
                    Username = fallbackEmail,
                    PasswordProtected = passwordEnc,
                    FromEmail = senderEmail,
                    FromName = companyName,
                    EncryptionMode = "StartTls",
                    IsEnabled = true,
                    IsVerified = true,
                    CreatedAtUtc = DateTime.UtcNow,
                    UpdatedAtUtc = DateTime.UtcNow,
                    UpdatedBy = "System"
                };

                try
                {
                    await _settingRepository.AddAsync(setting, cancellationToken);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Could not persist auto-initialized TenantEmailSetting for workspace #{TenantId}: {Message}", tenantId, ex.Message);
                }
            }
            else
            {
                _logger.LogWarning("Email dispatch attempted for tenant {TenantId}, but no SMTP configuration exists.", tenantId);
                throw new InvalidOperationException(
                    $"Email dispatch failed: No SMTP configuration found for workspace #{tenantId}. Please configure your organization's SMTP server under Settings -> Email Configuration.");
            }
        }

        if (!setting.IsEnabled)
        {
            _logger.LogInformation("Email dispatch skipped for tenant {TenantId}: SMTP configuration is disabled.", tenantId);
            throw new InvalidOperationException(
                $"Email dispatch failed: SMTP email sending is currently disabled for workspace #{tenantId}. Please enable it under Settings -> Email Configuration.");
        }

        await SendEmailWithConfigAsync(setting, toEmail, subject, body, attachmentBytes, attachmentName, cancellationToken);
    }

    public async Task SendEmailWithConfigAsync(
        TenantEmailSetting setting,
        string toEmail,
        string subject,
        string body,
        byte[]? attachmentBytes = null,
        string? attachmentName = null,
        CancellationToken cancellationToken = default)
    {
        if (setting == null)
            throw new ArgumentNullException(nameof(setting));

        if (string.IsNullOrWhiteSpace(toEmail))
            throw new ArgumentException("Recipient email cannot be empty.", nameof(toEmail));

        // Enforce SSRF & safe host policy
        if (!_securityValidator.ValidateSmtpDestination(setting.SmtpHost, setting.SmtpPort, out var validationError))
        {
            throw new InvalidOperationException($"Invalid SMTP configuration for workspace #{setting.TenantId}: {validationError}");
        }

        // Decrypt password if encrypted, or use directly if plain text (e.g. ephemeral test connection)
        string? plainPassword = null;
        if (!string.IsNullOrWhiteSpace(setting.PasswordProtected))
        {
            plainPassword = _encryptionService.IsEncrypted(setting.PasswordProtected)
                ? _encryptionService.Unprotect(setting.PasswordProtected)
                : setting.PasswordProtected;
        }

        var email = new MimeMessage();
        var fromName = !string.IsNullOrWhiteSpace(setting.FromName) ? setting.FromName : "IBMS Notification";
        var fromEmail = !string.IsNullOrWhiteSpace(setting.FromEmail) ? setting.FromEmail : setting.Username;
        email.From.Add(new MailboxAddress(fromName, fromEmail));
        email.To.Add(MailboxAddress.Parse(toEmail));
        email.Subject = subject ?? string.Empty;

        // Route replies back to the registered company email:
        email.ReplyTo.Add(new MailboxAddress(fromName, fromEmail));

        // When sending through an authenticated SMTP relay user whose username differs from FromEmail, set Sender header:
        if (!string.IsNullOrWhiteSpace(setting.Username) && !string.Equals(setting.Username, fromEmail, StringComparison.OrdinalIgnoreCase))
        {
            email.Sender = new MailboxAddress(fromName, setting.Username);
        }

        Tenant? tenant = null;
        if (_tenantRepository != null && setting.TenantId > 0)
        {
            try
            {
                tenant = await _tenantRepository.GetByIdAsync(setting.TenantId);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not fetch tenant #{TenantId} to enrich Help & Contact email details: {Message}", setting.TenantId, ex.Message);
            }
        }

        var companyName = !string.IsNullOrWhiteSpace(tenant?.Name)
            ? tenant.Name.Trim()
            : (!string.IsNullOrWhiteSpace(setting.FromName) ? setting.FromName.Trim() : $"Workspace #{setting.TenantId}");
        var supportEmail = !string.IsNullOrWhiteSpace(tenant?.CompanyEmail)
            ? tenant.CompanyEmail.Trim()
            : (!string.IsNullOrWhiteSpace(setting.FromEmail) ? setting.FromEmail.Trim() : setting.Username);
        var supportPhone = tenant?.Phone;
        var address = tenant?.Address;

        body = HelpAndContactEmailHelper.EnsureHelpAndContactSection(body, companyName, supportEmail, supportPhone, address);

        var builder = new BodyBuilder();
        if (!string.IsNullOrWhiteSpace(body) && (
            body.Contains("<html", StringComparison.OrdinalIgnoreCase) ||
            body.Contains("<div", StringComparison.OrdinalIgnoreCase) ||
            body.Contains("<p", StringComparison.OrdinalIgnoreCase) ||
            body.Contains("<table", StringComparison.OrdinalIgnoreCase)))
        {
            builder.HtmlBody = body;
        }
        else
        {
            builder.TextBody = body ?? string.Empty;
        }

        if (attachmentBytes != null && !string.IsNullOrWhiteSpace(attachmentName))
        {
            builder.Attachments.Add(attachmentName, attachmentBytes, ContentType.Parse("application/pdf"));
        }

        email.Body = builder.ToMessageBody();

        var secureSocketOptions = (setting.EncryptionMode ?? string.Empty).ToLowerInvariant() switch
        {
            "ssltls" or "ssl" => SecureSocketOptions.SslOnConnect,
            "none" or "plain" => SecureSocketOptions.None,
            _ => setting.SmtpPort == 465 ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTls
        };

        using var smtp = new SmtpClient();
        smtp.Timeout = 15000; // 15 seconds

        try
        {
            await smtp.ConnectAsync(
                setting.SmtpHost,
                setting.SmtpPort,
                secureSocketOptions,
                cancellationToken
            );

            if (!string.IsNullOrWhiteSpace(plainPassword))
            {
                await smtp.AuthenticateAsync(setting.Username, plainPassword, cancellationToken);
            }

            await smtp.SendAsync(email, cancellationToken);
            await smtp.DisconnectAsync(true, cancellationToken);

            _logger.LogInformation(
                "Successfully dispatched email to {Recipient} via tenant {TenantId} SMTP host {Host}:{Port}",
                toEmail, setting.TenantId, setting.SmtpHost, setting.SmtpPort);
        }
        catch (Exception ex)
        {
            var sanitized = _securityValidator.SanitizeErrorMessage(ex.Message);
            _logger.LogError(ex,
                "SMTP dispatch failed for tenant {TenantId} to {Recipient} via {Host}:{Port}: {SanitizedError}",
                setting.TenantId, toEmail, setting.SmtpHost, setting.SmtpPort, sanitized);

            var devSimulated = bool.TryParse(_configuration["EmailSettings:EnableDevSimulatedFallback"], out var isDevSim) && isDevSim;
            if (devSimulated)
            {
                _logger.LogWarning("Email delivery failed to {Recipient} ({SanitizedError}). DevSimulatedFallback is enabled: treating email dispatch as simulated success.", toEmail, sanitized);
                return;
            }

            throw new InvalidOperationException($"Failed to send email via workspace SMTP server: {sanitized}", ex);
        }
    }
}
