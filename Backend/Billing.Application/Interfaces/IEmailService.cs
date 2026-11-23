using System.Threading;
using System.Threading.Tasks;
using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IEmailService
{
    /// <summary>
    /// Sends an email using the ambient tenant context resolved from the current request/user.
    /// </summary>
    Task SendEmailAsync(string toEmail, string subject, string body, byte[]? attachmentBytes = null, string? attachmentName = null);

    /// <summary>
    /// Sends an email explicitly using the specified tenant's configured SMTP credentials.
    /// Strictly tenant-isolated: never falls back to another tenant's credentials or hardcoded accounts.
    /// </summary>
    Task SendEmailForTenantAsync(int tenantId, string toEmail, string subject, string body, byte[]? attachmentBytes = null, string? attachmentName = null, CancellationToken cancellationToken = default);

    /// <summary>
    /// Sends an email using a directly provided tenant email configuration.
    /// </summary>
    Task SendEmailWithConfigAsync(TenantEmailSetting setting, string toEmail, string subject, string body, byte[]? attachmentBytes = null, string? attachmentName = null, CancellationToken cancellationToken = default);
}
