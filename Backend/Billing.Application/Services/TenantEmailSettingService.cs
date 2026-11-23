using System;
using System.Net.Mail;
using System.Threading;
using System.Threading.Tasks;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Settings;
using Billing.Domain.Entities;
using Microsoft.Extensions.Logging;

namespace Billing.Application.Services;

public class TenantEmailSettingService : ITenantEmailSettingService
{
    private readonly ITenantEmailSettingRepository _settingRepository;
    private readonly ISecretEncryptionService _encryptionService;
    private readonly ISmtpSecurityValidator _securityValidator;
    private readonly IEmailService _emailService;
    private readonly IAuditLogRepository _auditLogRepository;
    private readonly ITenantRepository _tenantRepository;
    private readonly ILogger<TenantEmailSettingService> _logger;

    public TenantEmailSettingService(
        ITenantEmailSettingRepository settingRepository,
        ISecretEncryptionService encryptionService,
        ISmtpSecurityValidator securityValidator,
        IEmailService emailService,
        IAuditLogRepository auditLogRepository,
        ITenantRepository tenantRepository,
        ILogger<TenantEmailSettingService> logger)
    {
        _settingRepository = settingRepository;
        _encryptionService = encryptionService;
        _securityValidator = securityValidator;
        _emailService = emailService;
        _auditLogRepository = auditLogRepository;
        _tenantRepository = tenantRepository;
        _logger = logger;
    }

    public async Task<ApiResponse<TenantEmailSettingDto>> GetSettingAsync(int tenantId, CancellationToken cancellationToken = default)
    {
        var setting = await _settingRepository.GetByTenantIdAsync(tenantId, cancellationToken);
        if (setting == null)
        {
            var tenant = await _tenantRepository.GetByIdAsync(tenantId);
            var companyName = tenant?.Name ?? string.Empty;
            var registeredEmail = !string.IsNullOrWhiteSpace(tenant?.CompanyEmail)
                ? tenant.CompanyEmail.Trim()
                : tenant?.Users?.FirstOrDefault(u => !string.IsNullOrWhiteSpace(u.Email))?.Email?.Trim() ?? string.Empty;

            return ApiResponse<TenantEmailSettingDto>.Ok(new TenantEmailSettingDto
            {
                TenantId = tenantId,
                Provider = "Gmail",
                SmtpHost = "smtp.gmail.com",
                SmtpPort = 587,
                EncryptionMode = "StartTls",
                FromName = companyName,
                FromEmail = registeredEmail,
                Username = registeredEmail,
                IsEnabled = true,
                IsVerified = false,
                HasPasswordConfigured = false
            }, "Default email configuration initialized with company details.");
        }

        return ApiResponse<TenantEmailSettingDto>.Ok(MapToDto(setting), "Email configuration retrieved successfully.");
    }

