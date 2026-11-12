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
        var now = DateTime.UtcNow;
        return await _dbContext.OutboxMessages
            .Where(m => m.Status == "Pending"
                        && m.RetryCount < 5
                        && (!m.LockedUntilUtc.HasValue || m.LockedUntilUtc <= now))
            .OrderBy(m => m.CreatedAtUtc)
            .Take(batchSize)
            .ToListAsync();
    }

    public async Task<List<OutboxMessage>> ClaimPendingMessagesAsync(
        string instanceId,
        TimeSpan leaseDuration,
        int batchSize = 50,
        CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var leaseUntil = now.Add(leaseDuration);

        var candidateIds = await _dbContext.OutboxMessages
            .Where(m => m.Status == "Pending"
                        && m.RetryCount < 5
                        && (!m.LockedUntilUtc.HasValue || m.LockedUntilUtc <= now))
            .OrderBy(m => m.CreatedAtUtc)
            .Take(batchSize)
            .Select(m => m.Id)
            .ToListAsync(cancellationToken);

        if (candidateIds.Count == 0)
        {
            return new List<OutboxMessage>();
        }

        if (_dbContext.Database.IsRelational())
        {
            var claimedCount = await _dbContext.OutboxMessages
                .Where(m => candidateIds.Contains(m.Id)
                            && m.Status == "Pending"
                            && m.RetryCount < 5
                            && (!m.LockedUntilUtc.HasValue || m.LockedUntilUtc <= now))
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(m => m.LockedByInstance, instanceId)
                    .SetProperty(m => m.LockedUntilUtc, leaseUntil),
                    cancellationToken);

            if (claimedCount == 0)
            {
                return new List<OutboxMessage>();
            }

            return await _dbContext.OutboxMessages
                .Where(m => candidateIds.Contains(m.Id)
                            && m.LockedByInstance == instanceId
                            && m.Status == "Pending")
                .OrderBy(m => m.CreatedAtUtc)
                .ToListAsync(cancellationToken);
        }

        // Non-relational fallback (e.g. EF InMemory in tests)
        var candidates = await _dbContext.OutboxMessages
            .Where(m => candidateIds.Contains(m.Id)
                        && m.Status == "Pending"
                        && (!m.LockedUntilUtc.HasValue || m.LockedUntilUtc <= now))
            .OrderBy(m => m.CreatedAtUtc)
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

    public async Task<List<WebhookDelivery>> FanOutAndMarkPublishedAsync(
        OutboxMessage message,
        IReadOnlyCollection<WebhookDelivery> deliveries,
        DateTime processedAtUtc,
        CancellationToken cancellationToken = default)
    {
        var isRelational = _dbContext.Database.IsRelational();
        await using var transaction = isRelational
            ? await _dbContext.Database.BeginTransactionAsync(cancellationToken)
            : null;

        try
        {
            var insertedDeliveries = new List<WebhookDelivery>();

            if (deliveries.Count > 0)
            {
                var targetWebhookIds = deliveries.Select(d => d.WebhookId).Distinct().ToList();
                var existingWebhookIds = await _dbContext.WebhookDeliveries
                    .AsNoTracking()
                    .Where(d => d.EventId == message.EventId && targetWebhookIds.Contains(d.WebhookId))
                    .Select(d => d.WebhookId)
                    .ToListAsync(cancellationToken);

                var existingSet = existingWebhookIds.ToHashSet();
                foreach (var delivery in deliveries)
                {
                    if (existingSet.Contains(delivery.WebhookId)) continue;
                    existingSet.Add(delivery.WebhookId);
                    await _dbContext.WebhookDeliveries.AddAsync(delivery, cancellationToken);
                    insertedDeliveries.Add(delivery);
                }
            }

            message.Status = "Published";
            message.ProcessedAtUtc = processedAtUtc;
            message.Error = null;
            message.LockedByInstance = null;
            message.LockedUntilUtc = null;
            _dbContext.OutboxMessages.Update(message);

            await _dbContext.SaveChangesAsync(cancellationToken);

            if (transaction != null)
            {
                await transaction.CommitAsync(cancellationToken);
            }

            return insertedDeliveries;
        }
        catch
        {
            if (transaction != null)
            {
                await transaction.RollbackAsync(cancellationToken);
            }
            throw;
        }
    }

    public async Task UpdateAsync(OutboxMessage message)
    {
        _dbContext.OutboxMessages.Update(message);
        await _dbContext.SaveChangesAsync();
    }
}
