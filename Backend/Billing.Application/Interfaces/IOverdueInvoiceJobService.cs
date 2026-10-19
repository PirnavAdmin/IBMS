using Billing.Contracts.BackgroundJobs;

namespace Billing.Application.Interfaces;

public interface IOverdueInvoiceJobService
{
    Task<JobExecutionResultDto> ProcessOverdueInvoicesAsync(int? tenantId = null, CancellationToken cancellationToken = default);
}
