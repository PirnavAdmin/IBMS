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

    public Task<(List<Tenant> Items, int TotalCount)> GetPagedAsync(string? search, string? status, int pageNumber, int pageSize)
    {
        var query = Tenants.AsEnumerable();
        if (!string.IsNullOrWhiteSpace(search))
        {
            query = query.Where(t => t.Name.Contains(search, StringComparison.OrdinalIgnoreCase) || t.TenantCode.Contains(search, StringComparison.OrdinalIgnoreCase));
        }
        if (!string.IsNullOrWhiteSpace(status))
        {
            query = query.Where(t => string.Equals(t.Status, status, StringComparison.OrdinalIgnoreCase));
        }
        var list = query.ToList();
        var page = pageNumber <= 0 ? 1 : pageNumber;
        var size = pageSize <= 0 ? 10 : pageSize;
        return Task.FromResult((list.Skip((page - 1) * size).Take(size).ToList(), list.Count));
    }

    public Task<int> GetCountByStatusAsync(string? status = null)
    {
        if (string.IsNullOrWhiteSpace(status))
        {
            return Task.FromResult(Tenants.Count);
        }
        return Task.FromResult(Tenants.Count(t => string.Equals(t.Status, status, StringComparison.OrdinalIgnoreCase)));
    }

    public Task<List<User>> GetTenantAdminsAsync(int tenantId)
    {
        return Task.FromResult(new List<User>());
    }
}
