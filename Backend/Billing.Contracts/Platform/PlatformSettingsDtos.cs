using System.ComponentModel.DataAnnotations;

namespace Billing.Contracts.Platform;

public class PlatformSettingsDto
{
    public string PlatformName { get; set; } = "IBMS Platform";
    public bool MaintenanceMode { get; set; }
    public bool AllowSelfRegistration { get; set; } = true;
    public int SessionTimeoutMinutes { get; set; } = 1440;
    public int InactivityTimeoutMinutes { get; set; } = 1440;
    public int PasswordMinLength { get; set; } = 8;
    public bool RequireDigit { get; set; } = true;
    public bool RequireSpecialChar { get; set; } = true;
    public List<string> SupportedCurrencies { get; set; } = new() { "INR", "USD", "EUR", "GBP" };
    public string AccountRecoveryContact { get; set; } = "support@ibms.com";
    public DateTime UpdatedAtUtc { get; set; }
    public string UpdatedBy { get; set; } = "System";
    public string? Version { get; set; }
}

public class UpdatePlatformSettingsRequest
{
    [Required(ErrorMessage = "Platform name is required.")]
    [StringLength(256, MinimumLength = 2)]
    public string PlatformName { get; set; } = "IBMS Platform";

    public bool MaintenanceMode { get; set; }

    public bool AllowSelfRegistration { get; set; } = true;

    [Range(5, 43200, ErrorMessage = "Session timeout must be between 5 minutes and 30 days.")]
    public int SessionTimeoutMinutes { get; set; } = 1440;

    [Range(5, 43200, ErrorMessage = "Inactivity timeout must be between 5 minutes and 30 days.")]
    public int InactivityTimeoutMinutes { get; set; } = 1440;

    [Range(8, 128, ErrorMessage = "Password minimum length must be at least 8 characters.")]
    public int PasswordMinLength { get; set; } = 8;

    public bool RequireDigit { get; set; } = true;

    public bool RequireSpecialChar { get; set; } = true;

    public List<string>? SupportedCurrencies { get; set; }

    [EmailAddress(ErrorMessage = "Invalid account recovery contact email format.")]
    public string AccountRecoveryContact { get; set; } = "support@ibms.com";

    public DateTime? ExpectedUpdatedAtUtc { get; set; }

    public string? Version { get; set; }
}
