using Billing.Contracts.BackgroundJobs;

namespace Billing.Application.Interfaces;

public interface IEmailNotificationJobService
{
    Task<JobExecutionResultDto> ProcessPendingEmailNotificationsAsync(int? tenantId = null, CancellationToken cancellationToken = default);
}
