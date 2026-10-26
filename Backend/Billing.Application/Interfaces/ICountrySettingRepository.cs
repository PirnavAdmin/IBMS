namespace Billing.Application.Interfaces;

using Billing.Domain.Entities;

public interface ICountrySettingRepository
{
    Task<CountrySetting?> GetByTenantIdAsync(int tenantId);
    Task<CountrySetting> SaveAsync(CountrySetting setting);
}
