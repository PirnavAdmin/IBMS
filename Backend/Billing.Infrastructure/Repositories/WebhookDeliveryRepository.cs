using Billing.Application.Interfaces;
using Billing.Contracts.Webhook;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Repositories;

public class WebhookDeliveryRepository : IWebhookDeliveryRepository
{
    private readonly BillingDbContext _dbContext;

    public WebhookDeliveryRepository(BillingDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<WebhookDelivery?> GetByIdAsync(int id, int tenantId)
    {
        return await _dbContext.WebhookDeliveries
            .Include(d => d.Webhook)
            .ThenInclude(w => w!.Application)
            .FirstOrDefaultAsync(d => d.Id == id && d.TenantId == tenantId);
    }

    public async Task<(List<WebhookDelivery> Items, int TotalCount)> GetPagedListAsync(WebhookDeliveryQueryParameters query, int tenantId)
    {
        var q = _dbContext.WebhookDeliveries
            .Include(d => d.Webhook)
            .AsNoTracking()
            .Where(d => d.TenantId == tenantId);

        if (query.WebhookId.HasValue)
        {
            q = q.Where(d => d.WebhookId == query.WebhookId.Value);
        }

        if (!string.IsNullOrWhiteSpace(query.EventType))
        {
            q = q.Where(d => d.EventType == query.EventType.Trim());
        }

        if (!string.IsNullOrWhiteSpace(query.Status))
        {
            q = q.Where(d => d.Status == query.Status.Trim());
        }

        if (query.StartDate.HasValue)
        {
            q = q.Where(d => d.CreatedAtUtc >= query.StartDate.Value);
        }

        if (query.EndDate.HasValue)
        {
            q = q.Where(d => d.CreatedAtUtc <= query.EndDate.Value);
        }

        var totalCount = await q.CountAsync();

        var page = query.PageNumber > 0 ? query.PageNumber : 1;
        var size = query.PageSize > 0 ? query.PageSize : 20;

        var items = await q
            .OrderByDescending(d => d.CreatedAtUtc)
            .Skip((page - 1) * size)
            .Take(size)
            .ToListAsync();

        return (items, totalCount);
    }

    public async Task<List<WebhookDelivery>> GetPendingRetriesAsync(int batchSize = 50)
    {
        var now = DateTime.UtcNow;
        return await _dbContext.WebhookDeliveries
            .Include(d => d.Webhook)
            .ThenInclude(w => w!.Application)
            .Where(d => d.Status == "Retrying"
                        && d.NextRetryUtc.HasValue
                        && d.NextRetryUtc <= now
                        && d.AttemptNumber < d.MaxAttempts
                        && (!d.LockedUntilUtc.HasValue || d.LockedUntilUtc <= now))
            .OrderBy(d => d.NextRetryUtc)
            .Take(batchSize)
            .ToListAsync();
    }

    public async Task<List<WebhookDelivery>> ClaimPendingRetriesAsync(
        string instanceId,
        TimeSpan leaseDuration,
        int batchSize = 50,
        CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var leaseUntil = now.Add(leaseDuration);

        var candidateIds = await _dbContext.WebhookDeliveries
            .Where(d => d.Status == "Retrying"
                        && d.NextRetryUtc.HasValue
                        && d.NextRetryUtc <= now
                        && d.AttemptNumber < d.MaxAttempts
                        && (!d.LockedUntilUtc.HasValue || d.LockedUntilUtc <= now))
            .OrderBy(d => d.NextRetryUtc)
            .Take(batchSize)
            .Select(d => d.Id)
            .ToListAsync(cancellationToken);

        if (candidateIds.Count == 0)
        {
            return new List<WebhookDelivery>();
        }

        if (_dbContext.Database.IsRelational())
        {
            var claimedCount = await _dbContext.WebhookDeliveries
                .Where(d => candidateIds.Contains(d.Id)
                            && d.Status == "Retrying"
                            && d.NextRetryUtc.HasValue
                            && d.NextRetryUtc <= now
                            && d.AttemptNumber < d.MaxAttempts
                            && (!d.LockedUntilUtc.HasValue || d.LockedUntilUtc <= now))
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(d => d.LockedByInstance, instanceId)
                    .SetProperty(d => d.LockedUntilUtc, leaseUntil),
                    cancellationToken);

            if (claimedCount == 0)
            {
                return new List<WebhookDelivery>();
            }

            return await _dbContext.WebhookDeliveries
                .Include(d => d.Webhook)
                .ThenInclude(w => w!.Application)
                .Where(d => candidateIds.Contains(d.Id)
                            && d.LockedByInstance == instanceId
                            && d.Status == "Retrying")
                .OrderBy(d => d.NextRetryUtc)
                .ToListAsync(cancellationToken);
        }

        var candidates = await _dbContext.WebhookDeliveries
            .Include(d => d.Webhook)
            .ThenInclude(w => w!.Application)
            .Where(d => candidateIds.Contains(d.Id)
                        && d.Status == "Retrying"
                        && (!d.LockedUntilUtc.HasValue || d.LockedUntilUtc <= now))
            .OrderBy(d => d.NextRetryUtc)
            .ToListAsync(cancellationToken);

        foreach (var item in candidates)
        {
            item.LockedByInstance = instanceId;
            item.LockedUntilUtc = leaseUntil;
        }

        if (candidates.Count > 0)
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        return candidates;
    }

    public async Task<WebhookDelivery> AddAsync(WebhookDelivery delivery)
    {
        await _dbContext.WebhookDeliveries.AddAsync(delivery);
        await _dbContext.SaveChangesAsync();
        return delivery;
    }

    public async Task UpdateAsync(WebhookDelivery delivery)
    {
        _dbContext.WebhookDeliveries.Update(delivery);
        await _dbContext.SaveChangesAsync();
    }
}
