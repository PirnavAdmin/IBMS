using System.Collections.Concurrent;
using System.Diagnostics;
using Billing.Application.Interfaces;
using Billing.Contracts.BackgroundJobs;
using Microsoft.Extensions.Logging;

namespace Billing.Application.Services;

public class BackgroundJobCoordinator : IBackgroundJobCoordinator
{
    private readonly IOverdueInvoiceJobService _overdueInvoiceJobService;
    private readonly IReminderJobService _reminderJobService;
    private readonly IPdfGenerationJobService _pdfGenerationJobService;
    private readonly IEmailNotificationJobService _emailNotificationJobService;
    private readonly IWebhookDeliveryJobService _webhookDeliveryJobService;
    private readonly IExportJobService _exportJobService;
    private readonly IOperationalCleanupJobService _cleanupJobService;
    private readonly ILogger<BackgroundJobCoordinator> _logger;

    private static readonly ConcurrentDictionary<string, BackgroundJobStatusDto> _jobStatuses = new(StringComparer.OrdinalIgnoreCase);
    private static readonly ConcurrentDictionary<string, BackgroundJobStatusDto> _systemJobStatuses = new(StringComparer.OrdinalIgnoreCase);
    private static readonly ConcurrentDictionary<string, BackgroundJobStatusDto> _tenantJobStatuses = new(StringComparer.OrdinalIgnoreCase);
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> _jobLocks = new(StringComparer.OrdinalIgnoreCase);

    public BackgroundJobCoordinator(
        IOverdueInvoiceJobService overdueInvoiceJobService,
        IReminderJobService reminderJobService,
        IPdfGenerationJobService pdfGenerationJobService,
        IEmailNotificationJobService emailNotificationJobService,
        IWebhookDeliveryJobService webhookDeliveryJobService,
        IExportJobService exportJobService,
        IOperationalCleanupJobService cleanupJobService,
        ILogger<BackgroundJobCoordinator> logger)
    {
        _overdueInvoiceJobService = overdueInvoiceJobService;
        _reminderJobService = reminderJobService;
        _pdfGenerationJobService = pdfGenerationJobService;
        _emailNotificationJobService = emailNotificationJobService;
        _webhookDeliveryJobService = webhookDeliveryJobService;
        _exportJobService = exportJobService;
        _cleanupJobService = cleanupJobService;
        _logger = logger;

        InitializeJobDefinitions();
    }

    private static void InitializeJobDefinitions()
    {
        var definitions = new List<(string Name, string Description)>
        {
            ("OverdueInvoiceJob", "Scans issued invoices, transitions past-due invoices to Overdue, and sends notices."),
            ("ReminderJob", "Dispatches upcoming and overdue payment reminder emails to customers."),
            ("PdfGenerationJob", "Pre-renders and stores PDF documents for issued invoices to optimize delivery."),
            ("EmailNotificationJob", "Processes queued and failed email notifications with exponential retry backoff."),
            ("WebhookDeliveryJob", "Dispatches outbox event messages and processes failed webhook delivery retries."),
            ("ExportJob", "Generates asynchronous CSV/JSON export files for large datasets (invoices, payments, etc.)."),
            ("OperationalCleanupJob", "Purges expired user sessions, old outbox events, webhook deliveries, and temporary files.")
        };

        foreach (var def in definitions)
        {
            var initial = CreateDefaultStatus(def.Name, def.Description);
            _jobStatuses.TryAdd(def.Name, initial);
            _systemJobStatuses.TryAdd(def.Name, CloneStatus(initial));
        }
    }

    private static BackgroundJobStatusDto CreateDefaultStatus(string name, string description) => new()
    {
        JobName = name,
        Description = description,
        Status = "Idle",
        LastRunSuccess = true,
        NextScheduledRunUtc = DateTime.UtcNow.Add(GetJobInterval(name))
    };

    private static BackgroundJobStatusDto CloneStatus(BackgroundJobStatusDto j) => new()
    {
        JobName = j.JobName,
        Description = j.Description,
        Status = j.Status,
        LastRunAtUtc = j.LastRunAtUtc,
        NextScheduledRunUtc = j.NextScheduledRunUtc,
        LastRunSuccess = j.LastRunSuccess,
        LastRunMessage = j.LastRunMessage,
        LastProcessedCount = j.LastProcessedCount,
        LastExecutionDurationMs = j.LastExecutionDurationMs
    };

