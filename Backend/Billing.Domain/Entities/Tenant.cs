namespace Billing.Domain.Entities;

public class Tenant
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string TenantCode { get; set; } = string.Empty;

    public string? CompanyEmail { get; set; }

    public string? Phone { get; set; }

    public string? TaxId { get; set; }

    public string? Address { get; set; }

    public string Status { get; set; } = "Active";

    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    public bool IsActive
    {
        get => string.Equals(Status, "Active", StringComparison.OrdinalIgnoreCase);
        set => Status = value ? "Active" : "Inactive";
    }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAtUtc { get; set; }

    public ICollection<User> Users { get; set; } = new List<User>();
}
