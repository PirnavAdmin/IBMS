namespace Billing.Contracts.Webhook;

public class WebhookDto
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public int? ApplicationId { get; set; }
    public string? ApplicationName { get; set; }
    public string Name { get; set; } = string.Empty;
    public string TargetUrl { get; set; } = string.Empty;
    public string SecretKeyPreview { get; set; } = string.Empty;
    public List<string> SubscribedEvents { get; set; } = new();
    public string Status { get; set; } = "Active";
    public int ConsecutiveFailureCount { get; set; }
    public DateTime? LastTriggeredAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
}

public class CreateWebhookRequest
{
    public int? ApplicationId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string TargetUrl { get; set; } = string.Empty;
    public List<string> SubscribedEvents { get; set; } = new();
    public string Status { get; set; } = "Active";
}

public class UpdateWebhookRequest
{
    public int? ApplicationId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string TargetUrl { get; set; } = string.Empty;
    public List<string> SubscribedEvents { get; set; } = new();
    public string Status { get; set; } = "Active";
}

public class WebhookQueryParameters
{
    public string? Status { get; set; }
    public string? EventType { get; set; }
    public string? SearchTerm { get; set; }
    public int? ApplicationId { get; set; }
    public int PageNumber { get; set; } = 1;
    public int PageSize { get; set; } = 20;
}

public class RotateSecretResponse
{
    public int WebhookId { get; set; }
    public string NewSecretKey { get; set; } = string.Empty;
    public string SecretKeyPreview { get; set; } = string.Empty;
    public DateTime RotatedAtUtc { get; set; } = DateTime.UtcNow;
}

public class WebhookPingResponse
{
    public bool Success { get; set; }
    public int StatusCode { get; set; }
    public string Message { get; set; } = string.Empty;
    public long LatencyMs { get; set; }
    public string? ResponseBody { get; set; }
}

public class WebhookEventDefinitionDto
{
    public string EventType { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string SamplePayload { get; set; } = "{}";
}
