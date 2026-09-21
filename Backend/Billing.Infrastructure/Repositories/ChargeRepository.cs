using Billing.Application.Interfaces;
using Billing.Domain.Entities;
using Billing.Domain.Enums;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Repositories;

public class ChargeRepository : IChargeRepository
{
    private readonly BillingDbContext _context;

    public ChargeRepository(BillingDbContext context)
    {
        _context = context;
    }

    public async Task<ChargeConfiguration?> GetByIdAsync(int id, int tenantId)
    {
        return await _context.Set<ChargeConfiguration>()
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == id && c.TenantId == tenantId);
    }

    public async Task<ChargeConfiguration?> GetByIdForUpdateAsync(int id, int tenantId)
    {
        return await _context.Set<ChargeConfiguration>()
            .FirstOrDefaultAsync(c => c.Id == id && c.TenantId == tenantId);
    }

    public async Task<ChargeConfiguration?> GetByCodeAsync(string code, int tenantId)
    {
        var normalized = code.Trim().ToUpperInvariant();
        return await _context.Set<ChargeConfiguration>()
            .FirstOrDefaultAsync(c => c.TenantId == tenantId && c.Code.ToUpper() == normalized);
    }

    public async Task<List<ChargeConfiguration>> GetAllAsync(int tenantId, bool? activeOnly = null, string? chargeType = null)
    {
        var query = _context.Set<ChargeConfiguration>()
            .AsNoTracking()
            .Where(c => c.TenantId == tenantId);

        if (activeOnly.HasValue && activeOnly.Value)
        {
            query = query.Where(c => c.Status == "Active");
        }

        if (!string.IsNullOrWhiteSpace(chargeType) && Enum.TryParse<ChargeType>(chargeType, true, out var parsedType))
        {
            query = query.Where(c => c.ChargeType == parsedType);
        }

        return await query.OrderBy(c => c.Name).ToListAsync();
    }

    public async Task<ChargeConfiguration> AddAsync(ChargeConfiguration charge)
    {
        _context.Set<ChargeConfiguration>().Add(charge);
        await _context.SaveChangesAsync();
        return charge;
    }

    public async Task<ChargeConfiguration> UpdateAsync(ChargeConfiguration charge)
    {
        var entry = _context.Entry(charge);
        if (entry.State == EntityState.Detached)
        {
            _context.Set<ChargeConfiguration>().Update(charge);
        }
        await _context.SaveChangesAsync();
        return charge;
    }

    public async Task<bool> DeleteAsync(int id, int tenantId)
    {
        var entity = await _context.Set<ChargeConfiguration>()
            .FirstOrDefaultAsync(c => c.Id == id && c.TenantId == tenantId);

        if (entity == null) return false;

        _context.Set<ChargeConfiguration>().Remove(entity);
        await _context.SaveChangesAsync();
        return true;
    }
}
