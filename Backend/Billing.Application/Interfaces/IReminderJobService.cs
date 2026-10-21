using Billing.Contracts.BackgroundJobs;

namespace Billing.Application.Interfaces;

public interface IReminderJobService
{
    Task<JobExecutionResultDto> ProcessPaymentRemindersAsync(int? tenantId = null, CancellationToken cancellationToken = default);
}
