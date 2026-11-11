namespace Billing.Domain.Entities;

public class PlatformSetting
{
    public int Id { get; set; } = 1;

    public string PlatformName { get; set; } = "IBMS Platform";

    public bool MaintenanceMode { get; set; } = false;

    public bool AllowSelfRegistration { get; set; } = true;

    public int SessionTimeoutMinutes { get; set; } = 1440;

    public int InactivityTimeoutMinutes { get; set; } = 1440;

    public int PasswordMinLength { get; set; } = 8;

    public bool RequireDigit { get; set; } = true;

    public bool RequireSpecialChar { get; set; } = true;

    public string SupportedCurrenciesJson { get; set; } = "[\"INR\",\"USD\",\"EUR\",\"GBP\",\"AED\",\"AUD\",\"CAD\",\"SGD\",\"JPY\",\"CHF\",\"CNY\",\"NZD\",\"SAR\",\"QAR\",\"KWD\",\"ZAR\"]";

    public string AccountRecoveryContact { get; set; } = "support@ibms.com";

    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public string UpdatedBy { get; set; } = "System";

    public string? Version { get; set; }
}
