namespace Billing.Domain.Entities;

public class InAppNotification
{
    public long Id { get; set; }

    public int TenantId { get; set; } = 1;
    public Tenant? Tenant { get; set; }

    public int RecipientUserId { get; set; }
    public User? RecipientUser { get; set; }

    public string EventType { get; set; } = string.Empty;

    public string EventDeduplicationId { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string Message { get; set; } = string.Empty;

    public string? ActionModule { get; set; }

    public string? ActionEntityId { get; set; }

    public bool IsRead { get; set; } = false;

    public DateTime? ReadAtUtc { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? ExpiresAtUtc { get; set; }
}
