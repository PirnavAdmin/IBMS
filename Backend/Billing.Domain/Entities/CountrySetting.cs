namespace Billing.Domain.Entities;

public class CountrySetting
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public string CountriesJson { get; set; } = "[]";
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
