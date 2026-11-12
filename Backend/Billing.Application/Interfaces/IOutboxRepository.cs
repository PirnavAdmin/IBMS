using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IOutboxRepository
{
    Task<OutboxMessage> AddAsync(OutboxMessage message);
    Task<List<OutboxMessage>> GetPendingMessagesAsync(int batchSize = 50);
    Task<List<OutboxMessage>> ClaimPendingMessagesAsync(string instanceId, TimeSpan leaseDuration, int batchSize = 50, CancellationToken cancellationToken = default);
    Task<List<WebhookDelivery>> FanOutAndMarkPublishedAsync(OutboxMessage message, IReadOnlyCollection<WebhookDelivery> deliveries, DateTime processedAtUtc, CancellationToken cancellationToken = default);
    Task UpdateAsync(OutboxMessage message);
}
