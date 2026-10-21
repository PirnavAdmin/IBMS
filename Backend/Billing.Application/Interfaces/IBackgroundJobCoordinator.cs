using Billing.Contracts.BackgroundJobs;

namespace Billing.Application.Interfaces;

public interface IBackgroundJobCoordinator
{
    List<BackgroundJobStatusDto> GetAllJobStatuses();
    Task<JobExecutionResultDto> RunJobByNameAsync(string jobName, int? tenantId = null, CancellationToken cancellationToken = default);
}
