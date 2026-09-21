using Billing.Application.Interfaces;
using Billing.Domain.Entities;

namespace Billing.Tests.Unit.Fakes;

public class FakeDiscountSettingRepository : IDiscountSettingRepository
{
    private readonly List<DiscountSetting> _settings = new();
    private int _nextId = 1;

    public Task<DiscountSetting?> GetByTenantIdAsync(int tenantId)
    {
        var item = _settings.FirstOrDefault(s => s.TenantId == tenantId);
        return Task.FromResult(item);
    }

    public Task<DiscountSetting?> GetByTenantIdForUpdateAsync(int tenantId)
    {
        var item = _settings.FirstOrDefault(s => s.TenantId == tenantId);
        return Task.FromResult(item);
    }

    public Task<DiscountSetting> AddAsync(DiscountSetting setting)
    {
        setting.Id = _nextId++;
        _settings.Add(setting);
        return Task.FromResult(setting);
    }

    public Task<DiscountSetting> UpdateAsync(DiscountSetting setting)
    {
        var existing = _settings.FirstOrDefault(s => s.Id == setting.Id && s.TenantId == setting.TenantId);
        if (existing != null)
        {
            _settings.Remove(existing);
            _settings.Add(setting);
        }
        return Task.FromResult(setting);
    }
}
