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
    public string Unit { get; set; } = "unit";
    public decimal Price { get; set; }
    public string Currency { get; set; } = "INR";
    public string? TaxCategory { get; set; }
    public string? HsnSacCode { get; set; }
    public bool DiscountAllowed { get; set; } = true;
    public string Status { get; set; } = "Active";
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
    public string? RowVersion { get; set; }
}
