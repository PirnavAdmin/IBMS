using Billing.Contracts.Administration;

namespace Billing.Application.Interfaces;

public interface IRoleAdministrationService
{
    Task<List<RoleDto>> GetRolesAsync(int? tenantId = null);
    Task<RoleDto?> GetRoleByIdAsync(int id);
    Task<(bool Success, string Message, RoleDto? Role)> CreateRoleAsync(CreateRoleRequest request);
    Task<(bool Success, string Message, RoleDto? Role)> UpdateRoleAsync(int id, UpdateRoleRequest request);
    Task<(bool Success, string Message)> DeleteRoleAsync(int id);
    Task<List<PermissionDto>> GetAllPermissionsAsync();
    Task<(bool Success, string Message, RoleDto? Role)> AssignPermissionsToRoleAsync(int roleId, List<string> permissionCodes);
}
