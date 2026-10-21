using Billing.Application.Interfaces;
using Billing.Application.Services;
using Billing.Contracts.Administration;
using Billing.Domain.Entities;
using Billing.Tests.Unit.Fakes;
using Xunit;

namespace Billing.Tests.Unit;

public class FakeRoleRepository : IRoleRepository
{
    public List<Role> Roles { get; } = new();
    public List<Permission> Permissions { get; } = new();
    public List<RolePermission> RolePermissions { get; } = new();

    public Task<List<Role>> GetAllAsync(int? tenantId = null)
    {
        var query = Roles.AsQueryable();
        if (tenantId.HasValue)
        {
            query = query.Where(r => r.TenantId == null || r.TenantId == tenantId.Value);
        }
        return Task.FromResult(query.ToList());
    }

    public Task<Role?> GetByIdAsync(int id)
    {
        return Task.FromResult(Roles.FirstOrDefault(r => r.Id == id));
    }

    public Task<Role?> GetByNameAsync(string name, int? tenantId = null)
    {
        return Task.FromResult(Roles.FirstOrDefault(r => 
            string.Equals(r.Name, name, StringComparison.OrdinalIgnoreCase) && 
            (r.TenantId == null || r.TenantId == tenantId)));
    }

    public Task AddAsync(Role role)
    {
        if (role.Id == 0)
        {
            role.Id = Roles.Any() ? Roles.Max(r => r.Id) + 1 : 1;
        }
        Roles.Add(role);
        return Task.CompletedTask;
    }

    public Task UpdateAsync(Role role)
    {
        var existing = Roles.FirstOrDefault(r => r.Id == role.Id);
        if (existing != null)
        {
            Roles.Remove(existing);
            Roles.Add(role);
        }
        return Task.CompletedTask;
    }

    public Task DeleteAsync(Role role)
    {
        var existing = Roles.FirstOrDefault(r => r.Id == role.Id);
        if (existing != null)
        {
            Roles.Remove(existing);
        }
        return Task.CompletedTask;
    }

    public Task<List<Permission>> GetAllPermissionsAsync()
    {
        return Task.FromResult(Permissions.ToList());
    }

    public Task<List<Permission>> GetPermissionsByCodesAsync(List<string> codes)
    {
        var match = Permissions.Where(p => codes.Any(c => string.Equals(c, p.Code, StringComparison.OrdinalIgnoreCase))).ToList();
        return Task.FromResult(match);
    }

    public Task AssignPermissionsToRoleAsync(int roleId, List<int> permissionIds)
    {
        var role = Roles.FirstOrDefault(r => r.Id == roleId);
        if (role != null)
        {
            role.RolePermissions.Clear();
            foreach (var pId in permissionIds)
            {
                var p = Permissions.FirstOrDefault(x => x.Id == pId);
                if (p != null)
                {
                    role.RolePermissions.Add(new RolePermission { RoleId = roleId, Role = role, PermissionId = pId, Permission = p });
                }
            }
        }
        return Task.CompletedTask;
    }

    public Task SeedDefaultRolesAndPermissionsAsync()
    {
        if (!Permissions.Any())
        {
            Permissions.Add(new Permission { Id = 1, Code = "billing.view", Name = "View Billing", Module = "Billing" });
            Permissions.Add(new Permission { Id = 2, Code = "billing.create", Name = "Create Billing", Module = "Billing" });
            Permissions.Add(new Permission { Id = 3, Code = "invoices.manage", Name = "Manage Invoices", Module = "Invoices" });
            Permissions.Add(new Permission { Id = 4, Code = "users.manage", Name = "Manage Users", Module = "Administration" });
        }

        if (!Roles.Any())
        {
            var admin = new Role { Id = 1, Name = "Admin", Description = "System Admin", IsSystemRole = true };
            admin.RolePermissions.Add(new RolePermission { RoleId = 1, Role = admin, PermissionId = 1, Permission = Permissions[0] });
            admin.RolePermissions.Add(new RolePermission { RoleId = 1, Role = admin, PermissionId = 2, Permission = Permissions[1] });
            admin.RolePermissions.Add(new RolePermission { RoleId = 1, Role = admin, PermissionId = 3, Permission = Permissions[2] });
            admin.RolePermissions.Add(new RolePermission { RoleId = 1, Role = admin, PermissionId = 4, Permission = Permissions[3] });

            var userRole = new Role { Id = 2, Name = "User", Description = "Standard User", IsSystemRole = true };
            userRole.RolePermissions.Add(new RolePermission { RoleId = 2, Role = userRole, PermissionId = 1, Permission = Permissions[0] });

            Roles.Add(admin);
            Roles.Add(userRole);
        }

        return Task.CompletedTask;
    }
}

