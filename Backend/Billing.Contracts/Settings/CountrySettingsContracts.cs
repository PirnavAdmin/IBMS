namespace Billing.Contracts.Settings;

public class CountryItemDto
{
    public string Country { get; set; } = string.Empty;
    public string CountryCode { get; set; } = string.Empty;
    public string PhoneCode { get; set; } = string.Empty;
    public string Currency { get; set; } = string.Empty;
}

public class UpdateCountrySettingsRequest
{
    public List<CountryItemDto> Countries { get; set; } = new();
}

public class CountrySettingsResponseDto
{
    public int TenantId { get; set; }
    public List<CountryItemDto> Countries { get; set; } = new();
    public DateTime UpdatedAtUtc { get; set; }
}
