namespace Billing.Application.Interfaces;

using Billing.Contracts;
using Billing.Contracts.Settings;

public interface ICountrySettingService
{
    Task<ApiResponse<CountrySettingsResponseDto>> GetSettingsAsync(int tenantId);
    Task<ApiResponse<CountrySettingsResponseDto>> UpdateSettingsAsync(int tenantId, UpdateCountrySettingsRequest request);
}
