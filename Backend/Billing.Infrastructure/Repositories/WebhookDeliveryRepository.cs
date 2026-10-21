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
        return await _dbContext.WebhookDeliveries
            .Include(d => d.Webhook)
            .Where(d => d.Status == "Retrying"
                        && d.NextRetryUtc.HasValue
                        && d.NextRetryUtc <= DateTime.UtcNow
                        && d.AttemptNumber < d.MaxAttempts)
            .OrderBy(d => d.NextRetryUtc)
            .Take(batchSize)
            .ToListAsync();
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
