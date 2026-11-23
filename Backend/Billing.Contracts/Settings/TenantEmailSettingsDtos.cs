using System;
using System.ComponentModel.DataAnnotations;

namespace Billing.Contracts.Settings;

/// <summary>
/// DTO representing tenant-isolated email configuration returned to authenticated clients.
/// Stored passwords and cryptographic secrets are strictly omitted.
/// </summary>
public class TenantEmailSettingDto
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public string Provider { get; set; } = "Custom";
    public string SmtpHost { get; set; } = string.Empty;
    public int SmtpPort { get; set; } = 587;
    public string Username { get; set; } = string.Empty;
    public string FromEmail { get; set; } = string.Empty;
    public string FromName { get; set; } = string.Empty;
    public string EncryptionMode { get; set; } = "StartTls";
    public bool IsEnabled { get; set; } = true;
    public bool IsVerified { get; set; } = false;
    public bool HasPasswordConfigured { get; set; }
    public DateTime? LastTestedAtUtc { get; set; }
    public string? LastTestStatus { get; set; }
    public string? LastTestError { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
    public string? UpdatedBy { get; set; }
}

/// <summary>
/// Request payload to create or update a tenant's SMTP configuration.
/// </summary>
public class SaveTenantEmailSettingRequest
{
    [MaxLength(64)]
    public string Provider { get; set; } = "Custom";

    [Required(ErrorMessage = "SMTP Host is required.")]
    [MaxLength(255)]
    public string SmtpHost { get; set; } = string.Empty;

    [Range(1, 65535, ErrorMessage = "SMTP Port must be between 1 and 65535.")]
    public int SmtpPort { get; set; } = 587;

    [Required(ErrorMessage = "Username is required.")]
    [MaxLength(255)]
    public string Username { get; set; } = string.Empty;

    /// <summary>
    /// Password or app-specific password.
    /// When updating an existing configuration, leaving this blank preserves the existing password.
    /// </summary>
    [MaxLength(256)]
    public string? Password { get; set; }

    [Required(ErrorMessage = "Sender Email (FromEmail) is required.")]
    [EmailAddress(ErrorMessage = "FromEmail must be a valid email address.")]
    [MaxLength(255)]
    public string FromEmail { get; set; } = string.Empty;

    [Required(ErrorMessage = "Sender Name (FromName) is required.")]
    [MaxLength(255)]
    public string FromName { get; set; } = string.Empty;

    [Required(ErrorMessage = "EncryptionMode is required.")]
    [MaxLength(32)]
    public string EncryptionMode { get; set; } = "StartTls";

    public bool IsEnabled { get; set; } = true;
}

/// <summary>
/// Request payload to test the SMTP connection and send a test message.
/// </summary>
public class TestEmailSettingRequest
{
    [Required(ErrorMessage = "Recipient email is required for the test.")]
    [EmailAddress(ErrorMessage = "Recipient email must be a valid email address.")]
    public string RecipientEmail { get; set; } = string.Empty;

    /// <summary>
    /// Optional overrides allowing testing before saving.
    /// </summary>
    public string? Provider { get; set; }
    public string? SmtpHost { get; set; }
    public int? SmtpPort { get; set; }
    public string? Username { get; set; }
    public string? Password { get; set; }
    public string? FromEmail { get; set; }
    public string? FromName { get; set; }
    public string? EncryptionMode { get; set; }
}

/// <summary>
/// Request payload to toggle enable/disable status.
/// </summary>
public class UpdateEmailSettingStatusRequest
{
    public bool IsEnabled { get; set; }
}

/// <summary>
/// Status summary of the tenant's email configuration.
/// </summary>
public class EmailSettingStatusDto
{
    public bool IsConfigured { get; set; }
    public bool IsEnabled { get; set; }
    public bool IsVerified { get; set; }
    public string? Provider { get; set; }
    public string? FromEmail { get; set; }
    public string? FromName { get; set; }
    public string? SmtpHost { get; set; }
    public int? SmtpPort { get; set; }
    public string? EncryptionMode { get; set; }
    public DateTime? LastTestedAtUtc { get; set; }
    public string? LastTestStatus { get; set; }
    public string? LastTestError { get; set; }
}

/// <summary>
/// Result of an SMTP test connection and dispatch attempt.
/// </summary>
public class TestEmailResultDto
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? ProviderResponse { get; set; }
    public DateTime TestedAtUtc { get; set; } = DateTime.UtcNow;
}
