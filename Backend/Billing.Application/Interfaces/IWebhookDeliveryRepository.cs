using Billing.Contracts.Webhook;
using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IWebhookDeliveryRepository
{
    Task<WebhookDelivery?> GetByIdAsync(int id, int tenantId);
    Task<(List<WebhookDelivery> Items, int TotalCount)> GetPagedListAsync(WebhookDeliveryQueryParameters query, int tenantId);
    Task<List<WebhookDelivery>> GetPendingRetriesAsync(int batchSize = 50);
    Task<List<WebhookDelivery>> ClaimPendingRetriesAsync(string instanceId, TimeSpan leaseDuration, int batchSize = 50, CancellationToken cancellationToken = default);
    Task<WebhookDelivery> AddAsync(WebhookDelivery delivery);
    Task UpdateAsync(WebhookDelivery delivery);
}
