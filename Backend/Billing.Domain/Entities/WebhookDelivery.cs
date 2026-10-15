namespace Billing.Domain.Entities;

public class WebhookDelivery
{
    public int Id { get; set; }

    public int TenantId { get; set; } = 1;
    public Tenant? Tenant { get; set; }

    public int WebhookId { get; set; }
    public Webhook? Webhook { get; set; }

    public string EventId { get; set; } = string.Empty;

    public string EventType { get; set; } = string.Empty;

    public string PayloadJson { get; set; } = string.Empty;

    public string? RequestHeadersJson { get; set; }

    public int? ResponseStatusCode { get; set; }

    public string? ResponseBody { get; set; }

    public long? ExecutionDurationMs { get; set; }

    public string Status { get; set; } = "Success";

    public int AttemptNumber { get; set; } = 1;

    public int MaxAttempts { get; set; } = 5;

    public DateTime? NextRetryUtc { get; set; }

    public string? FailureReason { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? DeliveredAtUtc { get; set; }
}