    public async Task<ApiResponse<TenantEmailSettingDto>> SaveSettingAsync(
        int tenantId,
        SaveTenantEmailSettingRequest request,
        string? userName = null,
        CancellationToken cancellationToken = default)
    {
        if (request == null)
            return ApiResponse<TenantEmailSettingDto>.Fail("Request body cannot be null.");

        // SSRF & Port Validation
        if (!_securityValidator.ValidateSmtpDestination(request.SmtpHost, request.SmtpPort, out var validationError))
        {
            return ApiResponse<TenantEmailSettingDto>.Fail(validationError ?? "Invalid SMTP destination.");
        }

        // Email address validations
        if (!IsValidEmailAddress(request.FromEmail))
        {
            return ApiResponse<TenantEmailSettingDto>.Fail("Invalid sender email address (FromEmail).");
        }

        var existing = await _settingRepository.GetByTenantIdAsync(tenantId, cancellationToken);
        var isNew = existing == null;

        string? protectedPassword;
        if (!string.IsNullOrWhiteSpace(request.Password))
        {
            var rawPassword = request.Password.Trim();
            protectedPassword = _encryptionService.Protect(rawPassword);
        }
        else if (!isNew && !string.IsNullOrWhiteSpace(existing!.PasswordProtected))
        {
            // Retain previous encrypted password
            protectedPassword = existing.PasswordProtected;
        }
        else
        {
            return ApiResponse<TenantEmailSettingDto>.Fail("Password / App Password is required when creating a new email configuration.");
        }

        var now = DateTime.UtcNow;
        var normalizedProvider = string.IsNullOrWhiteSpace(request.Provider) ? "Custom" : request.Provider.Trim();
        var normalizedEncryptionMode = NormalizeEncryptionMode(request.EncryptionMode, request.SmtpPort);

        if (isNew)
        {
            var newSetting = new TenantEmailSetting
            {
                TenantId = tenantId,
                Provider = normalizedProvider,
                SmtpHost = request.SmtpHost.Trim(),
                SmtpPort = request.SmtpPort,
                Username = request.Username.Trim(),
                PasswordProtected = protectedPassword,
                FromEmail = request.FromEmail.Trim(),
                FromName = request.FromName.Trim(),
                EncryptionMode = normalizedEncryptionMode,
                IsEnabled = request.IsEnabled,
                IsVerified = false,
                CreatedAtUtc = now,
                UpdatedAtUtc = now,
                UpdatedBy = userName ?? "System"
            };

            await _settingRepository.AddAsync(newSetting, cancellationToken);

            await LogAuditAsync(tenantId, newSetting.Id, "CreateSmtpConfig",
                $"Configured SMTP email settings with host: {newSetting.SmtpHost}:{newSetting.SmtpPort}, sender: {newSetting.FromEmail}", userName);

            return ApiResponse<TenantEmailSettingDto>.Ok(MapToDto(newSetting), "Email configuration saved successfully.");
        }
        else
        {
            // If host, port, username or password changed, reset verified state
            var hostOrAuthChanged = !string.Equals(existing!.SmtpHost, request.SmtpHost.Trim(), StringComparison.OrdinalIgnoreCase)
                || existing.SmtpPort != request.SmtpPort
                || !string.Equals(existing.Username, request.Username.Trim(), StringComparison.Ordinal)
                || (!string.IsNullOrWhiteSpace(request.Password) && existing.PasswordProtected != protectedPassword);

            existing.Provider = normalizedProvider;
            existing.SmtpHost = request.SmtpHost.Trim();
            existing.SmtpPort = request.SmtpPort;
            existing.Username = request.Username.Trim();
            existing.PasswordProtected = protectedPassword;
            existing.FromEmail = request.FromEmail.Trim();
            existing.FromName = request.FromName.Trim();
            existing.EncryptionMode = normalizedEncryptionMode;
            existing.IsEnabled = request.IsEnabled;
            if (hostOrAuthChanged)
            {
                existing.IsVerified = false;
            }
            existing.UpdatedAtUtc = now;
            existing.UpdatedBy = userName ?? "System";

            await _settingRepository.UpdateAsync(existing, cancellationToken);

            await LogAuditAsync(tenantId, existing.Id, "UpdateSmtpConfig",
                $"Updated SMTP email settings with host: {existing.SmtpHost}:{existing.SmtpPort}, sender: {existing.FromEmail}", userName);

            return ApiResponse<TenantEmailSettingDto>.Ok(MapToDto(existing), "Email configuration updated successfully.");
        }
    }

