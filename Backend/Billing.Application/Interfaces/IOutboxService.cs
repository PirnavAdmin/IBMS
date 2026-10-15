using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IOutboxService
{
    Task<OutboxMessage> PublishEventAsync(int tenantId, string eventType, object payload, string? eventId = null);
    Task<int> ProcessPendingOutboxMessagesAsync(CancellationToken cancellationToken = default);
    Task<int> ProcessPendingRetriesAsync(CancellationToken cancellationToken = default);
}
