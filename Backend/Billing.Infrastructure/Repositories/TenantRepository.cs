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
}
