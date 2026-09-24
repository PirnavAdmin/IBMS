namespace Billing.Domain.Entities;

public class Invoice
{
    public int Id { get; set; }

    public int TenantId { get; set; } = 1;
    public Tenant? Tenant { get; set; }

    public string InvoiceNumber { get; set; } = string.Empty;

    public int CustomerId { get; set; }
    public Customer? Customer { get; set; }

    public DateTime InvoiceDate { get; set; } = DateTime.UtcNow;

    public DateTime? DueDate { get; set; }

    public string? Reference { get; set; }

    public string Status { get; set; } = "Draft";

    public decimal Subtotal { get; set; }

    public decimal DiscountAmount { get; set; }

    public decimal TaxAmount { get; set; }

    public decimal ChargesAmount { get; set; }

    public decimal TotalAmount { get; set; }

    public decimal PaidAmount { get; set; }

    public decimal BalanceAmount { get; set; }

    public string? Notes { get; set; }

    public string? TermsAndConditions { get; set; }

    public int? QuotationId { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAtUtc { get; set; }

    public DateTime RowVersion { get; set; } = DateTime.UtcNow;

    public ICollection<InvoiceItem> Items { get; set; } = new List<InvoiceItem>();
}
