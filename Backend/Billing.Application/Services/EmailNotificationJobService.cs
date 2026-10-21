using System.Diagnostics;
using Billing.Application.Interfaces;
using Billing.Contracts.BackgroundJobs;
using Billing.Contracts.Notification;
using Microsoft.Extensions.Logging;

namespace Billing.Application.Services;

public class EmailNotificationJobService : IEmailNotificationJobService
{
    private readonly INotificationLogRepository _logRepository;
    private readonly ITenantRepository _tenantRepository;
    private readonly IEmailService _emailService;
    private readonly ILogger<EmailNotificationJobService> _logger;

    public EmailNotificationJobService(
        INotificationLogRepository logRepository,
        ITenantRepository tenantRepository,
        IEmailService emailService,
        ILogger<EmailNotificationJobService> logger)
    {
        _logRepository = logRepository;
        _tenantRepository = tenantRepository;
        _emailService = emailService;
        _logger = logger;
    }

    public async Task<JobExecutionResultDto> ProcessPendingEmailNotificationsAsync(int? tenantId = null, CancellationToken cancellationToken = default)
    {
        var sw = Stopwatch.StartNew();
        int sentOrRetriedCount = 0;
        var now = DateTime.UtcNow;

        try
        {
            var tenantIds = new List<int>();
            if (tenantId.HasValue)
            {
                tenantIds.Add(tenantId.Value);
            }
            else
            {
                var tenants = await _tenantRepository.GetAllAsync();
                tenantIds = tenants.Select(t => t.Id).ToList();
                if (tenantIds.Count == 0)
                {
                    tenantIds.Add(1);
                }
            }

            foreach (var tId in tenantIds)
            {
                if (cancellationToken.IsCancellationRequested) break;

                // Query queued logs
                var queuedLogs = await _logRepository.QueryLogsAsync(tId, new NotificationLogQueryParameters
                {
                    Status = "Queued",
                    PageSize = 50
                });

                // Query failed logs eligible for retry
                var failedLogs = await _logRepository.QueryLogsAsync(tId, new NotificationLogQueryParameters
                {
                    Status = "Failed",
                    PageSize = 50
                });

                var eligibleLogs = queuedLogs.Items
                    .Concat(failedLogs.Items.Where(l => l.RetryCount < 3 && (l.NextRetryAtUtc == null || l.NextRetryAtUtc <= now)))
                    .DistinctBy(l => l.Id)
                    .ToList();

                foreach (var logDto in eligibleLogs)
                {
                    if (cancellationToken.IsCancellationRequested) break;

                    var log = await _logRepository.GetByIdAsync(logDto.Id, tId);
                    if (log == null) continue;

                    try
                    {
                        await _emailService.SendEmailAsync(log.Recipient, log.Subject, log.Message);

                        log.Status = "Sent";
                        log.SentAtUtc = DateTime.UtcNow;
                        log.FailureReason = null;
                        log.NextRetryAtUtc = null;
                        await _logRepository.UpdateAsync(log);

                        sentOrRetriedCount++;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to dispatch email for NotificationLog {LogId}", log.Id);
                        log.RetryCount++;
                        log.FailureReason = ex.Message;

                        if (log.RetryCount >= 3)
                        {
                            log.Status = "Failed";
                            log.NextRetryAtUtc = null;
                        }
                        else
                        {
                            // Exponential backoff: 5m, 10m, 20m
                            var delayMinutes = Math.Pow(2, log.RetryCount) * 5;
                            log.NextRetryAtUtc = DateTime.UtcNow.AddMinutes(delayMinutes);
                        }

                        await _logRepository.UpdateAsync(log);
                    }
                }
            }

            sw.Stop();
            return new JobExecutionResultDto
            {
                JobName = "EmailNotificationJob",
                Success = true,
                ProcessedCount = sentOrRetriedCount,
                Duration = sw.Elapsed,
                Message = $"Email notification job executed. Processed {sentOrRetriedCount} pending or retried emails."
            };
        }
        catch (Exception ex)
        {
            sw.Stop();
            _logger.LogError(ex, "Error occurred during EmailNotificationJob execution.");
            return new JobExecutionResultDto
            {
                JobName = "EmailNotificationJob",
                Success = false,
                ProcessedCount = sentOrRetriedCount,
                Duration = sw.Elapsed,
                Message = $"Failed to execute EmailNotificationJob: {ex.Message}"
            };
        }
    }
}