public class UserAndRoleAdministrationTests
{
    private readonly FakeUserRepository _userRepository;
    private readonly FakeRoleRepository _roleRepository;
    private readonly FakeUserSessionRepository _sessionRepository;
    private readonly UserAdministrationService _userService;
    private readonly RoleAdministrationService _roleService;

    public UserAndRoleAdministrationTests()
    {
        _userRepository = new FakeUserRepository();
        _roleRepository = new FakeRoleRepository();
        _sessionRepository = new FakeUserSessionRepository();

        _roleRepository.SeedDefaultRolesAndPermissionsAsync().GetAwaiter().GetResult();

        _userService = new UserAdministrationService(_userRepository, _roleRepository, _sessionRepository);
        _roleService = new RoleAdministrationService(_roleRepository);
    }

    [Fact]
    public async Task CreateUser_PlatformOwned_Success()
    {
        var request = new CreateUserRequest
        {
            Name = "Alice Admin",
            Email = "alice@example.com",
            Password = "Password@123",
            Roles = new List<string> { "Admin" },
            TenantId = 1,
            ApplicationId = "IBMS"
        };

        var (success, message, user) = await _userService.CreateUserAsync(request);

        Assert.True(success);
        Assert.NotNull(user);
        Assert.Equal("alice@example.com", user.Email);
        Assert.Equal("Platform", user.IdentityType);
        Assert.Contains("Admin", user.Roles);
        Assert.Contains("users.manage", user.Permissions);
    }

    [Fact]
    public async Task UpdateUserStatus_ToInactive_RevokesSessions()
    {
        var (success, _, user) = await _userService.CreateUserAsync(new CreateUserRequest
        {
            Name = "Bob User",
            Email = "bob@example.com",
            Password = "Password@123",
            Roles = new List<string> { "User" }
        });

        // Add a mock active session
        await _sessionRepository.CreateSessionAsync(new UserSession
        {
            Id = 101,
            UserId = user!.Id,
            RefreshTokenHash = "mock-token-hash",
            RefreshTokenExpiresAtUtc = DateTime.UtcNow.AddDays(7),
            SessionExpiresAtUtc = DateTime.UtcNow.AddHours(2),
            IsRevoked = false
        });

        // Deactivate user
        var (statusSuccess, statusMsg) = await _userService.UpdateUserStatusAsync(user.Id, "Inactive");

        Assert.True(statusSuccess);
        var updatedUser = await _userService.GetUserByIdAsync(user.Id);
        Assert.False(updatedUser!.IsActive);
        Assert.Equal("Inactive", updatedUser.Status);

        // Verify session revoked
        var session = await _sessionRepository.GetByIdAsync(101);
        Assert.True(session!.IsRevoked);
    }

    [Fact]
    public async Task AssignUserRoles_UpdatesPermissionsAutomatically()
    {
        var (_, _, user) = await _userService.CreateUserAsync(new CreateUserRequest
        {
            Name = "Charlie User",
            Email = "charlie@example.com",
            Password = "Password@123",
            Roles = new List<string> { "User" }
        });

        Assert.DoesNotContain("users.manage", user!.Permissions);

        // Elevate to Admin
        var (assignSuccess, _, updated) = await _userService.AssignUserRolesAsync(user.Id, new List<string> { "Admin" });

        Assert.True(assignSuccess);
        Assert.Contains("Admin", updated!.Roles);
        Assert.Contains("users.manage", updated.Permissions);
    }

