using Billing.Contracts.BackgroundJobs;

namespace Billing.Application.Interfaces;

public interface IOperationalCleanupJobService
{
    Task<CleanupResultDto> RunOperationalCleanupAsync(CancellationToken cancellationToken = default);
}
