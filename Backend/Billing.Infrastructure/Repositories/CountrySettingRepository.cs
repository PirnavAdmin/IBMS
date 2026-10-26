namespace Billing.Infrastructure.Repositories;

using Billing.Application.Interfaces;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

public class CountrySettingRepository : ICountrySettingRepository
{
    private readonly BillingDbContext _dbContext;

    public CountrySettingRepository(BillingDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<CountrySetting?> GetByTenantIdAsync(int tenantId)
    {
        return await _dbContext.CountrySettings
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.TenantId == tenantId);
    }

    public async Task<CountrySetting> SaveAsync(CountrySetting setting)
    {
        if (setting.Id == 0)
        {
            await _dbContext.CountrySettings.AddAsync(setting);
        }
        else
        {
            _dbContext.CountrySettings.Update(setting);
        }

        await _dbContext.SaveChangesAsync();
        return setting;
    }
}
