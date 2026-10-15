namespace Billing.Domain.Entities;

public class IntegrationApplication
{
    public int Id { get; set; }

    public int TenantId { get; set; } = 1;
    public Tenant? Tenant { get; set; }

    public string Name { get; set; } = string.Empty;

    public string? Description { get; set; }

    public string ClientId { get; set; } = string.Empty;

    public string ClientSecretHash { get; set; } = string.Empty;

    public string FeatureFlagsJson { get; set; } = "{\"allowWebhooks\":true,\"enableAutoSync\":true}";

    public string Status { get; set; } = "Active";

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAtUtc { get; set; }

    public ICollection<Webhook> Webhooks { get; set; } = new List<Webhook>();
}
