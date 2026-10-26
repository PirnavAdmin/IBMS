namespace Billing.Application.Services;

using System.Text.Json;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Settings;
using Billing.Domain.Entities;

public class CountrySettingService : ICountrySettingService
{
    private readonly ICountrySettingRepository _repository;

    public CountrySettingService(ICountrySettingRepository repository)
    {
        _repository = repository;
    }

    public async Task<ApiResponse<CountrySettingsResponseDto>> GetSettingsAsync(int tenantId)
    {
        if (tenantId <= 0)
        {
            return ApiResponse<CountrySettingsResponseDto>.Fail("Invalid tenant context.");
        }

        var setting = await _repository.GetByTenantIdAsync(tenantId);
        if (setting == null)
        {
            return ApiResponse<CountrySettingsResponseDto>.Ok(new CountrySettingsResponseDto
            {
                TenantId = tenantId,
                Countries = new List<CountryItemDto>(),
                UpdatedAtUtc = DateTime.UtcNow
            }, "Country settings retrieved successfully.");
        }

        List<CountryItemDto> countries;
        try
        {
            countries = JsonSerializer.Deserialize<List<CountryItemDto>>(setting.CountriesJson) ?? new List<CountryItemDto>();
        }
        catch
        {
            countries = new List<CountryItemDto>();
        }

        return ApiResponse<CountrySettingsResponseDto>.Ok(new CountrySettingsResponseDto
        {
            TenantId = tenantId,
            Countries = countries,
            UpdatedAtUtc = setting.UpdatedAtUtc
        }, "Country settings retrieved successfully.");
    }

    public async Task<ApiResponse<CountrySettingsResponseDto>> UpdateSettingsAsync(int tenantId, UpdateCountrySettingsRequest request)
    {
        if (tenantId <= 0)
        {
            return ApiResponse<CountrySettingsResponseDto>.Fail("Invalid tenant context.");
        }

        if (request == null)
        {
            return ApiResponse<CountrySettingsResponseDto>.Fail("Request cannot be null.");
        }

        var countries = request.Countries ?? new List<CountryItemDto>();
        var uniqueCountries = countries
            .Where(c => !string.IsNullOrWhiteSpace(c.CountryCode))
            .GroupBy(c => c.CountryCode.Trim().ToUpperInvariant())
            .Select(g => g.First())
            .ToList();

        var json = JsonSerializer.Serialize(uniqueCountries);
        var setting = await _repository.GetByTenantIdAsync(tenantId);

        if (setting == null)
        {
            setting = new CountrySetting
            {
                TenantId = tenantId,
                CountriesJson = json,
                UpdatedAtUtc = DateTime.UtcNow
            };
        }
        else
        {
            setting.CountriesJson = json;
            setting.UpdatedAtUtc = DateTime.UtcNow;
        }

        setting = await _repository.SaveAsync(setting);

        return ApiResponse<CountrySettingsResponseDto>.Ok(new CountrySettingsResponseDto
        {
            TenantId = tenantId,
            Countries = uniqueCountries,
            UpdatedAtUtc = setting.UpdatedAtUtc
        }, "Country settings saved successfully.");
    }
}
