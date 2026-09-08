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

    public bool IsDefault { get; set; } = false;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAtUtc { get; set; }
}
