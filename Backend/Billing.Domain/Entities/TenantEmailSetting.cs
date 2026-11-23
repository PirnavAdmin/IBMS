using System;

namespace Billing.Domain.Entities;

/// <summary>
/// Represents tenant-isolated SMTP email configuration.
/// Each tenant configures and manages their own email credentials securely at rest.
/// </summary>
public class TenantEmailSetting
{
    public int Id { get; set; }

    /// <summary>
    /// Foreign key identifying the owning tenant.
    /// Strictly isolated; one active configuration per tenant.
    /// </summary>
    public int TenantId { get; set; }
    public Tenant? Tenant { get; set; }

    /// <summary>
    /// Email provider preset: "Gmail", "Office365", "Hostinger", "Custom".
    /// </summary>
    public string Provider { get; set; } = "Custom";

    /// <summary>
    /// Outgoing SMTP server hostname or fully-qualified domain name.
    /// </summary>
    public string SmtpHost { get; set; } = string.Empty;

    /// <summary>
    /// SMTP connection port (e.g., 587 for STARTTLS, 465 for SSL/TLS, 25 for plain).
    /// </summary>
    public int SmtpPort { get; set; } = 587;

    /// <summary>
    /// Authenticating username (usually the full email address).
    /// </summary>
    public string Username { get; set; } = string.Empty;

    /// <summary>
    /// Encrypted password or app-specific password protected with AES-256-GCM.
    /// Named with Protected suffix to ensure automated audit-log redaction.
    /// </summary>
    public string? PasswordProtected { get; set; }

    /// <summary>
    /// Outgoing sender email address displayed on invoice and notification emails.
    /// </summary>
    public string FromEmail { get; set; } = string.Empty;

    /// <summary>
    /// Friendly sender display name (e.g., "Acme Billing" or "Admin").
    /// </summary>
    public string FromName { get; set; } = string.Empty;

    /// <summary>
    /// Transport security mode: "StartTls", "SslTls", "None".
    /// </summary>
    public string EncryptionMode { get; set; } = "StartTls";

    /// <summary>
    /// Whether email dispatch is currently enabled for this tenant.
    /// </summary>
    public bool IsEnabled { get; set; } = true;

    /// <summary>
    /// Indicates whether a test connection was successfully verified.
    /// </summary>
    public bool IsVerified { get; set; } = false;

    /// <summary>
    /// Timestamp of the last test connection attempt in UTC.
    /// </summary>
    public DateTime? LastTestedAtUtc { get; set; }

    /// <summary>
    /// Status result of the last test connection ("Success" or "Failed").
    /// </summary>
    public string? LastTestStatus { get; set; }

    /// <summary>
    /// Sanitized error message if the last test connection failed (secrets redacted).
    /// </summary>
    public string? LastTestError { get; set; }

    /// <summary>
    /// Audit timestamp when this configuration was created.
    /// </summary>
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Audit timestamp when this configuration was last modified.
    /// </summary>
    public DateTime? UpdatedAtUtc { get; set; }

    /// <summary>
    /// Username or identifier of the user who last updated this configuration.
    /// </summary>
    public string? UpdatedBy { get; set; }
}
