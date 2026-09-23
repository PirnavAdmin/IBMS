using Billing.Domain.Enums;

namespace Billing.Domain.Entities;

public class Quotation
{
    public int Id { get; set; }

    public int TenantId { get; set; } = 1;
    public Tenant? Tenant { get; set; }

    public string QuoteNumber { get; set; } = string.Empty;

    public int CustomerId { get; set; }
    public Customer? Customer { get; set; }

    public DateTime QuotationDate { get; set; } = DateTime.UtcNow;

    public DateTime ValidUntil { get; set; }

    public string? Reference { get; set; }

    public QuotationStatus Status { get; set; } = QuotationStatus.Draft;

    public decimal Subtotal { get; set; }

    public decimal DiscountAmount { get; set; }

    public decimal TaxAmount { get; set; }

    public decimal ChargesAmount { get; set; }

    public decimal TotalAmount { get; set; }

    public string? Notes { get; set; }

    public string? TermsAndConditions { get; set; }

    public int? ConvertedInvoiceId { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAtUtc { get; set; }

    public DateTime RowVersion { get; set; } = DateTime.UtcNow;

    public ICollection<QuotationItem> Items { get; set; } = new List<QuotationItem>();

    public ICollection<QuotationCommunication> Communications { get; set; } = new List<QuotationCommunication>();
}
