using Billing.Application.Interfaces;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Repositories;

public class OperationalCleanupRepository : IOperationalCleanupRepository
{
    private readonly BillingDbContext _context;

    public OperationalCleanupRepository(BillingDbContext context)
    {
        _context = context;
    }

    public async Task<int> CleanupExpiredSessionsAsync(DateTime expiredBeforeUtc, CancellationToken ct = default)
    {
        var expiredSessions = await _context.UserSessions
            .Where(s => s.SessionExpiresAtUtc < expiredBeforeUtc ||
                        s.RefreshTokenExpiresAtUtc < expiredBeforeUtc ||
                        (s.IsRevoked && s.RevokedAtUtc.HasValue && s.RevokedAtUtc.Value < expiredBeforeUtc.AddDays(-7)))
            .Take(500)
            .ToListAsync(ct);

        if (expiredSessions.Count > 0)
        {
            _context.UserSessions.RemoveRange(expiredSessions);
            return await SaveCleanupChangesSafeAsync(expiredSessions, ct);
        }

        return 0;
    }

    public async Task<int> CleanupOldOutboxMessagesAsync(DateTime processedBeforeUtc, CancellationToken ct = default)
    {
        var oldMessages = await _context.OutboxMessages
            .Where(m => (m.Status == "Published" || m.Status == "DeadLetter") &&
                        m.ProcessedAtUtc.HasValue &&
                        m.ProcessedAtUtc.Value < processedBeforeUtc)
            .Take(500)
            .ToListAsync(ct);

        if (oldMessages.Count > 0)
        {
            _context.OutboxMessages.RemoveRange(oldMessages);
            return await SaveCleanupChangesSafeAsync(oldMessages, ct);
        }

        return 0;
    }

    public async Task<int> CleanupOldWebhookDeliveriesAsync(DateTime createdBeforeUtc, CancellationToken ct = default)
    {
        var oldDeliveries = await _context.WebhookDeliveries
            .Where(d => (d.Status == "Success" || d.Status == "Failed" || d.Status == "DeadLetter") &&
                        d.CreatedAtUtc < createdBeforeUtc)
            .Take(500)
            .ToListAsync(ct);

        if (oldDeliveries.Count > 0)
        {
            _context.WebhookDeliveries.RemoveRange(oldDeliveries);
            return await SaveCleanupChangesSafeAsync(oldDeliveries, ct);
        }

        return 0;
    }

    public async Task<int> CleanupOldPaymentIdempotencyKeysAsync(DateTime createdBeforeUtc, CancellationToken ct = default)
    {
        var oldPayments = await _context.Payments
            .Where(p => p.CreatedAtUtc < createdBeforeUtc && !string.IsNullOrEmpty(p.IdempotencyKey))
            .Take(500)
            .ToListAsync(ct);

        foreach (var payment in oldPayments)
        {
            payment.IdempotencyKey = string.Empty;
            payment.UpdatedAtUtc = DateTime.UtcNow;
            payment.RowVersion = DateTime.UtcNow;
        }

        if (oldPayments.Count > 0)
        {
            return await SaveCleanupChangesSafeAsync(oldPayments, ct);
        }

        return 0;
    }

    private async Task<int> SaveCleanupChangesSafeAsync<TEntity>(List<TEntity> entities, CancellationToken ct)
        where TEntity : class
    {
        var detachedCount = 0;

        while (true)
        {
            try
            {
                await _context.SaveChangesAsync(ct);
                return Math.Max(0, entities.Count - detachedCount);
            }
            catch (DbUpdateConcurrencyException ex)
            {
                if (ex.Entries.Count == 0)
                {
                    foreach (var item in entities)
                    {
                        _context.Entry(item).State = EntityState.Detached;
                    }
                    return 0;
                }

                foreach (var entry in ex.Entries)
                {
                    entry.State = EntityState.Detached;
                    detachedCount++;
                }
            }
            catch
            {
                foreach (var item in entities)
                {
                    _context.Entry(item).State = EntityState.Detached;
                }
                throw;
            }
        }
    }
}
