namespace Billing.Application.Interfaces;

public interface IOperationalCleanupRepository
{
    Task<int> CleanupExpiredSessionsAsync(DateTime expiredBeforeUtc, CancellationToken ct = default);
    Task<int> CleanupOldOutboxMessagesAsync(DateTime processedBeforeUtc, CancellationToken ct = default);
    Task<int> CleanupOldWebhookDeliveriesAsync(DateTime createdBeforeUtc, CancellationToken ct = default);
    Task<int> CleanupOldPaymentIdempotencyKeysAsync(DateTime createdBeforeUtc, CancellationToken ct = default);
}
