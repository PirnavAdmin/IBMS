namespace Billing.Contracts.Webhook;

public class WebhookDeliveryDto
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public int WebhookId { get; set; }
    public string? WebhookName { get; set; }
    public string? TargetUrl { get; set; }
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
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? DeliveredAtUtc { get; set; }
}

public class WebhookDeliveryQueryParameters
{
    public int? WebhookId { get; set; }
    public string? EventType { get; set; }
    public string? Status { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public int PageNumber { get; set; } = 1;
    public int PageSize { get; set; } = 20;
}

public class ReplayDeliveryResponse
{
    public bool Success { get; set; }
    public int DeliveryId { get; set; }
    public string Message { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public int AttemptNumber { get; set; }
}
