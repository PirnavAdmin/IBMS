namespace Billing.Domain.Entities;

/// <summary>
/// Frozen immutable snapshot of an issued invoice and its associated template presentation configuration.
/// Ensures historical invoices can be reproduced indefinitely without being affected by subsequent edits.
/// </summary>
public class InvoiceSnapshot
{
    public int Id { get; set; }

    public int TenantId { get; set; } = 1;

    public int InvoiceId { get; set; }

    public string InvoiceNumber { get; set; } = string.Empty;

    public int TemplateVersionId { get; set; }
    public TemplateVersion? TemplateVersion { get; set; }

    /// <summary>
    /// Serialized JSON containing all customer, line item, pricing, discount, and tax data at the time of issuance.
    /// </summary>
    public string SnapshotDataJson { get; set; } = "{}";

    /// <summary>
    /// Serialized JSON containing the exact template branding and layout configuration used.
    /// </summary>
    public string TemplateConfigJson { get; set; } = "{}";

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public string? CreatedBy { get; set; }
}
