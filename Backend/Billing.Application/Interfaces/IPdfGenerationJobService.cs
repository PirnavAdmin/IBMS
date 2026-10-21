using Billing.Contracts.BackgroundJobs;

namespace Billing.Application.Interfaces;

public interface IPdfGenerationJobService
{
    Task<JobExecutionResultDto> ProcessPendingPdfGenerationsAsync(int? tenantId = null, CancellationToken cancellationToken = default);
}
