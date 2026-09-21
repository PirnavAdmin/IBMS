using Billing.Application.Interfaces;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Repositories;

public class NumberingRepository : INumberingRepository
{
    private readonly BillingDbContext _context;

    public NumberingRepository(BillingDbContext context)
    {
        _context = context;
    }

    public async Task<NumberingSetting?> GetByDocumentTypeAsync(string documentType, int tenantId)
    {
        var norm = documentType.Trim().ToLowerInvariant();
        return await _context.Set<NumberingSetting>()
            .FirstOrDefaultAsync(s => s.TenantId == tenantId && s.DocumentType.ToLower() == norm);
    }

    public async Task<List<NumberingSetting>> GetAllAsync(int tenantId)
    {
        return await _context.Set<NumberingSetting>()
            .AsNoTracking()
            .Where(s => s.TenantId == tenantId)
            .OrderBy(s => s.DocumentType)
            .ToListAsync();
    }

    public async Task<NumberingSetting> AddAsync(NumberingSetting setting)
    {
        _context.Set<NumberingSetting>().Add(setting);
        await _context.SaveChangesAsync();
        return setting;
    }

    public async Task<NumberingSetting> UpdateAsync(NumberingSetting setting)
    {
        _context.Set<NumberingSetting>().Update(setting);
        await _context.SaveChangesAsync();
        return setting;
    }

    public async Task<long> IncrementSequenceAsync(int settingId, int tenantId)
    {
        const int maxRetries = 10;
        for (var attempt = 1; attempt <= maxRetries; attempt++)
        {
            var setting = await _context.Set<NumberingSetting>()
                .FirstOrDefaultAsync(s => s.Id == settingId && s.TenantId == tenantId);

            if (setting == null)
            {
                throw new KeyNotFoundException($"Numbering setting with ID {settingId} was not found for tenant {tenantId}.");
            }

            var allocated = setting.NextNumber;
            setting.NextNumber++;
            setting.UpdatedAtUtc = DateTime.UtcNow;
            setting.RowVersion = DateTime.UtcNow;

            try
            {
                await _context.SaveChangesAsync();
                return allocated;
            }
            catch (DbUpdateConcurrencyException) when (attempt < maxRetries)
            {
                // Concurrency conflict occurred: reload entity state and retry with exponential jitter
                _context.Entry(setting).State = EntityState.Detached;
                await Task.Delay(Random.Shared.Next(10 * attempt, 30 * attempt));
            }
        }

        throw new InvalidOperationException($"Unable to allocate sequence for setting ID {settingId} due to persistent concurrency conflicts.");
    }
}
