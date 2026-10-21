using System.Collections.Concurrent;
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
            _jobStatuses.TryAdd(def.Name, new BackgroundJobStatusDto
            {
                JobName = def.Name,
                Description = def.Description,
                Status = "Idle",
                LastRunSuccess = true,
                NextScheduledRunUtc = DateTime.UtcNow.Add(GetJobInterval(def.Name))
            });
        }
    }

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

    public List<BackgroundJobStatusDto> GetAllJobStatuses()
    {
        return _jobStatuses.Values.OrderBy(j => j.JobName).ToList();
    }

    public async Task<JobExecutionResultDto> RunJobByNameAsync(string jobName, int? tenantId = null, CancellationToken cancellationToken = default)
    {
        var normalizedName = (jobName ?? "").Trim();
        if (!_jobStatuses.TryGetValue(normalizedName, out var statusDto))
        {
            return new JobExecutionResultDto
            {
                JobName = jobName ?? "Unknown",
                Success = false,
                Message = $"Unknown background job '{jobName}'."
            };
        }

        statusDto.Status = "Running";
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

            var completedAt = DateTime.UtcNow;
            statusDto.LastRunAtUtc = completedAt;
            statusDto.NextScheduledRunUtc = completedAt.Add(GetJobInterval(statusDto.JobName));
            statusDto.LastRunSuccess = result.Success;
            statusDto.LastRunMessage = result.Message;
            statusDto.LastProcessedCount = result.ProcessedCount;
            statusDto.LastExecutionDurationMs = result.Duration.TotalMilliseconds;
            statusDto.Status = result.Success ? "Succeeded" : "Failed";

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed running background job {JobName}", jobName);
            var completedAt = DateTime.UtcNow;
            statusDto.LastRunAtUtc = completedAt;
            statusDto.NextScheduledRunUtc = completedAt.Add(GetJobInterval(statusDto.JobName));
            statusDto.LastRunSuccess = false;
            statusDto.LastRunMessage = ex.Message;
            statusDto.Status = "Failed";

            return new JobExecutionResultDto
            {
                JobName = jobName ?? "Unknown",
                Success = false,
                Message = $"Job failed with exception: {ex.Message}",
                ExecutedAtUtc = completedAt
            };
        }
    }
}
