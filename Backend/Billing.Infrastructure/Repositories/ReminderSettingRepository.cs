using Billing.Application.Interfaces;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Repositories;

public class ReminderSettingRepository : IReminderSettingRepository
{
    private readonly BillingDbContext _dbContext;

    public ReminderSettingRepository(BillingDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<ReminderSetting?> GetByTenantIdAsync(int tenantId, CancellationToken cancellationToken = default)
    {
        return await _dbContext.ReminderSettings
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.TenantId == tenantId, cancellationToken);
    }

    public async Task<ReminderSetting> GetOrCreateAsync(int tenantId, CancellationToken cancellationToken = default)
    {
        var existing = await GetByTenantIdAsync(tenantId, cancellationToken);
        if (existing != null)
            return existing;

        var created = new ReminderSetting
        {
            TenantId = tenantId,
            PartialPaymentReminderEnabled = true,
            PartialPaymentIntervalValue = 7,
            PartialPaymentIntervalUnit = "Days",
            OverdueReminderEnabled = true,
            OverdueReminderIntervalDays = 1,
            UpcomingDueReminderEnabled = true,
            CreatedAtUtc = DateTime.UtcNow
        };

        try
        {
            return await SaveAsync(created, cancellationToken);
        }
        catch (DbUpdateException)
        {
            _dbContext.Entry(created).State = EntityState.Detached;
            return await GetByTenantIdAsync(tenantId, cancellationToken) ?? created;
        }
    }

    public async Task<ReminderSetting> SaveAsync(ReminderSetting setting, CancellationToken cancellationToken = default)
    {
        if (setting.Id == 0)
        {
            await _dbContext.ReminderSettings.AddAsync(setting, cancellationToken);
        }
        else
        {
            var tracked = await _dbContext.ReminderSettings
                .FirstOrDefaultAsync(r => r.Id == setting.Id && r.TenantId == setting.TenantId, cancellationToken);
            if (tracked != null)
            {
                tracked.PartialPaymentReminderEnabled = setting.PartialPaymentReminderEnabled;
                tracked.PartialPaymentIntervalValue = setting.PartialPaymentIntervalValue;
                tracked.PartialPaymentIntervalUnit = setting.PartialPaymentIntervalUnit;
                tracked.OverdueReminderEnabled = setting.OverdueReminderEnabled;
                tracked.OverdueReminderIntervalDays = setting.OverdueReminderIntervalDays;
                tracked.UpcomingDueReminderEnabled = setting.UpcomingDueReminderEnabled;
                tracked.UpdatedAtUtc = setting.UpdatedAtUtc;
                tracked.UpdatedBy = setting.UpdatedBy;
            }
            else
            {
                _dbContext.ReminderSettings.Update(setting);
            }
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        return setting;
    }
}
