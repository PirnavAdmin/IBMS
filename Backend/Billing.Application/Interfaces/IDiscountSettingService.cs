using Billing.Contracts;
using Billing.Contracts.Discount;

namespace Billing.Application.Interfaces;

public interface IDiscountSettingService
{
    Task<ApiResponse<DiscountConfigurationDto>> GetDiscountConfigurationAsync(int tenantId);
    Task<ApiResponse<DiscountConfigurationDto>> UpdateDiscountConfigurationAsync(UpdateDiscountConfigurationRequest request, int tenantId, string? userName = null);
    Task<ApiResponse<List<DiscountRolePermissionDto>>> GetRolePermissionsAsync(int tenantId);
    Task<ApiResponse<List<DiscountRolePermissionDto>>> UpdateRolePermissionsAsync(UpdateDiscountRolePermissionsRequest request, int tenantId, string? userName = null);
    Task<ApiResponse<ValidateDiscountResultDto>> ValidateMaxDiscountAsync(ValidateDiscountRequest request, int tenantId, string? userRole = null);
}
