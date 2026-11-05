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
            var s = search.Trim();
            query = query.Where(t => t.Name.Contains(s, StringComparison.OrdinalIgnoreCase) || t.TenantCode.Contains(s, StringComparison.OrdinalIgnoreCase));
        }
        if (!string.IsNullOrWhiteSpace(status))
        {
            query = query.Where(t => t.Status.Equals(status.Trim(), StringComparison.OrdinalIgnoreCase));
        }
        var total = query.Count();
        var page = pageNumber > 0 ? pageNumber : 1;
        var size = pageSize > 0 ? pageSize : 10;
        var items = query.Skip((page - 1) * size).Take(size).ToList();
        return Task.FromResult((items, total));
    }

    public Task<int> GetCountByStatusAsync(string? status = null)
    {
        if (string.IsNullOrWhiteSpace(status)) return Task.FromResult(Tenants.Count);
        return Task.FromResult(Tenants.Count(t => t.Status.Equals(status.Trim(), StringComparison.OrdinalIgnoreCase)));
    }

    public Task<List<User>> GetTenantAdminsAsync(int tenantId)
    {
        var tenant = Tenants.FirstOrDefault(t => t.Id == tenantId);
        if (tenant?.Users == null) return Task.FromResult(new List<User>());
        return Task.FromResult(tenant.Users.Where(u => u.Roles.Contains("TenantAdmin") || u.Roles.Contains("Admin")).ToList());
    }

    public Task<Tenant?> GetByIdempotencyKeyAsync(string idempotencyKey)
    {
        if (string.IsNullOrWhiteSpace(idempotencyKey)) return Task.FromResult<Tenant?>(null);
        return Task.FromResult(Tenants.FirstOrDefault(t => string.Equals(t.IdempotencyKey, idempotencyKey.Trim(), StringComparison.Ordinal)));
    }
}
