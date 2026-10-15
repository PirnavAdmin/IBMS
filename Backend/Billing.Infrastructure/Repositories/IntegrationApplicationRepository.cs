using Billing.Application.Interfaces;
using Billing.Contracts.Webhook;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Repositories;

public class IntegrationApplicationRepository : IIntegrationApplicationRepository
{
    private readonly BillingDbContext _dbContext;

    public IntegrationApplicationRepository(BillingDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<IntegrationApplication?> GetByIdAsync(int id, int tenantId)
    {
        return await _dbContext.IntegrationApplications
            .Include(a => a.Webhooks)
            .FirstOrDefaultAsync(a => a.Id == id && a.TenantId == tenantId);
    }

    public async Task<IntegrationApplication?> GetByClientIdAsync(string clientId)
    {
        return await _dbContext.IntegrationApplications
            .Include(a => a.Webhooks)
            .FirstOrDefaultAsync(a => a.ClientId == clientId);
    }

    public async Task<(List<IntegrationApplication> Items, int TotalCount)> GetPagedListAsync(IntegrationQueryParameters query, int tenantId)
    {
        var q = _dbContext.IntegrationApplications
            .Include(a => a.Webhooks)
            .AsNoTracking()
            .Where(a => a.TenantId == tenantId);

        if (!string.IsNullOrWhiteSpace(query.Status))
        {
            q = q.Where(a => a.Status == query.Status.Trim());
        }

        if (!string.IsNullOrWhiteSpace(query.SearchTerm))
        {
            var term = query.SearchTerm.Trim();
            q = q.Where(a => EF.Functions.Like(a.Name, $"%{term}%") || EF.Functions.Like(a.ClientId, $"%{term}%"));
        }

        var totalCount = await q.CountAsync();

        var page = query.PageNumber > 0 ? query.PageNumber : 1;
        var size = query.PageSize > 0 ? query.PageSize : 20;

        var items = await q
            .OrderByDescending(a => a.CreatedAtUtc)
            .Skip((page - 1) * size)
            .Take(size)
            .ToListAsync();

        return (items, totalCount);
    }

    public async Task<IntegrationApplication> AddAsync(IntegrationApplication app)
    {
        await _dbContext.IntegrationApplications.AddAsync(app);
        await _dbContext.SaveChangesAsync();
        return app;
    }

    public async Task UpdateAsync(IntegrationApplication app)
    {
        app.UpdatedAtUtc = DateTime.UtcNow;
        _dbContext.IntegrationApplications.Update(app);
        await _dbContext.SaveChangesAsync();
    }

    public async Task DeleteAsync(IntegrationApplication app)
    {
        _dbContext.IntegrationApplications.Remove(app);
        await _dbContext.SaveChangesAsync();
    }
}
