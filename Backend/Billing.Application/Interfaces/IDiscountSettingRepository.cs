using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IDiscountSettingRepository
{
    Task<DiscountSetting?> GetByTenantIdAsync(int tenantId);
    Task<DiscountSetting?> GetByTenantIdForUpdateAsync(int tenantId);
    Task<DiscountSetting> AddAsync(DiscountSetting setting);
    Task<DiscountSetting> UpdateAsync(DiscountSetting setting);
}
