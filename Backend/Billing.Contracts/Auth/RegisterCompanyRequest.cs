namespace Billing.Contracts;

public class RegisterCompanyRequest
{
    public string CompanyName { get; set; } = string.Empty;
    public string TenantCode { get; set; } = string.Empty;
    public string OwnerName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? TaxId { get; set; }
    public string? Address { get; set; }
}
