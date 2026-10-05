using Billing.Domain.Enums;

namespace Billing.Domain.Entities;

/// <summary>
/// Represents an invoice presentation template containing metadata and active version pointers.
/// </summary>
public class InvoiceTemplate
{
    public int Id { get; set; }

    public int TenantId { get; set; } = 1;
    public Tenant? Tenant { get; set; }

    public string Name { get; set; } = string.Empty;

    public string? Description { get; set; }

    public TemplateStyle Style { get; set; } = TemplateStyle.Standard;

    public TemplateStatus Status { get; set; } = TemplateStatus.Draft;

    public bool IsDefault { get; set; }

    public int CurrentVersionNumber { get; set; } = 1;

    public int? ActiveVersionId { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAtUtc { get; set; }

    public string? CreatedBy { get; set; }

    public string? UpdatedBy { get; set; }

    public byte[] RowVersion { get; set; } = [];

    public ICollection<TemplateVersion> Versions { get; set; } = new List<TemplateVersion>();
}
