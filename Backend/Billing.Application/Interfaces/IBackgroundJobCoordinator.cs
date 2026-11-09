using Billing.Contracts.BackgroundJobs;

namespace Billing.Application.Interfaces;

public interface IBackgroundJobCoordinator
{
    List<BackgroundJobStatusDto> GetAllJobStatuses(int? tenantId = null);
    Task<JobExecutionResultDto> RunJobByNameAsync(string jobName, int? tenantId = null, CancellationToken cancellationToken = default);
}
