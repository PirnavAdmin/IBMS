using System.ComponentModel.DataAnnotations.Schema;

namespace Billing.Domain.Entities;

public class ProductCategory
{
    public int Id { get; set; }

    public int TenantId { get; set; } = 1;
    public Tenant? Tenant { get; set; }

    public string Name { get; set; } = string.Empty;

    public string? Description { get; set; }

    public string Status { get; set; } = "Active";

    [NotMapped]
    public bool IsActive
    {
        get => string.Equals(Status, "Active", StringComparison.OrdinalIgnoreCase);
        set => Status = value ? "Active" : "Inactive";
    }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public ICollection<Product> Products { get; set; } = new List<Product>();
}
