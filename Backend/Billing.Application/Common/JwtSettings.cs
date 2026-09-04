namespace Billing.Application.Common;

public class JwtSettings
{
    public const string SectionName = "JwtSettings";

    public string SecretKey { get; set; } = "DefaultFallbackSecretKeyBillingApplication2026SecureKey!";

    public string Issuer { get; set; } = "IBMS.Billing.API";

    public string Audience { get; set; } = "IBMS.Billing.Client";

    public int AccessTokenExpirationMinutes { get; set; } = 15;

    public int RefreshTokenExpirationDays { get; set; } = 7;

    public int InactivityTimeoutMinutes { get; set; } = 60;

    public int SessionTimeoutMinutes { get; set; } = 1440; // 24 hours

    public string ApplicationId { get; set; } = "IBMS-Billing";
}
