using Billing.Contracts.BackgroundJobs;

namespace Billing.Application.Interfaces;

public interface IWebhookDeliveryJobService
{
    Task<JobExecutionResultDto> ProcessPendingWebhooksAsync(CancellationToken cancellationToken = default);
}
