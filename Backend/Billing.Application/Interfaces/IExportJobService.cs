using Billing.Contracts;
using Billing.Contracts.BackgroundJobs;
using Billing.Contracts.Export;

namespace Billing.Application.Interfaces;

public interface IExportJobService
{
    Task<ApiResponse<ExportJobDto>> QueueExportJobAsync(CreateExportJobRequest request, int tenantId, string requestedBy, CancellationToken cancellationToken = default);
    Task<ApiResponse<ExportJobDto>> GetExportJobAsync(int id, int tenantId, CancellationToken cancellationToken = default);
    Task<ApiResponse<PagedResult<ExportJobDto>>> GetExportJobsAsync(int tenantId, ExportJobFilterRequest filter, CancellationToken cancellationToken = default);
    Task<ApiResponse<(byte[] Content, string FileName, string ContentType)>> DownloadExportFileAsync(int id, int tenantId, CancellationToken cancellationToken = default);
    Task<JobExecutionResultDto> ProcessPendingExportJobsAsync(CancellationToken cancellationToken = default);
}