    [Fact]
    public async Task MapHostIdentity_ProvisionsAndLinksCorrectly()
    {
        var request = new HostIdentityMappingRequest
        {
            Email = "hostuser@corp.com",
            Name = "Corporate User",
            ExternalProvider = "AzureAD",
            ExternalSubjectId = "aad-sub-998877",
            ExternalScopes = "openid profile email billing.all",
            TenantId = 1,
            ApplicationId = "IBMS-Host",
            Roles = new List<string> { "Admin" }
        };

        var (success, _, user) = await _userService.MapHostIdentityAsync(request);

        Assert.True(success);
        Assert.NotNull(user);
        Assert.Equal("Host", user.IdentityType);
        Assert.Equal("AzureAD", user.ExternalProvider);
        Assert.Equal("aad-sub-998877", user.ExternalSubjectId);
        Assert.Equal("openid profile email billing.all", user.ExternalScopes);
        Assert.Equal("IBMS-Host", user.ApplicationId);
    }

    [Fact]
    public async Task AssignTenantAndApp_UpdatesSuccessfully()
    {
        var (_, _, user) = await _userService.CreateUserAsync(new CreateUserRequest
        {
            Name = "Dave User",
            Email = "dave@example.com",
            Password = "Password@123",
            Roles = new List<string> { "User" }
        });

        var (success, _, updated) = await _userService.AssignTenantAndAppAsync(user!.Id, 5, "CustomBillingApp");

        Assert.True(success);
        Assert.Equal(5, updated!.TenantId);
        Assert.Equal("CustomBillingApp", updated.ApplicationId);
    }

    [Fact]
    public async Task RoleManagement_CRUD_And_Protection()
    {
        // 1. Create custom role
        var (createSuccess, _, role) = await _roleService.CreateRoleAsync(new CreateRoleRequest
        {
            Name = "CustomAuditor",
            Description = "Audit only role",
            Permissions = new List<string> { "billing.view" }
        });

        Assert.True(createSuccess);
        Assert.NotNull(role);
        Assert.False(role.IsSystemRole);
        Assert.Contains("billing.view", role.Permissions);

        // 2. Update role permissions
        var (assignSuccess, _, updatedRole) = await _roleService.AssignPermissionsToRoleAsync(role.Id, new List<string> { "billing.view", "billing.create" });
        Assert.True(assignSuccess);
        Assert.Contains("billing.create", updatedRole!.Permissions);

        // 3. System role deletion protection
        var (sysDeleteSuccess, _) = await _roleService.DeleteRoleAsync(1); // Admin is ID 1
        Assert.False(sysDeleteSuccess);

        // 4. Custom role deletion succeeds
        var (customDeleteSuccess, _) = await _roleService.DeleteRoleAsync(role.Id);
        Assert.True(customDeleteSuccess);
    }

    [Fact]
    public async Task GetUsers_PaginationAndFilters_Work()
    {
        await _userService.CreateUserAsync(new CreateUserRequest { Name = "Filter User 1", Email = "filter1@test.com", Password = "Password@123", Roles = new List<string> { "User" } });
        await _userService.CreateUserAsync(new CreateUserRequest { Name = "Filter User 2", Email = "filter2@test.com", Password = "Password@123", Roles = new List<string> { "Admin" } });

        var (users, total) = await _userService.GetUsersAsync(new UserQueryParameters
        {
            Role = "Admin",
            PageNumber = 1,
            PageSize = 10
        });

        Assert.True(total >= 1);
        Assert.All(users, u => Assert.Contains("Admin", u.Roles));
    }
}
