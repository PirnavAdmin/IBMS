using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IReminderSettingRepository
{
    Task<ReminderSetting?> GetByTenantIdAsync(int tenantId, CancellationToken cancellationToken = default);
    Task<ReminderSetting> GetOrCreateAsync(int tenantId, CancellationToken cancellationToken = default);
    Task<ReminderSetting> SaveAsync(ReminderSetting setting, CancellationToken cancellationToken = default);
}
