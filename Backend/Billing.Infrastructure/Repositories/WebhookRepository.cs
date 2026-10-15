using System.Text.Json;
using Billing.Application.Interfaces;
using Billing.Contracts.Webhook;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Repositories;

public class WebhookRepository : IWebhookRepository
{
    private readonly BillingDbContext _dbContext;

    public WebhookRepository(BillingDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<Webhook?> GetByIdAsync(int id, int tenantId)
    {
        return await _dbContext.Webhooks
            .Include(w => w.Application)
            .FirstOrDefaultAsync(w => w.Id == id && w.TenantId == tenantId);
    }

    public async Task<List<Webhook>> GetActiveByEventAsync(int tenantId, string eventType)
    {
        var activeWebhooks = await _dbContext.Webhooks
            .AsNoTracking()
            .Where(w => w.TenantId == tenantId && w.Status == "Active")
            .ToListAsync();

        return activeWebhooks.Where(w =>
        {
            try
            {
                var events = JsonSerializer.Deserialize<List<string>>(w.SubscribedEventsJson);
                return events != null && (events.Contains("*") || events.Contains(eventType, StringComparer.OrdinalIgnoreCase));
            }
            catch
            {
                return false;
            }
        }).ToList();
    }

    public async Task<(List<Webhook> Items, int TotalCount)> GetPagedListAsync(WebhookQueryParameters query, int tenantId)
    {
        var q = _dbContext.Webhooks
            .Include(w => w.Application)
            .AsNoTracking()
            .Where(w => w.TenantId == tenantId);

        if (!string.IsNullOrWhiteSpace(query.Status))
        {
            q = q.Where(w => w.Status == query.Status.Trim());
        }

        if (query.ApplicationId.HasValue)
        {
            q = q.Where(w => w.ApplicationId == query.ApplicationId.Value);
        }

        if (!string.IsNullOrWhiteSpace(query.SearchTerm))
        {
            var term = query.SearchTerm.Trim();
            q = q.Where(w => EF.Functions.Like(w.Name, $"%{term}%") || EF.Functions.Like(w.TargetUrl, $"%{term}%"));
        }

        if (!string.IsNullOrWhiteSpace(query.EventType))
        {
            var eventType = query.EventType.Trim();
            q = q.Where(w => EF.Functions.Like(w.SubscribedEventsJson, $"%{eventType}%") || EF.Functions.Like(w.SubscribedEventsJson, "%\"*\"%"));
        }

        var totalCount = await q.CountAsync();

        var page = query.PageNumber > 0 ? query.PageNumber : 1;
        var size = query.PageSize > 0 ? query.PageSize : 20;

        var items = await q
            .OrderByDescending(w => w.CreatedAtUtc)
            .Skip((page - 1) * size)
            .Take(size)
            .ToListAsync();

        return (items, totalCount);
    }

    public async Task<Webhook> AddAsync(Webhook webhook)
    {
        await _dbContext.Webhooks.AddAsync(webhook);
        await _dbContext.SaveChangesAsync();
        return webhook;
    }

    public async Task UpdateAsync(Webhook webhook)
    {
        webhook.UpdatedAtUtc = DateTime.UtcNow;
        _dbContext.Webhooks.Update(webhook);
        await _dbContext.SaveChangesAsync();
    }

    public async Task DeleteAsync(Webhook webhook)
    {
        _dbContext.Webhooks.Remove(webhook);
        await _dbContext.SaveChangesAsync();
    }
}
