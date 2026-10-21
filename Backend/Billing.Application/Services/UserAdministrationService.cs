using Billing.Application.Interfaces;
using Billing.Contracts.Administration;
using Billing.Domain.Entities;
using System.Text.RegularExpressions;

namespace Billing.Application.Services;

public class UserAdministrationService : IUserAdministrationService
{
    private readonly IUserRepository _userRepository;
    private readonly IRoleRepository _roleRepository;
    private readonly IUserSessionRepository? _userSessionRepository;

    public UserAdministrationService(
        IUserRepository userRepository,
        IRoleRepository roleRepository,
        IUserSessionRepository? userSessionRepository = null)
    {
        _userRepository = userRepository;
        _roleRepository = roleRepository;
        _userSessionRepository = userSessionRepository;
    }

    public async Task<(List<UserDto> Users, int TotalCount)> GetUsersAsync(UserQueryParameters query)
    {
        var (users, total) = await _userRepository.GetPagedUsersAsync(
            query.Search,
            query.Status,
            query.Role,
            query.TenantId,
            query.IdentityType,
            query.PageNumber,
            query.PageSize
        );

        return (users.Select(MapToUserDto).ToList(), total);
    }

    public async Task<UserDto?> GetUserByIdAsync(int id)
    {
        var user = await _userRepository.GetByIdAsync(id);
        return user != null ? MapToUserDto(user) : null;
    }

    public async Task<(bool Success, string Message, UserDto? User)> CreateUserAsync(CreateUserRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length < 2)
        {
            return (false, "A valid user name (at least 2 characters) is required.", null);
        }

        if (string.IsNullOrWhiteSpace(request.Email) || !Regex.IsMatch(request.Email.Trim(), @"^[^@\s]+@[^@\s]+\.[^@\s]+$"))
        {
            return (false, "A valid email address is required.", null);
        }

        var normalizedEmail = request.Email.Trim().ToLower();
        var existing = await _userRepository.GetByEmailAsync(normalizedEmail);
        if (existing != null)
        {
            return (false, "A user with this email address is already registered.", null);
        }

        var isPlatform = !string.Equals(request.IdentityType, "Host", StringComparison.OrdinalIgnoreCase);
        string passwordHash;

