namespace Billing.Domain.Entities;

public class CustomerAddress
{
    public int Id { get; set; }

    public int TenantId { get; set; } = 1;
    public Tenant? Tenant { get; set; }

    public int CustomerId { get; set; }
    public Customer? Customer { get; set; }

    /// <summary>
    /// Address type: "Billing" or "Shipping"
    /// </summary>
    public string AddressType { get; set; } = "Billing";

    public string AddressLine1 { get; set; } = string.Empty;

    public string? AddressLine2 { get; set; }

    public string City { get; set; } = string.Empty;

    public string? State { get; set; }

    public string? PostalCode { get; set; }

    public string Country { get; set; } = string.Empty;

    public string IsDefaultStatus { get; set; } = "Non-Default";

    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    public bool IsDefault
    {
        get => string.Equals(IsDefaultStatus, "Default", StringComparison.OrdinalIgnoreCase);
        set => IsDefaultStatus = value ? "Default" : "Non-Default";
    }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAtUtc { get; set; }
}
