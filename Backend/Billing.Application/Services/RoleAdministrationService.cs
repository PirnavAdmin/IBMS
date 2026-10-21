using Billing.Application.Interfaces;
using Billing.Contracts.Administration;
using Billing.Domain.Entities;

namespace Billing.Application.Services;

public class RoleAdministrationService : IRoleAdministrationService
{
    private readonly IRoleRepository _roleRepository;

    public RoleAdministrationService(IRoleRepository roleRepository)
    {
        _roleRepository = roleRepository;
    }

    public async Task<List<RoleDto>> GetRolesAsync(int? tenantId = null)
    {
        await _roleRepository.SeedDefaultRolesAndPermissionsAsync();
        var roles = await _roleRepository.GetAllAsync(tenantId);
        return roles.Select(MapToRoleDto).ToList();
    }

    public async Task<RoleDto?> GetRoleByIdAsync(int id)
    {
        var role = await _roleRepository.GetByIdAsync(id);
        return role != null ? MapToRoleDto(role) : null;
    }

    public async Task<(bool Success, string Message, RoleDto? Role)> CreateRoleAsync(CreateRoleRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return (false, "Role name is required.", null);
        }

        var normalizedName = request.Name.Trim();
        var existing = await _roleRepository.GetByNameAsync(normalizedName, request.TenantId);
        if (existing != null)
        {
            return (false, $"A role with the name '{normalizedName}' already exists.", null);
        }

        var role = new Role
        {
            Name = normalizedName,
            Description = request.Description?.Trim() ?? string.Empty,
            TenantId = request.TenantId,
            IsSystemRole = false,
            CreatedAtUtc = DateTime.UtcNow
        };

        await _roleRepository.AddAsync(role);

        if (request.Permissions != null && request.Permissions.Any())
        {
            var perms = await _roleRepository.GetPermissionsByCodesAsync(request.Permissions);
            if (perms.Any())
            {
                await _roleRepository.AssignPermissionsToRoleAsync(role.Id, perms.Select(p => p.Id).ToList());
            }
        }

        var created = await _roleRepository.GetByIdAsync(role.Id);
        return (true, "Role created successfully.", created != null ? MapToRoleDto(created) : MapToRoleDto(role));
    }

    public async Task<(bool Success, string Message, RoleDto? Role)> UpdateRoleAsync(int id, UpdateRoleRequest request)
    {
        var role = await _roleRepository.GetByIdAsync(id);
        if (role == null)
        {
            return (false, "Role not found.", null);
        }

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return (false, "Role name is required.", null);
        }

        var normalizedName = request.Name.Trim();
        if (!string.Equals(role.Name, normalizedName, StringComparison.OrdinalIgnoreCase))
        {
            if (role.IsSystemRole)
            {
                return (false, "System role names cannot be renamed.", null);
            }

            var duplicate = await _roleRepository.GetByNameAsync(normalizedName, role.TenantId);
            if (duplicate != null && duplicate.Id != id)
            {
                return (false, $"A role with the name '{normalizedName}' already exists.", null);
            }
            role.Name = normalizedName;
        }

        role.Description = request.Description?.Trim() ?? string.Empty;
        role.UpdatedAtUtc = DateTime.UtcNow;

        await _roleRepository.UpdateAsync(role);

        if (request.Permissions != null)
        {
            var perms = await _roleRepository.GetPermissionsByCodesAsync(request.Permissions);
            await _roleRepository.AssignPermissionsToRoleAsync(role.Id, perms.Select(p => p.Id).ToList());
        }

        var updated = await _roleRepository.GetByIdAsync(id);
        return (true, "Role updated successfully.", updated != null ? MapToRoleDto(updated) : MapToRoleDto(role));
    }

    public async Task<(bool Success, string Message)> DeleteRoleAsync(int id)
    {
        var role = await _roleRepository.GetByIdAsync(id);
        if (role == null)
        {
            return (false, "Role not found.");
        }

        if (role.IsSystemRole)
        {
            return (false, "System roles cannot be deleted.");
        }

        await _roleRepository.DeleteAsync(role);
        return (true, "Role deleted successfully.");
    }

    public async Task<List<PermissionDto>> GetAllPermissionsAsync()
    {
        await _roleRepository.SeedDefaultRolesAndPermissionsAsync();
        var perms = await _roleRepository.GetAllPermissionsAsync();
        return perms.Select(p => new PermissionDto
        {
            Id = p.Id,
            Code = p.Code,
            Name = p.Name,
            Module = p.Module,
            Description = p.Description
        }).ToList();
    }

    public async Task<(bool Success, string Message, RoleDto? Role)> AssignPermissionsToRoleAsync(int roleId, List<string> permissionCodes)
    {
        var role = await _roleRepository.GetByIdAsync(roleId);
        if (role == null)
        {
            return (false, "Role not found.", null);
        }

        var perms = await _roleRepository.GetPermissionsByCodesAsync(permissionCodes);
        await _roleRepository.AssignPermissionsToRoleAsync(roleId, perms.Select(p => p.Id).ToList());

        var updated = await _roleRepository.GetByIdAsync(roleId);
        return (true, "Permissions assigned to role successfully.", updated != null ? MapToRoleDto(updated) : null);
    }

    private static RoleDto MapToRoleDto(Role role)
    {
        return new RoleDto
        {
            Id = role.Id,
            Name = role.Name,
            Description = role.Description,
            TenantId = role.TenantId,
            IsSystemRole = role.IsSystemRole,
            Permissions = role.RolePermissions
                .Where(rp => rp.Permission != null)
                .Select(rp => rp.Permission.Code)
                .ToList(),
            CreatedAtUtc = role.CreatedAtUtc,
            UpdatedAtUtc = role.UpdatedAtUtc
        };
    }
}
