namespace Billing.Domain.Entities;

public class UserSession
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public User? User { get; set; }

    public string RefreshTokenHash { get; set; } = string.Empty;

    public DateTime RefreshTokenExpiresAtUtc { get; set; }

    public bool IsRevoked { get; set; }

    public DateTime? RevokedAtUtc { get; set; }

    public string? RevocationReason { get; set; }

    public string? ReplacedByTokenHash { get; set; }

    // Session tracking
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime LastActivityAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? LogoutAtUtc { get; set; }

    public DateTime SessionExpiresAtUtc { get; set; }

    // Device information
    public string? UserAgent { get; set; }

    public string? DeviceInfo { get; set; }
}
