namespace Billing.Contracts.Notification;

public class NotificationLogDto
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public string EventType { get; set; } = string.Empty;
    public string EntityType { get; set; } = string.Empty;
    public int EntityId { get; set; }
    public string Channel { get; set; } = "Email";
    public string Recipient { get; set; } = string.Empty;
    public string Subject { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string Status { get; set; } = "Sent";
    public DateTime SentAtUtc { get; set; }
    public int RetryCount { get; set; }
    public string? FailureReason { get; set; }
    public string? SentBy { get; set; }
    public DateTime? NextRetryAtUtc { get; set; }
}

public class NotificationLogQueryParameters
{
    public string? EventType { get; set; }
    public string? EntityType { get; set; }
    public int? EntityId { get; set; }
    public string? Status { get; set; }
    public string? SearchTerm { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public int PageNumber { get; set; } = 1;
    public int PageSize { get; set; } = 20;
}
