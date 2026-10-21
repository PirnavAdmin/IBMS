using Billing.Application.Interfaces;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Repositories;

public class OutboxRepository : IOutboxRepository
{
    private readonly BillingDbContext _dbContext;

    public OutboxRepository(BillingDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<OutboxMessage> AddAsync(OutboxMessage message)
    {
        await _dbContext.OutboxMessages.AddAsync(message);
        await _dbContext.SaveChangesAsync();
        return message;
    }

    public async Task<List<OutboxMessage>> GetPendingMessagesAsync(int batchSize = 50)
    {
        return await _dbContext.OutboxMessages
            .Where(m => m.Status == "Pending" && m.RetryCount < 5)
            .OrderBy(m => m.CreatedAtUtc)
            .Take(batchSize)
            .ToListAsync();
    }

    public async Task UpdateAsync(OutboxMessage message)
    {
        _dbContext.OutboxMessages.Update(message);
        await _dbContext.SaveChangesAsync();
    }
}
