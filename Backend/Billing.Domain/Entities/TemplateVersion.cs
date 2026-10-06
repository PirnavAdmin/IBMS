using Billing.Domain.Enums;

namespace Billing.Domain.Entities;

/// <summary>
/// Immutable snapshot version of an invoice presentation template.
/// </summary>
public class TemplateVersion
{
    public int Id { get; set; }

    public int TenantId { get; set; } = 1;

    public int TemplateId { get; set; }
    public InvoiceTemplate? Template { get; set; }

    public int VersionNumber { get; set; } = 1;

    public TemplateStatus Status { get; set; } = TemplateStatus.Draft;

    public string? VersionDescription { get; set; }

    public string BrandingJson { get; set; } = "{}";

    public string CompanyDetailsJson { get; set; } = "{}";

    public string LayoutJson { get; set; } = "{}";

    public string PaymentInstructionsJson { get; set; } = "{}";

    public string TermsJson { get; set; } = "{}";

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public string? CreatedBy { get; set; }
}
