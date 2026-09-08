namespace Billing.Contracts;

public class TenantDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string TenantCode { get; set; } = string.Empty;
    public string? CompanyEmail { get; set; }
    public string? Phone { get; set; }
    public string? TaxId { get; set; }
    public string? Address { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}
