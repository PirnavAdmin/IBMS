namespace Billing.Domain.Entities;

public class Customer
{
    public int Id { get; set; }

    public int TenantId { get; set; } = 1;
    public Tenant? Tenant { get; set; }

    public string CustomerCode { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string Email { get; set; } = string.Empty;

    public string? Phone { get; set; }

    public string? CompanyName { get; set; }

    public string? TaxId { get; set; }

    public string? Address { get; set; }

    public string? City { get; set; }

    public string? State { get; set; }

    public string? PostalCode { get; set; }

    public string? Country { get; set; }

    public string? Website { get; set; }

    public string? Notes { get; set; }

    public string Currency { get; set; } = "USD";

    public string? PaymentTerms { get; set; }

    public string Status { get; set; } = "Active";

    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    public bool IsActive
    {
        get => string.Equals(Status, "Active", StringComparison.OrdinalIgnoreCase);
        set => Status = value ? "Active" : "Inactive";
    }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAtUtc { get; set; }

    public DateTime RowVersion { get; set; }

    public ICollection<CustomerAddress> Addresses { get; set; } = new List<CustomerAddress>();
}