    private static bool IsTenantScopedJob(string jobName) =>
        (jobName ?? "").Trim().ToLowerInvariant() is
            "overdueinvoicejob" or "overdue" or
            "reminderjob" or "reminder" or "reminders" or
            "pdfgenerationjob" or "pdf" or "pdfgeneration" or
            "emailnotificationjob" or "email" or "notifications";

    private static TimeSpan GetJobInterval(string jobName)
    {
        return (jobName ?? "").Trim().ToLowerInvariant() switch
        {
            "overdueinvoicejob" or "overdue" => TimeSpan.FromHours(1),
            "reminderjob" or "reminder" or "reminders" => TimeSpan.FromHours(1),
            "pdfgenerationjob" or "pdf" or "pdfgeneration" => TimeSpan.FromMinutes(5),
            "operationalcleanupjob" or "cleanup" => TimeSpan.FromHours(6),
            _ => TimeSpan.FromSeconds(5)
        };
    }

    public List<BackgroundJobStatusDto> GetAllJobStatuses(int? tenantId = null)
    {
        if (!tenantId.HasValue)
        {
            return _jobStatuses.Values
                .OrderBy(j => j.JobName)
                .Select(CloneStatus)
                .ToList();
        }

        return _systemJobStatuses.Values
            .OrderBy(j => j.JobName)
            .Select(sys =>
            {
                var tenantKey = $"{tenantId.Value}:{sys.JobName}";
                if (_tenantJobStatuses.TryGetValue(tenantKey, out var tenantStatus))
                {
                    if (!sys.LastRunAtUtc.HasValue || (tenantStatus.LastRunAtUtc.HasValue && tenantStatus.LastRunAtUtc >= sys.LastRunAtUtc))
                    {
                        return CloneStatus(tenantStatus);
                    }
                }
                return CloneStatus(sys);
            })
            .ToList();
    }

