namespace Billing.Domain.Entities;

public class AuditLog
{
    public long Id { get; set; }

    public int TenantId { get; set; } = 1;
    public Tenant? Tenant { get; set; }

    public int? CustomerId { get; set; }
    public Customer? Customer { get; set; }

    public string EntityName { get; set; } = "Customer";

    public string EntityId { get; set; } = string.Empty;

    public string Action { get; set; } = string.Empty; // CREATE, UPDATE, DEACTIVATE

    public string UserId { get; set; } = string.Empty;

    public string UserName { get; set; } = string.Empty;

    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    public string? Changes { get; set; } // JSON representation of old vs new or modified fields

    public string? IpAddress { get; set; }
}
