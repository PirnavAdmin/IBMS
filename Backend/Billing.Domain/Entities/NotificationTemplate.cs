namespace Billing.Domain.Entities;

public class NotificationTemplate
{
    public int Id { get; set; }

    public int TenantId { get; set; } = 1;
    public Tenant? Tenant { get; set; }

    public string EventType { get; set; } = string.Empty;

    public string Channel { get; set; } = "Email";

    public string Name { get; set; } = string.Empty;

    public string? Description { get; set; }

    public string SubjectTemplate { get; set; } = string.Empty;

    public string BodyTemplate { get; set; } = string.Empty;

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAtUtc { get; set; }

    public string? CreatedBy { get; set; }

    public string? UpdatedBy { get; set; }
}
