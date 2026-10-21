namespace Billing.Domain.Entities;

public class CreditNoteItem
{
    public int Id { get; set; }

    public int CreditNoteId { get; set; }
    public CreditNote? CreditNote { get; set; }

    public int? InvoiceItemId { get; set; }
    public InvoiceItem? InvoiceItem { get; set; }

    public int? ProductId { get; set; }
    public Product? Product { get; set; }

    public string Description { get; set; } = string.Empty;

    public decimal Quantity { get; set; } = 1m;

    public decimal UnitPrice { get; set; }

    public decimal DiscountAmount { get; set; }

    public string? TaxType { get; set; }

    public decimal? TaxRate { get; set; }

    public decimal TaxAmount { get; set; }

    public decimal TotalAmount { get; set; }

    public string? HSNSAC { get; set; }
}
