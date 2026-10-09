namespace Billing.Contracts;

public class ProductDto
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public string ProductCode { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Type { get; set; } = "Product";
    public int? CategoryId { get; set; }
    public string? CategoryName { get; set; }
    public string? Category => CategoryName;
    public string Unit { get; set; } = "unit";
    public decimal Price { get; set; }
    public decimal UnitPrice { get; set; }
    public string Currency { get; set; } = "INR";
    public string? TaxCategory { get; set; }
    public string? HsnSacCode { get; set; }
    public string? HsnSac => HsnSacCode;
    public bool DiscountAllowed { get; set; } = true;
    public decimal? DiscountPercent { get; set; } = 0.00m;
    public string DiscountType { get; set; } = "None";
    public decimal DiscountValue { get; set; } = 0.00m;
    public decimal DiscountAmount { get; set; } = 0.00m;
    public decimal TaxRate { get; set; } = 0.00m;
    public decimal TaxAmount { get; set; } = 0.00m;
    public bool IsTaxExempt { get; set; }
    public bool IsTaxInclusive { get; set; }
    public decimal FinalUnitPrice { get; set; }
    public string Status { get; set; } = "Active";
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
    public string? RowVersion { get; set; }
    public decimal? DefaultTaxAmount { get; set; }
    public decimal? DefaultFinalPrice { get; set; }
}

