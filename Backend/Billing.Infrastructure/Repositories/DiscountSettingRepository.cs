using Billing.Application.Interfaces;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Repositories;

public class DiscountSettingRepository : IDiscountSettingRepository
{
    private readonly BillingDbContext _context;

    public DiscountSettingRepository(BillingDbContext context)
    {
        _context = context;
    }

    public async Task<DiscountSetting?> GetByTenantIdAsync(int tenantId)
    {
        return await _context.Set<DiscountSetting>()
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.TenantId == tenantId);
    }

    public async Task<DiscountSetting?> GetByTenantIdForUpdateAsync(int tenantId)
    {
        return await _context.Set<DiscountSetting>()
            .FirstOrDefaultAsync(s => s.TenantId == tenantId);
    }

    public async Task<DiscountSetting> AddAsync(DiscountSetting setting)
    {
        _context.Set<DiscountSetting>().Add(setting);
        await _context.SaveChangesAsync();
        return setting;
    }

    public async Task<DiscountSetting> UpdateAsync(DiscountSetting setting)
    {
        var entry = _context.Entry(setting);
        if (entry.State == EntityState.Detached)
        {
            _context.Set<DiscountSetting>().Update(setting);
        }
        await _context.SaveChangesAsync();
        return setting;
    }
}
