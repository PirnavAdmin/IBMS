using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IRoleRepository
{
    Task<List<Role>> GetAllAsync(int? tenantId = null);
    Task<Role?> GetByIdAsync(int id);
    Task<Role?> GetByNameAsync(string name, int? tenantId = null);
    Task AddAsync(Role role);
    Task UpdateAsync(Role role);
    Task DeleteAsync(Role role);
    Task<List<Permission>> GetAllPermissionsAsync();
    Task<List<Permission>> GetPermissionsByCodesAsync(List<string> codes);
    Task AssignPermissionsToRoleAsync(int roleId, List<int> permissionIds);
    Task SeedDefaultRolesAndPermissionsAsync();
}
