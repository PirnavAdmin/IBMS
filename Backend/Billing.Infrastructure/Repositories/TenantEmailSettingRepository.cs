using System.Threading;
using System.Threading.Tasks;
using Billing.Application.Interfaces;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Repositories;

public class TenantEmailSettingRepository : ITenantEmailSettingRepository
{
    private readonly BillingDbContext _dbContext;

    public TenantEmailSettingRepository(BillingDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<TenantEmailSetting?> GetByTenantIdAsync(int tenantId, CancellationToken cancellationToken = default)
    {
        return await _dbContext.TenantEmailSettings
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.TenantId == tenantId, cancellationToken);
    }

    public async Task<TenantEmailSetting> AddAsync(TenantEmailSetting setting, CancellationToken cancellationToken = default)
    {
        await _dbContext.TenantEmailSettings.AddAsync(setting, cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);
        return setting;
    }

    public async Task<TenantEmailSetting> UpdateAsync(TenantEmailSetting setting, CancellationToken cancellationToken = default)
    {
        _dbContext.TenantEmailSettings.Update(setting);
        await _dbContext.SaveChangesAsync(cancellationToken);
        return setting;
    }

    public async Task<bool> DeleteAsync(int tenantId, CancellationToken cancellationToken = default)
    {
        var existing = await _dbContext.TenantEmailSettings
            .FirstOrDefaultAsync(s => s.TenantId == tenantId, cancellationToken);

        if (existing == null) return false;

        _dbContext.TenantEmailSettings.Remove(existing);
        await _dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }
}