    public async Task<ApiResponse<TestEmailResultDto>> TestSmtpConnectionAsync(
        int tenantId,
        TestEmailSettingRequest request,
        string? userName = null,
        CancellationToken cancellationToken = default)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.RecipientEmail))
            return ApiResponse<TestEmailResultDto>.Fail("Recipient email is required for the test.");

        if (!IsValidEmailAddress(request.RecipientEmail))
            return ApiResponse<TestEmailResultDto>.Fail("Recipient email is not a valid email address.");

        var existing = await _settingRepository.GetByTenantIdAsync(tenantId, cancellationToken);

        // Determine effective values (allowing modal test overrides or saved config)
        var host = request.SmtpHost?.Trim() ?? existing?.SmtpHost;
        var port = request.SmtpPort ?? existing?.SmtpPort ?? 587;
        var username = request.Username?.Trim() ?? existing?.Username;
        var fromEmail = request.FromEmail?.Trim() ?? existing?.FromEmail;
        var fromName = request.FromName?.Trim() ?? existing?.FromName ?? "IBMS Test";
        var encMode = NormalizeEncryptionMode(request.EncryptionMode ?? existing?.EncryptionMode, port);

        if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(fromEmail))
        {
            return ApiResponse<TestEmailResultDto>.Fail("SMTP host, username, and sender email must be configured before testing.");
        }

        // Determine password
        string? plainPassword;
        if (!string.IsNullOrWhiteSpace(request.Password))
        {
            plainPassword = request.Password.Trim();
        }
        else if (existing != null && !string.IsNullOrWhiteSpace(existing.PasswordProtected))
        {
            plainPassword = _encryptionService.Unprotect(existing.PasswordProtected);
        }
        else
        {
            return ApiResponse<TestEmailResultDto>.Fail("Password / App Password is required to test SMTP connection.");
        }

        // Validate destination
        if (!_securityValidator.ValidateSmtpDestination(host, port, out var validationError))
        {
            return ApiResponse<TestEmailResultDto>.Fail(validationError ?? "Invalid SMTP destination.");
        }

        var tenant = await _tenantRepository.GetByIdAsync(tenantId);
        var tenantLabel = tenant?.Name ?? $"Workspace #{tenantId}";
        var testTimestamp = DateTime.UtcNow;

        var testConfig = new TenantEmailSetting
        {
            TenantId = tenantId,
            Provider = request.Provider ?? existing?.Provider ?? "Custom",
            SmtpHost = host,
            SmtpPort = port,
            Username = username,
            PasswordProtected = plainPassword, // In-memory plain text for test execution
            FromEmail = fromEmail,
            FromName = fromName,
            EncryptionMode = encMode,
            IsEnabled = true,
            IsVerified = false
        };

        var subject = $"[IBMS] SMTP Configuration Test - {tenantLabel}";
        var htmlBody = $@"
