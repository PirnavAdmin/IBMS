namespace Billing.Contracts;

public class CustomerAddressDto
{
    public int Id { get; set; }
    public int CustomerId { get; set; }
    public int TenantId { get; set; }
    public string AddressType { get; set; } = "Billing";
    public string AddressLine1 { get; set; } = string.Empty;
    public string? AddressLine2 { get; set; }
    public string City { get; set; } = string.Empty;
    public string? State { get; set; }
    public string? PostalCode { get; set; }
    public string Country { get; set; } = string.Empty;
    public bool IsDefault { get; set; }
}
