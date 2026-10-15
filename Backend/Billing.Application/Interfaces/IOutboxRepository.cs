using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IOutboxRepository
{
    Task<OutboxMessage> AddAsync(OutboxMessage message);
    Task<List<OutboxMessage>> GetPendingMessagesAsync(int batchSize = 50);
    Task UpdateAsync(OutboxMessage message);
}
