using Billing.Application.Interfaces;
using Billing.Domain.Entities;
using Billing.Domain.Enums;

namespace Billing.Tests.Unit.Fakes;

public class FakeChargeRepository : IChargeRepository
{
    private readonly List<ChargeConfiguration> _charges = new();
    private int _nextId = 1;

    public Task<ChargeConfiguration?> GetByIdAsync(int id, int tenantId)
    {
        var charge = _charges.FirstOrDefault(c => c.Id == id && c.TenantId == tenantId);
        return Task.FromResult(charge);
    }

    public Task<ChargeConfiguration?> GetByIdForUpdateAsync(int id, int tenantId)
    {
        var charge = _charges.FirstOrDefault(c => c.Id == id && c.TenantId == tenantId);
        return Task.FromResult(charge);
    }

    public Task<ChargeConfiguration?> GetByCodeAsync(string code, int tenantId)
    {
        var normalized = code.Trim().ToUpperInvariant();
        var charge = _charges.FirstOrDefault(c => c.TenantId == tenantId && c.Code.ToUpper() == normalized);
        return Task.FromResult(charge);
    }

    public Task<List<ChargeConfiguration>> GetAllAsync(int tenantId, bool? activeOnly = null, string? chargeType = null)
    {
        var query = _charges.Where(c => c.TenantId == tenantId);

        if (activeOnly.HasValue && activeOnly.Value)
        {
            query = query.Where(c => c.Status == "Active");
        }

        if (!string.IsNullOrWhiteSpace(chargeType) && Enum.TryParse<ChargeType>(chargeType, true, out var parsed))
        {
            query = query.Where(c => c.ChargeType == parsed);
        }

        return Task.FromResult(query.OrderBy(c => c.Name).ToList());
    }

    public Task<ChargeConfiguration> AddAsync(ChargeConfiguration charge)
    {
        charge.Id = _nextId++;
        _charges.Add(charge);
        return Task.FromResult(charge);
    }

    public Task<ChargeConfiguration> UpdateAsync(ChargeConfiguration charge)
    {
        var existing = _charges.FirstOrDefault(c => c.Id == charge.Id && c.TenantId == charge.TenantId);
        if (existing != null)
        {
            _charges.Remove(existing);
            _charges.Add(charge);
        }
        return Task.FromResult(charge);
    }

    public Task<bool> DeleteAsync(int id, int tenantId)
    {
        var existing = _charges.FirstOrDefault(c => c.Id == id && c.TenantId == tenantId);
        if (existing == null) return Task.FromResult(false);
        _charges.Remove(existing);
        return Task.FromResult(true);
    }
}
