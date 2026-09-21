using Billing.Application.Interfaces;
using Billing.Domain.Entities;

namespace Billing.Tests.Unit.Fakes;

public class FakeNumberingRepository : INumberingRepository
{
    private readonly List<NumberingSetting> _settings = new();
    private readonly object _lock = new();
    private int _nextId = 1;

    public Task<NumberingSetting?> GetByDocumentTypeAsync(string documentType, int tenantId)
    {
        lock (_lock)
        {
            var norm = documentType.Trim().ToLowerInvariant();
            var setting = _settings.FirstOrDefault(s => s.TenantId == tenantId && s.DocumentType.ToLower() == norm);
            return Task.FromResult(setting);
        }
    }

    public Task<List<NumberingSetting>> GetAllAsync(int tenantId)
    {
        lock (_lock)
        {
            var list = _settings.Where(s => s.TenantId == tenantId).OrderBy(s => s.DocumentType).ToList();
            return Task.FromResult(list);
        }
    }

    public Task<NumberingSetting> AddAsync(NumberingSetting setting)
    {
        lock (_lock)
        {
            setting.Id = _nextId++;
            _settings.Add(setting);
            return Task.FromResult(setting);
        }
    }

    public Task<NumberingSetting> UpdateAsync(NumberingSetting setting)
    {
        lock (_lock)
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

    public Task<long> IncrementSequenceAsync(int settingId, int tenantId)
    {
        lock (_lock)
        {
            var setting = _settings.FirstOrDefault(s => s.Id == settingId && s.TenantId == tenantId);
            if (setting == null)
            {
                throw new KeyNotFoundException($"Setting not found: {settingId}");
            }

            var allocated = setting.NextNumber;
            setting.NextNumber++;
            setting.UpdatedAtUtc = DateTime.UtcNow;
            return Task.FromResult(allocated);
        }
    }
}