    public async Task<JobExecutionResultDto> RunJobByNameAsync(string jobName, int? tenantId = null, CancellationToken cancellationToken = default)
    {
        var normalizedName = ResolveCanonicalJobName(jobName);
        if (!_jobStatuses.TryGetValue(normalizedName, out var statusDto))
        {
            return new JobExecutionResultDto
            {
                JobName = jobName ?? "Unknown",
                Success = false,
                Message = $"Unknown background job '{jobName}'."
            };
        }

        var lockKey = tenantId.HasValue && IsTenantScopedJob(statusDto.JobName)
            ? $"{statusDto.JobName}:tenant:{tenantId.Value}"
            : statusDto.JobName;

        var jobLock = _jobLocks.GetOrAdd(lockKey, _ => new SemaphoreSlim(1, 1));
        if (!await jobLock.WaitAsync(0, cancellationToken))
        {
            return new JobExecutionResultDto
            {
                JobName = statusDto.JobName,
                Success = true,
                ProcessedCount = 0,
                Message = $"Job '{statusDto.JobName}' is already running."
            };
        }

        var targetTenantStatus = tenantId.HasValue
            ? _tenantJobStatuses.GetOrAdd($"{tenantId.Value}:{statusDto.JobName}", _ => CreateDefaultStatus(statusDto.JobName, statusDto.Description))
            : null;
        var targetSystemStatus = _systemJobStatuses.GetOrAdd(statusDto.JobName, _ => CreateDefaultStatus(statusDto.JobName, statusDto.Description));

        var sw = Stopwatch.StartNew();
        statusDto.Status = "Running";
        if (targetTenantStatus != null)
        {
            targetTenantStatus.Status = "Running";
        }
        else
        {
            targetSystemStatus.Status = "Running";
        }

        JobExecutionResultDto result;

        try
        {
            switch (normalizedName.ToLowerInvariant())
            {
                case "overdueinvoicejob":
                case "overdue":
                    result = await _overdueInvoiceJobService.ProcessOverdueInvoicesAsync(tenantId, cancellationToken);
                    break;

                case "reminderjob":
                case "reminder":
                case "reminders":
                    result = await _reminderJobService.ProcessPaymentRemindersAsync(tenantId, cancellationToken);
                    break;

                case "pdfgenerationjob":
                case "pdf":
                case "pdfgeneration":
                    result = await _pdfGenerationJobService.ProcessPendingPdfGenerationsAsync(tenantId, cancellationToken);
                    break;

                case "emailnotificationjob":
                case "email":
                case "notifications":
                    result = await _emailNotificationJobService.ProcessPendingEmailNotificationsAsync(tenantId, cancellationToken);
                    break;

                case "webhookdeliveryjob":
                case "webhook":
                case "webhooks":
                    result = await _webhookDeliveryJobService.ProcessPendingWebhooksAsync(cancellationToken);
                    break;

                case "exportjob":
                case "export":
                case "exports":
                    result = await _exportJobService.ProcessPendingExportJobsAsync(cancellationToken);
                    break;

                case "operationalcleanupjob":
                case "cleanup":
                    var cleanup = await _cleanupJobService.RunOperationalCleanupAsync(cancellationToken);
                    result = new JobExecutionResultDto
                    {
                        JobName = "OperationalCleanupJob",
                        Success = cleanup.Success,
                        ProcessedCount = cleanup.ExpiredSessionsCleaned + cleanup.OldOutboxMessagesCleaned + cleanup.OldWebhookDeliveriesCleaned + cleanup.ExpiredExportJobsCleaned + cleanup.OldIdempotencyKeysPurged,
                        Duration = cleanup.Duration,
                        Message = cleanup.Message,
                        ExecutedAtUtc = cleanup.ExecutedAtUtc
                    };
                    break;

                default:
                    result = new JobExecutionResultDto
                    {
                        JobName = jobName ?? "Unknown",
                        Success = false,
                        Message = $"Handler not mapped for job '{jobName}'."
                    };
                    break;
            }

            sw.Stop();
            var completedAt = DateTime.UtcNow;
            var durationMs = result.Duration.TotalMilliseconds > 0
                ? result.Duration.TotalMilliseconds
                : sw.Elapsed.TotalMilliseconds;

            ApplyExecutionOutcome(statusDto, completedAt, result.Success, result.Message, result.ProcessedCount, durationMs);
            if (targetTenantStatus != null)
            {
                ApplyExecutionOutcome(targetTenantStatus, completedAt, result.Success, result.Message, result.ProcessedCount, durationMs);
            }
            else
            {
                ApplyExecutionOutcome(targetSystemStatus, completedAt, result.Success, result.Message, result.ProcessedCount, durationMs);
            }

            return result;
        }
        catch (Exception ex)
        {
            sw.Stop();
            _logger.LogError(ex, "Failed running background job {JobName}", jobName);
            var completedAt = DateTime.UtcNow;
            var durationMs = sw.Elapsed.TotalMilliseconds;

            ApplyExecutionOutcome(statusDto, completedAt, false, ex.Message, 0, durationMs);
            if (targetTenantStatus != null)
            {
                ApplyExecutionOutcome(targetTenantStatus, completedAt, false, ex.Message, 0, durationMs);
            }
            else
            {
                ApplyExecutionOutcome(targetSystemStatus, completedAt, false, ex.Message, 0, durationMs);
            }

            return new JobExecutionResultDto
            {
                JobName = jobName ?? "Unknown",
                Success = false,
                ProcessedCount = 0,
                Duration = sw.Elapsed,
                Message = $"Job failed with exception: {ex.Message}",
                ExecutedAtUtc = completedAt
            };
        }
        finally
        {
            jobLock.Release();
        }
    }

    private static void ApplyExecutionOutcome(
        BackgroundJobStatusDto target,
        DateTime completedAt,
        bool success,
        string? message,
        int processedCount,
        double durationMs)
    {
        target.LastRunAtUtc = completedAt;
        target.NextScheduledRunUtc = completedAt.Add(GetJobInterval(target.JobName));
        target.LastRunSuccess = success;
        target.LastRunMessage = message;
        target.LastProcessedCount = processedCount;
        target.LastExecutionDurationMs = durationMs;
        target.Status = success ? "Succeeded" : "Failed";
    }

    private static string ResolveCanonicalJobName(string? jobName) => (jobName ?? "").Trim().Replace(" ", "").Replace("-", "").Replace("_", "").ToLowerInvariant() switch
    {
        "overdueinvoicejob" or "overdue" or "overdueinvoices" => "OverdueInvoiceJob",
        "reminderjob" or "reminder" or "reminders" => "ReminderJob",
        "pdfgenerationjob" or "pdf" or "pdfgeneration" => "PdfGenerationJob",
        "emailnotificationjob" or "email" or "notifications" or "emailnotifications" => "EmailNotificationJob",
        "webhookdeliveryjob" or "webhook" or "webhooks" or "webhookdelivery" => "WebhookDeliveryJob",
        "exportjob" or "export" or "exports" => "ExportJob",
        "operationalcleanupjob" or "cleanup" or "operationalcleanup" => "OperationalCleanupJob",
        _ => (jobName ?? "").Trim()
    };
}
