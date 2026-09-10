namespace Billing.Contracts;

public class CustomerDto
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public string CustomerCode { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? CompanyName { get; set; }
    public string CustomerType { get; set; } = "Business";
    public string? TaxId { get; set; }
    public string? Address { get; set; }
    public string? City { get; set; }
    public string? State { get; set; }
    public string? PostalCode { get; set; }
    public string Country { get; set; } = string.Empty;
    public string? Website { get; set; }
    public string? Notes { get; set; }
    public string Currency { get; set; } = "USD";
    public string? PaymentTerms { get; set; }
    public string Status { get; set; } = "Active";
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
    public DateTime? RowVersion { get; set; }
    public List<CustomerAddressDto> Addresses { get; set; } = new();
}
