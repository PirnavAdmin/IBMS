using Billing.Application.Interfaces;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Repositories;

public class TenantRepository : ITenantRepository
{
    private readonly BillingDbContext _context;

    public TenantRepository(BillingDbContext context)
    {
        _context = context;
    }

    public async Task<Tenant?> GetByIdAsync(int id)
    {
        return await _context.Tenants
            .Include(t => t.Users)
            .FirstOrDefaultAsync(t => t.Id == id);
    }

    public async Task<Tenant?> GetByCodeAsync(string tenantCode)
    {
        var code = tenantCode.Trim().ToLower();
        return await _context.Tenants
            .Include(t => t.Users)
            .FirstOrDefaultAsync(t => t.TenantCode.ToLower() == code);
    }

    public async Task<List<Tenant>> GetAllAsync()
    {
        return await _context.Tenants
            .OrderByDescending(t => t.CreatedAtUtc)
            .ToListAsync();
    }

    public async Task CreateAsync(Tenant tenant)
    {
        await _context.Tenants.AddAsync(tenant);
        await _context.SaveChangesAsync();
    }

    public async Task UpdateAsync(Tenant tenant)
    {
        _context.Tenants.Update(tenant);
        await _context.SaveChangesAsync();
    }

    public async Task<bool> ExistsByCodeAsync(string tenantCode)
    {
        var code = tenantCode.Trim().ToLower();
        return await _context.Tenants.AnyAsync(t => t.TenantCode.ToLower() == code);
    }

    public async Task<(List<Tenant> Items, int TotalCount)> GetPagedAsync(string? search, string? status, int pageNumber, int pageSize)
    {
        var query = _context.Tenants.AsNoTracking().Include(t => t.Users).AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            query = query.Where(t => t.Name.ToLower().Contains(s) ||
                                     t.TenantCode.ToLower().Contains(s) ||
                                     (t.CompanyEmail != null && t.CompanyEmail.ToLower().Contains(s)) ||
                                     (t.TaxId != null && t.TaxId.ToLower().Contains(s)));
        }

        if (!string.IsNullOrWhiteSpace(status))
        {
            var normalizedStatus = status.Trim().ToLower();
            query = query.Where(t => t.Status.ToLower() == normalizedStatus);
        }

        var totalCount = await query.CountAsync();

        var items = await query
            .OrderByDescending(t => t.CreatedAtUtc)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return (items, totalCount);
    }

    public async Task<int> GetCountByStatusAsync(string? status = null)
    {
        if (string.IsNullOrWhiteSpace(status))
        {
            return await _context.Tenants.CountAsync();
        }

        var normalizedStatus = status.Trim().ToLower();
        return await _context.Tenants.CountAsync(t => t.Status.ToLower() == normalizedStatus);
    }

    public async Task<List<User>> GetTenantAdminsAsync(int tenantId)
    {
        return await _context.Users
            .AsNoTracking()
            .Where(u => u.TenantId == tenantId &&
                        (u.RolesString.Contains("TenantAdmin") || u.RolesString.Contains("Admin")))
            .OrderBy(u => u.Name)
            .ToListAsync();
    }
}
