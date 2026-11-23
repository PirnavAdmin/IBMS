namespace Billing.Contracts;

public class CreateCustomerRequest
{
    public string? CustomerCode { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    [StringLength(256, ErrorMessage = "Company name must not exceed 256 characters.")]
    [RegularExpression(@"^[\p{L}\p{M}0-9\s.,&'\-()]+$", ErrorMessage = "Company name can only contain letters, numbers, spaces, and standard characters (., &, ', -, ()).")]
    public string? CompanyName { get; set; }
    public string? CustomerType { get; set; }
    public string? TaxId { get; set; }
    [RegularExpression(@"^[\p{L}\p{M}0-9\s,.\-/#':()]+$", ErrorMessage = "Please enter a valid street address. Unsupported special characters are not allowed.")]
    public string? Address { get; set; }
    public string? City { get; set; }
    public string? State { get; set; }
    public string? PostalCode { get; set; }
    public string? Country { get; set; }
    public string? Website { get; set; }
    public string? Notes { get; set; }
    public string Currency { get; set; } = "INR";
    public string? PaymentTerms { get; set; }
    public List<CustomerAddressDto>? Addresses { get; set; }
}
