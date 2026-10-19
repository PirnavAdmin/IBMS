using System.Diagnostics;
using Billing.Application.Interfaces;
using Billing.Contracts.BackgroundJobs;
using Microsoft.Extensions.Logging;

namespace Billing.Application.Services;

public class WebhookDeliveryJobService : IWebhookDeliveryJobService
{
    private readonly IOutboxService _outboxService;
    private readonly ILogger<WebhookDeliveryJobService> _logger;

    public WebhookDeliveryJobService(
        IOutboxService outboxService,
        ILogger<WebhookDeliveryJobService> logger)
    {
        _outboxService = outboxService;
        _logger = logger;
    }

    public async Task<JobExecutionResultDto> ProcessPendingWebhooksAsync(CancellationToken cancellationToken = default)
    {
        var sw = Stopwatch.StartNew();
        int totalProcessed = 0;

        try
        {
            var outboxCount = await _outboxService.ProcessPendingOutboxMessagesAsync(cancellationToken);
            var retryCount = await _outboxService.ProcessPendingRetriesAsync(cancellationToken);

            totalProcessed = outboxCount + retryCount;
            sw.Stop();

            return new JobExecutionResultDto
            {
                JobName = "WebhookDeliveryJob",
                Success = true,
                ProcessedCount = totalProcessed,
                Duration = sw.Elapsed,
                Message = $"Webhook delivery job processed {outboxCount} outbox messages and {retryCount} webhook retries."
            };
        }
        catch (Exception ex)
        {
            sw.Stop();
            _logger.LogError(ex, "Error occurred during WebhookDeliveryJob execution.");
            return new JobExecutionResultDto
            {
                JobName = "WebhookDeliveryJob",
                Success = false,
                ProcessedCount = totalProcessed,
                Duration = sw.Elapsed,
                Message = $"Failed to execute WebhookDeliveryJob: {ex.Message}"
            };
        }
    }
}
