using Billing.Contracts;
using Billing.Contracts.Webhook;

namespace Billing.Application.Interfaces;

public interface IIntegrationApplicationService
{
    Task<ApiResponse<PagedResult<IntegrationApplicationDto>>> GetApplicationsAsync(IntegrationQueryParameters query, int tenantId);
    Task<ApiResponse<IntegrationApplicationDto>> GetApplicationByIdAsync(int id, int tenantId);
    Task<ApiResponse<RegisterIntegrationApplicationResponse>> RegisterApplicationAsync(RegisterIntegrationApplicationRequest request, int tenantId);
    Task<ApiResponse<IntegrationApplicationDto>> UpdateApplicationAsync(int id, UpdateIntegrationApplicationRequest request, int tenantId);
    Task<ApiResponse<IntegrationApplicationDto>> UpdateFeatureFlagsAsync(int id, UpdateFeatureFlagsRequest request, int tenantId);
    Task<ApiResponse<IntegrationApplicationDto>> ToggleStatusAsync(int id, int tenantId);
    Task<ApiResponse<bool>> DeleteApplicationAsync(int id, int tenantId);
}
