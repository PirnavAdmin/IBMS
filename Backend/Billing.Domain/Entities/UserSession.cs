namespace Billing.Domain.Entities;

public class UserSession
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string RefreshTokenHash { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime ExpiresAt { get; set; }

    public DateTime LastActivityAt { get; set; } = DateTime.UtcNow;

    public DateTime? RevokedAt { get; set; }

    public bool IsRevoked { get; set; }

    // Navigation property
    public User User { get; set; } = null!;
}
