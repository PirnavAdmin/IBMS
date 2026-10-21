using Billing.Contracts;
using Billing.Contracts.Export;
using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IExportJobRepository
{
    Task<ExportJob?> GetByIdAsync(int id, int tenantId, CancellationToken cancellationToken = default);
    Task<List<ExportJob>> GetPendingJobsAsync(int limit = 10, CancellationToken cancellationToken = default);
    Task<PagedResult<ExportJob>> GetPagedAsync(int tenantId, ExportJobFilterRequest filter, CancellationToken cancellationToken = default);
    Task<ExportJob> AddAsync(ExportJob job, CancellationToken cancellationToken = default);
    Task<ExportJob> UpdateAsync(ExportJob job, CancellationToken cancellationToken = default);
    Task DeleteAsync(ExportJob job, CancellationToken cancellationToken = default);
    Task<List<ExportJob>> GetOldCompletedJobsAsync(DateTime olderThanUtc, int limit = 100, CancellationToken cancellationToken = default);
}