        if (isPlatform)
        {
            if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 8)
            {
                return (false, "Password must be at least 8 characters long for platform-owned identity.", null);
            }
            passwordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
        }
        else
        {
            // For host-owned identity, password is not used directly
            passwordHash = BCrypt.Net.BCrypt.HashPassword(Guid.NewGuid().ToString());
        }

        var roles = request.Roles != null && request.Roles.Any()
            ? request.Roles.Select(r => r.Trim()).Distinct().ToList()
            : new List<string> { "User" };

        List<string> permissions;
        if (request.Permissions != null && request.Permissions.Any())
        {
            permissions = request.Permissions.Select(p => p.Trim()).Distinct().ToList();
        }
        else
        {
            permissions = await ResolvePermissionsForRolesAsync(roles);
        }

        var user = new User
        {
            Name = request.Name.Trim(),
            Username = normalizedEmail,
            Email = normalizedEmail,
            PasswordHash = passwordHash,
            TenantId = request.TenantId ?? 1,
            ApplicationId = string.IsNullOrWhiteSpace(request.ApplicationId) ? "IBMS" : request.ApplicationId.Trim(),
            IdentityType = isPlatform ? "Platform" : "Host",
            ExternalProvider = request.ExternalProvider?.Trim(),
            ExternalSubjectId = request.ExternalSubjectId?.Trim(),
            ExternalScopes = request.ExternalScopes?.Trim(),
            Status = string.Equals(request.Status, "Inactive", StringComparison.OrdinalIgnoreCase) ? "Inactive" : "Active",
            Roles = roles,
            Permissions = permissions,
            CreatedAtUtc = DateTime.UtcNow
        };

        await _userRepository.AddAsync(user);

        var created = await _userRepository.GetByIdAsync(user.Id);
        return (true, "User created successfully.", created != null ? MapToUserDto(created) : MapToUserDto(user));
    }

    public async Task<(bool Success, string Message, UserDto? User)> UpdateUserAsync(int id, UpdateUserRequest request)
    {
        var user = await _userRepository.GetByIdAsync(id);
        if (user == null)
        {
            return (false, "User not found.", null);
        }

        if (!string.IsNullOrWhiteSpace(request.Name))
        {
            user.Name = request.Name.Trim();
        }

        if (!string.IsNullOrWhiteSpace(request.Email))
        {
            var normalizedEmail = request.Email.Trim().ToLower();
            if (!string.Equals(user.Email, normalizedEmail, StringComparison.OrdinalIgnoreCase))
            {
                var duplicate = await _userRepository.GetByEmailAsync(normalizedEmail);
                if (duplicate != null && duplicate.Id != id)
                {
                    return (false, "Another user is already registered with this email address.", null);
                }
                user.Email = normalizedEmail;
                user.Username = normalizedEmail;
            }
        }

        if (request.TenantId.HasValue)
        {
            user.TenantId = request.TenantId.Value;
        }

        if (!string.IsNullOrWhiteSpace(request.ApplicationId))
        {
            user.ApplicationId = request.ApplicationId.Trim();
        }

        if (!string.IsNullOrWhiteSpace(request.Status))
        {
            var newStatus = string.Equals(request.Status, "Inactive", StringComparison.OrdinalIgnoreCase) ? "Inactive" : "Active";
            user.Status = newStatus;
        }

        if (request.Roles != null && request.Roles.Any())
        {
            user.Roles = request.Roles.Select(r => r.Trim()).Distinct().ToList();
            if (request.Permissions == null || !request.Permissions.Any())
            {
                user.Permissions = await ResolvePermissionsForRolesAsync(user.Roles);
            }
        }

        if (request.Permissions != null)
        {
            user.Permissions = request.Permissions.Select(p => p.Trim()).Distinct().ToList();
        }

        user.UpdatedAtUtc = DateTime.UtcNow;
        await _userRepository.UpdateAsync(user);

        var updated = await _userRepository.GetByIdAsync(id);
        return (true, "User updated successfully.", updated != null ? MapToUserDto(updated) : MapToUserDto(user));
    }

    public async Task<(bool Success, string Message)> UpdateUserStatusAsync(int id, string status)
    {
        var user = await _userRepository.GetByIdAsync(id);
        if (user == null)
        {
            return (false, "User not found.");
        }

        var normalizedStatus = string.Equals(status, "Inactive", StringComparison.OrdinalIgnoreCase) ? "Inactive" : "Active";
        user.Status = normalizedStatus;
        user.UpdatedAtUtc = DateTime.UtcNow;

        await _userRepository.UpdateAsync(user);

        if (normalizedStatus == "Inactive" && _userSessionRepository != null)
        {
            await _userSessionRepository.RevokeAllUserSessionsAsync(id, "Account deactivated by administrator.");
        }

        return (true, $"User status changed to '{normalizedStatus}' successfully.");
    }

    public async Task<(bool Success, string Message, UserDto? User)> AssignUserRolesAsync(int id, List<string> roles)
    {
        var user = await _userRepository.GetByIdAsync(id);
        if (user == null)
        {
            return (false, "User not found.", null);
        }

        var cleanRoles = roles != null && roles.Any()
            ? roles.Select(r => r.Trim()).Distinct().ToList()
            : new List<string> { "User" };

        user.Roles = cleanRoles;
        user.Permissions = await ResolvePermissionsForRolesAsync(cleanRoles);
        user.UpdatedAtUtc = DateTime.UtcNow;

        await _userRepository.UpdateAsync(user);

        var updated = await _userRepository.GetByIdAsync(id);
        return (true, "Roles assigned and permissions synchronized successfully.", updated != null ? MapToUserDto(updated) : MapToUserDto(user));
    }

    public async Task<(bool Success, string Message, UserDto? User)> AssignTenantAndAppAsync(int id, int? tenantId, string applicationId)
    {
        var user = await _userRepository.GetByIdAsync(id);
        if (user == null)
        {
            return (false, "User not found.", null);
        }

        user.TenantId = tenantId;
        user.ApplicationId = string.IsNullOrWhiteSpace(applicationId) ? "IBMS" : applicationId.Trim();
        user.UpdatedAtUtc = DateTime.UtcNow;

        await _userRepository.UpdateAsync(user);

        var updated = await _userRepository.GetByIdAsync(id);
        return (true, "Tenant and Application assigned successfully.", updated != null ? MapToUserDto(updated) : MapToUserDto(user));
    }

    public async Task<(bool Success, string Message, UserDto? User)> MapHostIdentityAsync(HostIdentityMappingRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
        {
            return (false, "Email is required for host identity mapping.", null);
        }

        if (string.IsNullOrWhiteSpace(request.ExternalProvider) || string.IsNullOrWhiteSpace(request.ExternalSubjectId))
        {
            return (false, "ExternalProvider and ExternalSubjectId are required.", null);
        }

        var normalizedEmail = request.Email.Trim().ToLower();

        // 1. Check if user already mapped by external provider & subject id
        var user = await _userRepository.GetByExternalSubjectAsync(request.ExternalProvider.Trim(), request.ExternalSubjectId.Trim())
                   ?? await _userRepository.GetByEmailAsync(normalizedEmail);

        var roles = request.Roles != null && request.Roles.Any()
            ? request.Roles.Select(r => r.Trim()).Distinct().ToList()
            : new List<string> { "User" };

        var permissions = await ResolvePermissionsForRolesAsync(roles);

        if (user != null)
        {
            // Link existing user to host-owned identity
            user.IdentityType = "Host";
            user.ExternalProvider = request.ExternalProvider.Trim();
            user.ExternalSubjectId = request.ExternalSubjectId.Trim();
            user.ExternalScopes = request.ExternalScopes?.Trim();
            if (request.TenantId.HasValue) user.TenantId = request.TenantId.Value;
            if (!string.IsNullOrWhiteSpace(request.ApplicationId)) user.ApplicationId = request.ApplicationId.Trim();
            if (roles.Any())
            {
                user.Roles = roles;
                user.Permissions = permissions;
            }
            user.UpdatedAtUtc = DateTime.UtcNow;

            await _userRepository.UpdateAsync(user);
            var updated = await _userRepository.GetByIdAsync(user.Id);
            return (true, "Existing user mapped to host identity successfully.", updated != null ? MapToUserDto(updated) : MapToUserDto(user));
        }

        // Create new host-mapped user
        var newUser = new User
        {
            Name = string.IsNullOrWhiteSpace(request.Name) ? normalizedEmail : request.Name.Trim(),
            Username = normalizedEmail,
            Email = normalizedEmail,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(Guid.NewGuid().ToString()),
            IdentityType = "Host",
            ExternalProvider = request.ExternalProvider.Trim(),
            ExternalSubjectId = request.ExternalSubjectId.Trim(),
            ExternalScopes = request.ExternalScopes?.Trim(),
            TenantId = request.TenantId ?? 1,
            ApplicationId = string.IsNullOrWhiteSpace(request.ApplicationId) ? "IBMS" : request.ApplicationId.Trim(),
            Status = "Active",
            Roles = roles,
            Permissions = permissions,
            CreatedAtUtc = DateTime.UtcNow
        };

        await _userRepository.AddAsync(newUser);
        var created = await _userRepository.GetByIdAsync(newUser.Id);
        return (true, "Host identity mapped and new user profile provisioned successfully.", created != null ? MapToUserDto(created) : MapToUserDto(newUser));
    }

    public async Task<(bool Success, string Message)> DeleteUserAsync(int id)
    {
        var user = await _userRepository.GetByIdAsync(id);
        if (user == null)
        {
            return (false, "User not found.");
        }

        await _userRepository.DeleteAsync(user);
        return (true, "User deleted successfully.");
    }

    private async Task<List<string>> ResolvePermissionsForRolesAsync(List<string> roleNames)
    {
        var resolvedPermissions = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        var allRoles = await _roleRepository.GetAllAsync();
        foreach (var roleName in roleNames)
        {
            var matchedRole = allRoles.FirstOrDefault(r => string.Equals(r.Name, roleName, StringComparison.OrdinalIgnoreCase));
            if (matchedRole != null)
            {
                foreach (var rp in matchedRole.RolePermissions)
                {
                    if (rp.Permission != null && !string.IsNullOrWhiteSpace(rp.Permission.Code))
                    {
                        resolvedPermissions.Add(rp.Permission.Code);
                    }
                }
            }
        }

        // Fallback default if no permissions resolved
        if (!resolvedPermissions.Any())
        {
            resolvedPermissions.Add("billing.view");
            resolvedPermissions.Add("invoices.view");
        }

        return resolvedPermissions.ToList();
    }

    private static UserDto MapToUserDto(User user)
    {
        return new UserDto
        {
            Id = user.Id,
            Name = user.Name,
            Username = user.Username,
            Email = user.Email,
            TenantId = user.TenantId,
            TenantCode = user.Tenant?.TenantCode,
            TenantName = user.Tenant?.Name,
            ApplicationId = user.ApplicationId,
            Status = user.Status,
            IsActive = user.IsActive,
            IdentityType = user.IdentityType,
            ExternalProvider = user.ExternalProvider,
            ExternalSubjectId = user.ExternalSubjectId,
            ExternalScopes = user.ExternalScopes,
            Roles = user.Roles,
            Permissions = user.Permissions,
            CreatedAtUtc = user.CreatedAtUtc,
            UpdatedAtUtc = user.UpdatedAtUtc
        };
    }
}
