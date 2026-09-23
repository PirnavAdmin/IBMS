namespace Billing.Domain.Entities;

public class QuotationItem
{
    public int Id { get; set; }

    public int QuotationId { get; set; }
    public Quotation? Quotation { get; set; }

    public int? ProductId { get; set; }
    public Product? Product { get; set; }

    public string Description { get; set; } = string.Empty;

    public decimal Quantity { get; set; } = 1m;

    public decimal UnitPrice { get; set; }

    public string? DiscountType { get; set; }

    public decimal? DiscountRate { get; set; }

    public decimal DiscountAmount { get; set; }

    public string? TaxType { get; set; }

    public decimal? TaxRate { get; set; }

    public decimal TaxAmount { get; set; }

    public decimal TotalAmount { get; set; }

    public string? HSNSAC { get; set; }
}
