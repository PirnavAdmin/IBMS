namespace Billing.Domain.Entities;

public class Webhook
{
    public int Id { get; set; }

    public int TenantId { get; set; } = 1;
    public Tenant? Tenant { get; set; }

    public int? ApplicationId { get; set; }
    public IntegrationApplication? Application { get; set; }

    public string Name { get; set; } = string.Empty;

    public string TargetUrl { get; set; } = string.Empty;

    public string SecretKey { get; set; } = string.Empty;

    public string SubscribedEventsJson { get; set; } = "[]";

    public string Status { get; set; } = "Active";

    public int ConsecutiveFailureCount { get; set; } = 0;

    public DateTime? LastTriggeredAtUtc { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAtUtc { get; set; }

    public ICollection<WebhookDelivery> Deliveries { get; set; } = new List<WebhookDelivery>();
}
