namespace Billing.Domain.Entities;

public class NotificationLog
{
    public int Id { get; set; }

    public int TenantId { get; set; } = 1;
    public Tenant? Tenant { get; set; }

    public string EventType { get; set; } = string.Empty;

    public string EntityType { get; set; } = string.Empty;

    public int EntityId { get; set; }

    public string Channel { get; set; } = "Email";

    public string Recipient { get; set; } = string.Empty;

    public string Subject { get; set; } = string.Empty;

    public string Message { get; set; } = string.Empty;

    public string Status { get; set; } = "Sent";

    public DateTime SentAtUtc { get; set; } = DateTime.UtcNow;

    public int RetryCount { get; set; } = 0;

    public string? FailureReason { get; set; }

    public string? SentBy { get; set; }

    public DateTime? NextRetryAtUtc { get; set; }
}
