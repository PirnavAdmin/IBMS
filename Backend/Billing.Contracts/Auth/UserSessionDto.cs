namespace Billing.Contracts;

public class UserSessionDto
{
    public int SessionId { get; set; }

    public int UserId { get; set; }

    public DateTime LoginTimeUtc { get; set; }

    public DateTime LastActivityAtUtc { get; set; }

    public DateTime? LogoutAtUtc { get; set; }

    public DateTime SessionExpiresAtUtc { get; set; }

    public bool IsActive { get; set; }

    public bool IsRevoked { get; set; }

    public string? RevocationReason { get; set; }

    public string? UserAgent { get; set; }

    public string? DeviceInfo { get; set; }
}