<!DOCTYPE html>
<html>
<head>
  <meta charset='utf-8'/>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7fafc; margin: 0; padding: 24px; }}
    .card {{ background: #ffffff; max-width: 580px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }}
    .badge {{ display: inline-block; padding: 4px 10px; background-color: #def7ec; color: #03543f; border-radius: 9999px; font-size: 13px; font-weight: 600; margin-bottom: 16px; }}
    h2 {{ color: #1a202c; margin-top: 0; margin-bottom: 8px; font-size: 20px; }}
    p {{ color: #4a5568; line-height: 1.6; font-size: 14px; }}
    .table {{ width: 100%; border-collapse: collapse; margin-top: 16px; margin-bottom: 20px; }}
    .table td {{ padding: 8px 12px; border-bottom: 1px solid #edf2f7; font-size: 13px; }}
    .table td.label {{ color: #718096; width: 38%; font-weight: 500; }}
    .table td.value {{ color: #2d3748; font-weight: 600; font-family: monospace; }}
    .footer {{ font-size: 12px; color: #a0aec0; border-top: 1px solid #edf2f7; padding-top: 16px; margin-top: 24px; }}
  </style>
</head>
<body>
  <div class='card'>
    <div class='badge'>✓ SMTP Connected Successfully</div>
    <h2>Workspace Mail Delivery Verified</h2>
    <p>This test email confirms that your organization's SMTP credentials have been successfully authenticated by the mail server and accepted for delivery.</p>
    
    <table class='table'>
      <tr><td class='label'>Workspace</td><td class='value'>{System.Net.WebUtility.HtmlEncode(tenantLabel)}</td></tr>
      <tr><td class='label'>SMTP Host</td><td class='value'>{System.Net.WebUtility.HtmlEncode(host)}</td></tr>
      <tr><td class='label'>SMTP Port</td><td class='value'>{port}</td></tr>
      <tr><td class='label'>Security Mode</td><td class='value'>{System.Net.WebUtility.HtmlEncode(encMode)}</td></tr>
      <tr><td class='label'>Sender Address</td><td class='value'>{System.Net.WebUtility.HtmlEncode(fromEmail)}</td></tr>
      <tr><td class='label'>Authenticated User</td><td class='value'>{System.Net.WebUtility.HtmlEncode(username)}</td></tr>
      <tr><td class='label'>Dispatched At</td><td class='value'>{testTimestamp:yyyy-MM-dd HH:mm:ss} UTC</td></tr>
    </table>

    <p style='font-size: 13px; color: #718096;'>
      <strong>Note:</strong> SMTP server acceptance confirms valid host, port, credentials, and transport negotiation. Inbox delivery depends on your provider's SPF, DKIM, and DMARC DNS records.
    </p>

    <div class='footer'>
      Sent automatically by IBMS (Invoice &amp; Billing Management System) for workspace #{tenantId}.
    </div>
  </div>
</body>
</html>";

        try
        {
            await _emailService.SendEmailWithConfigAsync(
                testConfig,
                request.RecipientEmail.Trim(),
                subject,
                htmlBody,
                null,
                null,
                cancellationToken);

            // If saved setting exists, update verification status
            if (existing != null)
            {
                existing.IsVerified = true;
                existing.LastTestedAtUtc = testTimestamp;
                existing.LastTestStatus = "Success";
                existing.LastTestError = null;
                await _settingRepository.UpdateAsync(existing, cancellationToken);
            }

            await LogAuditAsync(tenantId, existing?.Id ?? 0, "TestSmtpSuccess",
                $"Successfully verified SMTP connection and dispatched test email to {request.RecipientEmail}", userName);

            return ApiResponse<TestEmailResultDto>.Ok(new TestEmailResultDto
            {
                Success = true,
                Message = $"SMTP connection verified successfully. A test message was accepted for delivery to {request.RecipientEmail}.",
                ProviderResponse = "250 Message accepted for delivery",
                TestedAtUtc = testTimestamp
            }, "SMTP test completed successfully.");
        }
        catch (Exception ex)
        {
            var sanitizedError = _securityValidator.SanitizeErrorMessage(ex.Message);
            _logger.LogWarning(ex, "SMTP test failed for TenantId {TenantId} on host {Host}:{Port}: {SanitizedError}",
                tenantId, host, port, sanitizedError);

            if (existing != null)
            {
                existing.LastTestedAtUtc = testTimestamp;
                existing.LastTestStatus = "Failed";
                existing.LastTestError = sanitizedError;
                await _settingRepository.UpdateAsync(existing, cancellationToken);
            }

            await LogAuditAsync(tenantId, existing?.Id ?? 0, "TestSmtpFailed",
                $"SMTP test to {request.RecipientEmail} failed: {sanitizedError}", userName);

            return ApiResponse<TestEmailResultDto>.Fail($"SMTP test failed: {sanitizedError}");
        }
    }

    public async Task<ApiResponse<TenantEmailSettingDto>> SetStatusAsync(
        int tenantId,
        bool isEnabled,
        string? userName = null,
        CancellationToken cancellationToken = default)
    {
        var existing = await _settingRepository.GetByTenantIdAsync(tenantId, cancellationToken);
        if (existing == null)
            return ApiResponse<TenantEmailSettingDto>.Fail("No email configuration found for this workspace. Please configure SMTP first.");

        existing.IsEnabled = isEnabled;
        existing.UpdatedAtUtc = DateTime.UtcNow;
        existing.UpdatedBy = userName ?? "System";

        await _settingRepository.UpdateAsync(existing, cancellationToken);

        await LogAuditAsync(tenantId, existing.Id, isEnabled ? "EnableSmtp" : "DisableSmtp",
            $"Tenant email sending {(isEnabled ? "enabled" : "disabled")}", userName);

        return ApiResponse<TenantEmailSettingDto>.Ok(MapToDto(existing),
            $"Email sending {(isEnabled ? "enabled" : "disabled")} successfully.");
    }

    public async Task<ApiResponse<EmailSettingStatusDto>> GetStatusAsync(int tenantId, CancellationToken cancellationToken = default)
    {
        var setting = await _settingRepository.GetByTenantIdAsync(tenantId, cancellationToken);
        if (setting == null)
        {
            var tenant = await _tenantRepository.GetByIdAsync(tenantId);
            var companyName = tenant?.Name ?? string.Empty;
            var registeredEmail = !string.IsNullOrWhiteSpace(tenant?.CompanyEmail)
                ? tenant.CompanyEmail.Trim()
                : tenant?.Users?.FirstOrDefault(u => !string.IsNullOrWhiteSpace(u.Email))?.Email?.Trim() ?? string.Empty;

            return ApiResponse<EmailSettingStatusDto>.Ok(new EmailSettingStatusDto
            {
                IsConfigured = false,
                IsEnabled = true,
                IsVerified = false,
                Provider = "Gmail",
                FromEmail = registeredEmail,
                FromName = companyName,
                SmtpHost = "smtp.gmail.com",
                SmtpPort = 587,
                EncryptionMode = "StartTls"
            }, "Email settings status initialized with workspace defaults.");
        }

        return ApiResponse<EmailSettingStatusDto>.Ok(new EmailSettingStatusDto
        {
            IsConfigured = true,
            IsEnabled = setting.IsEnabled,
            IsVerified = setting.IsVerified,
            Provider = setting.Provider,
            FromEmail = setting.FromEmail,
            FromName = setting.FromName,
            SmtpHost = setting.SmtpHost,
            SmtpPort = setting.SmtpPort,
            EncryptionMode = setting.EncryptionMode,
            LastTestedAtUtc = setting.LastTestedAtUtc,
            LastTestStatus = setting.LastTestStatus,
            LastTestError = setting.LastTestError
        }, "Email settings status retrieved.");
    }

    public async Task<TenantEmailSetting?> GetRawSettingForTenantAsync(int tenantId, CancellationToken cancellationToken = default)
    {
        return await _settingRepository.GetByTenantIdAsync(tenantId, cancellationToken);
    }

    private static TenantEmailSettingDto MapToDto(TenantEmailSetting entity)
    {
        return new TenantEmailSettingDto
        {
            Id = entity.Id,
            TenantId = entity.TenantId,
            Provider = entity.Provider,
            SmtpHost = entity.SmtpHost,
            SmtpPort = entity.SmtpPort,
            Username = entity.Username,
            FromEmail = entity.FromEmail,
            FromName = entity.FromName,
            EncryptionMode = entity.EncryptionMode,
            IsEnabled = entity.IsEnabled,
            IsVerified = entity.IsVerified,
            HasPasswordConfigured = !string.IsNullOrWhiteSpace(entity.PasswordProtected),
            LastTestedAtUtc = entity.LastTestedAtUtc,
            LastTestStatus = entity.LastTestStatus,
            LastTestError = entity.LastTestError,
            CreatedAtUtc = entity.CreatedAtUtc,
            UpdatedAtUtc = entity.UpdatedAtUtc,
            UpdatedBy = entity.UpdatedBy
        };
    }

    private static string NormalizeEncryptionMode(string? mode, int port)
    {
        if (string.IsNullOrWhiteSpace(mode))
        {
            return port == 465 ? "SslTls" : "StartTls";
        }

        var lower = mode.Trim().ToLowerInvariant();
        return lower switch
        {
            "ssltls" or "ssl" or "tls" or "ssl/tls" => "SslTls",
            "none" or "plain" or "unencrypted" => "None",
            _ => "StartTls"
        };
    }

    private static bool IsValidEmailAddress(string? email)
    {
        if (string.IsNullOrWhiteSpace(email)) return false;
        try
        {
            var addr = new MailAddress(email.Trim());
            return addr.Address == email.Trim();
        }
        catch
        {
            return false;
        }
    }

    private async Task LogAuditAsync(int tenantId, int entityId, string action, string changes, string? userName)
    {
        try
        {
            await _auditLogRepository.AddAsync(new AuditLog
            {
                TenantId = tenantId,
                EntityName = "TenantEmailSetting",
                EntityId = entityId.ToString(),
                Action = action,
                Changes = changes,
                UserName = userName ?? "System",
                Timestamp = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to write audit log for TenantEmailSetting {Action}", action);
        }
    }
}
