using Billing.Contracts.Webhook;
using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IWebhookRepository
{
    Task<Webhook?> GetByIdAsync(int id, int tenantId);
    Task<List<Webhook>> GetActiveByEventAsync(int tenantId, string eventType);
    Task<(List<Webhook> Items, int TotalCount)> GetPagedListAsync(WebhookQueryParameters query, int tenantId);
    Task<Webhook> AddAsync(Webhook webhook);
    Task UpdateAsync(Webhook webhook);
    Task DeleteAsync(Webhook webhook);
}
