using Billing.Application.Interfaces;
using Billing.Domain.Entities;

namespace Billing.Tests.Unit.Fakes;

public class FakeTenantRepository : ITenantRepository
{
    public List<Tenant> Tenants { get; } = new();

    public Task<Tenant?> GetByIdAsync(int id)
    {
        return Task.FromResult(Tenants.FirstOrDefault(t => t.Id == id));
    }

    public Task<Tenant?> GetByCodeAsync(string tenantCode)
    {
        return Task.FromResult(Tenants.FirstOrDefault(t => t.TenantCode.Equals(tenantCode, StringComparison.OrdinalIgnoreCase)));
    }

    public Task<List<Tenant>> GetAllAsync()
    {
        return Task.FromResult(Tenants.ToList());
    }

    public Task CreateAsync(Tenant tenant)
    {
        if (tenant.Id == 0)
        {
            tenant.Id = Tenants.Any() ? Tenants.Max(t => t.Id) + 1 : 1;
        }
        Tenants.Add(tenant);
        return Task.CompletedTask;
    }

    public Task UpdateAsync(Tenant tenant)
    {
        var existing = Tenants.FirstOrDefault(t => t.Id == tenant.Id);
        if (existing != null)
        {
            Tenants.Remove(existing);
            Tenants.Add(tenant);
        }
        return Task.CompletedTask;
    }

    public Task<bool> ExistsByCodeAsync(string tenantCode)
    {
        return Task.FromResult(Tenants.Any(t => t.TenantCode.Equals(tenantCode, StringComparison.OrdinalIgnoreCase)));
    }
}
