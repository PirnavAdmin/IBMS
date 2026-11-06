using System.Diagnostics;
using Billing.Application.Interfaces;
using Billing.Contracts.BackgroundJobs;
using Billing.Domain.Entities;
using Microsoft.Extensions.Logging;

namespace Billing.Application.Services;

public class OperationalCleanupJobService : IOperationalCleanupJobService
{
    private readonly IOperationalCleanupRepository _cleanupRepository;
    private readonly IExportJobRepository _exportJobRepository;
    private readonly IDocumentStorageService _storageService;
    private readonly IAuditLogRepository _auditLogRepository;
    private readonly ILogger<OperationalCleanupJobService> _logger;

    public OperationalCleanupJobService(
        IOperationalCleanupRepository cleanupRepository,
        IExportJobRepository exportJobRepository,
        IDocumentStorageService storageService,
        IAuditLogRepository auditLogRepository,
        ILogger<OperationalCleanupJobService> logger)
    {
        _cleanupRepository = cleanupRepository;
        _exportJobRepository = exportJobRepository;
        _storageService = storageService;
        _auditLogRepository = auditLogRepository;
        _logger = logger;
    }

    public async Task<CleanupResultDto> RunOperationalCleanupAsync(CancellationToken cancellationToken = default)
    {
        var sw = Stopwatch.StartNew();
        var now = DateTime.UtcNow;

        int sessionsCleaned = 0;
        int outboxCleaned = 0;
        int webhooksCleaned = 0;
        int exportsCleaned = 0;
        int idempotencyPurged = 0;

        try
        {
            // 1. Cleanup expired and revoked user sessions older than 7 days
            try
            {
                sessionsCleaned = await _cleanupRepository.CleanupExpiredSessionsAsync(now, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to cleanup expired user sessions.");
            }

            // 2. Cleanup published outbox messages older than 14 days
            try
            {
                outboxCleaned = await _cleanupRepository.CleanupOldOutboxMessagesAsync(now.AddDays(-14), cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to cleanup old outbox messages.");
            }

            // 3. Cleanup successful webhook deliveries older than 30 days
            try
            {
                webhooksCleaned = await _cleanupRepository.CleanupOldWebhookDeliveriesAsync(now.AddDays(-30), cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to cleanup old webhook deliveries.");
            }

            // 4. Cleanup old completed export jobs older than 7 days and delete physical files
            try
            {
                var oldExports = await _exportJobRepository.GetOldCompletedJobsAsync(now.AddDays(-7), 100, cancellationToken);
                foreach (var exp in oldExports)
                {
                    if (!string.IsNullOrWhiteSpace(exp.StoragePath))
                    {
                        try
                        {
                            await _storageService.DeleteDocumentAsync(exp.StoragePath, exp.TenantId, cancellationToken);
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, "Failed to delete storage file for export job {JobId}", exp.Id);
                        }
                    }

                    await _exportJobRepository.DeleteAsync(exp, cancellationToken);
                    exportsCleaned++;
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to cleanup old export jobs.");
            }

            // 5. Cleanup old payment idempotency keys older than 90 days
            try
            {
                idempotencyPurged = await _cleanupRepository.CleanupOldPaymentIdempotencyKeysAsync(now.AddDays(-90), cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to purge old idempotency keys.");
            }

            sw.Stop();

            var message = $"Operational cleanup completed in {sw.ElapsedMilliseconds}ms: " +
                          $"{sessionsCleaned} sessions, {outboxCleaned} outbox msgs, {webhooksCleaned} webhook deliveries, " +
                          $"{exportsCleaned} exports, {idempotencyPurged} idempotency keys purged.";

            await _auditLogRepository.AddAsync(new AuditLog
            {
                TenantId = 1,
                Action = "Operational Cleanup",
                EntityName = "System",
                EntityId = "Maintenance",
                UserName = "SystemCleanupJob",
                Changes = message,
                Timestamp = DateTime.UtcNow
            }, cancellationToken);

            return new CleanupResultDto
            {
                Success = true,
                ExpiredSessionsCleaned = sessionsCleaned,
                OldOutboxMessagesCleaned = outboxCleaned,
                OldWebhookDeliveriesCleaned = webhooksCleaned,
                ExpiredExportJobsCleaned = exportsCleaned,
                OldIdempotencyKeysPurged = idempotencyPurged,
                Message = message,
                Duration = sw.Elapsed,
                ExecutedAtUtc = DateTime.UtcNow
            };
        }
        catch (Exception ex)
        {
            sw.Stop();
            _logger.LogError(ex, "Fatal error occurred during OperationalCleanupJob execution.");
            return new CleanupResultDto
            {
                Success = false,
                ExpiredSessionsCleaned = sessionsCleaned,
                OldOutboxMessagesCleaned = outboxCleaned,
                OldWebhookDeliveriesCleaned = webhooksCleaned,
                ExpiredExportJobsCleaned = exportsCleaned,
                OldIdempotencyKeysPurged = idempotencyPurged,
                Message = $"Operational cleanup failed: {ex.Message}",
                Duration = sw.Elapsed,
                ExecutedAtUtc = DateTime.UtcNow
            };
        }
    }
}
