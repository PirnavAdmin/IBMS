namespace Billing.Contracts;

public class UpdateCustomerRequest
{
    public string? CustomerCode { get; set; }
    public string? Name { get; set; }
    public string? Email { get; set; }
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
    public string? Currency { get; set; }
    public string? PaymentTerms { get; set; }
    public string? Status { get; set; }
    public bool? IsActive { get; set; }
    public DateTime? RowVersion { get; set; }
    public List<CustomerAddressDto>? Addresses { get; set; }
}
