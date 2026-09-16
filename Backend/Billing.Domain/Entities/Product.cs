using System.ComponentModel.DataAnnotations.Schema;

namespace Billing.Domain.Entities;

public class Product
{
    public int Id { get; set; }

    public int TenantId { get; set; } = 1;
    public Tenant? Tenant { get; set; }

    public string ProductCode { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string? Description { get; set; }

    public string Type { get; set; } = "Product";

    public int? CategoryId { get; set; }
    public ProductCategory? Category { get; set; }

    public string Unit { get; set; } = "unit";

    public decimal Price { get; set; } = 0.00m;

    public string Currency { get; set; } = "INR";

    public string? TaxCategory { get; set; }

    public string? HsnSacCode { get; set; }

    public bool DiscountAllowed { get; set; } = true;
    public decimal? DiscountPercent { get; set; } = 0.00m;

    public string Status { get; set; } = "Active";

    [NotMapped]
    public bool IsActive
    {
        get => string.Equals(Status, "Active", StringComparison.OrdinalIgnoreCase);
        set => Status = value ? "Active" : "Inactive";
    }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAtUtc { get; set; }

    public DateTime RowVersion { get; set; }
}