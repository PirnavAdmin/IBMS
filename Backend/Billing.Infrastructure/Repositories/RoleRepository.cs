using Billing.Application.Interfaces;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Repositories;

public class RoleRepository : IRoleRepository
{
    private readonly BillingDbContext _context;

    public RoleRepository(BillingDbContext context)
    {
        _context = context;
    }

    public async Task<List<Role>> GetAllAsync(int? tenantId = null)
    {
        var query = _context.Roles
            .Include(r => r.RolePermissions)
                .ThenInclude(rp => rp.Permission)
            .AsQueryable();

        if (tenantId.HasValue)
        {
            query = query.Where(r => r.TenantId == null || r.TenantId == tenantId.Value);
        }

        return await query.OrderBy(r => r.Name).ToListAsync();
    }

    public async Task<Role?> GetByIdAsync(int id)
    {
        return await _context.Roles
            .Include(r => r.RolePermissions)
                .ThenInclude(rp => rp.Permission)
            .FirstOrDefaultAsync(r => r.Id == id);
    }

    public async Task<Role?> GetByNameAsync(string name, int? tenantId = null)
    {
        var lower = name.Trim().ToLower();
        return await _context.Roles
            .Include(r => r.RolePermissions)
                .ThenInclude(rp => rp.Permission)
            .FirstOrDefaultAsync(r => r.Name.ToLower() == lower && (r.TenantId == null || r.TenantId == tenantId));
    }

    public async Task AddAsync(Role role)
    {
        _context.Roles.Add(role);
        await _context.SaveChangesAsync();
    }

    public async Task UpdateAsync(Role role)
    {
        _context.Roles.Update(role);
        await _context.SaveChangesAsync();
    }

    public async Task DeleteAsync(Role role)
    {
        _context.Roles.Remove(role);
        await _context.SaveChangesAsync();
    }

    public async Task<List<Permission>> GetAllPermissionsAsync()
    {
        return await _context.Permissions
            .OrderBy(p => p.Module)
            .ThenBy(p => p.Code)
            .ToListAsync();
    }

    public async Task<List<Permission>> GetPermissionsByCodesAsync(List<string> codes)
    {
        var lowerCodes = codes.Select(c => c.Trim().ToLower()).ToList();
        return await _context.Permissions
            .Where(p => lowerCodes.Contains(p.Code.ToLower()))
            .ToListAsync();
    }

    public async Task AssignPermissionsToRoleAsync(int roleId, List<int> permissionIds)
    {
        var existing = await _context.RolePermissions
            .Where(rp => rp.RoleId == roleId)
            .ToListAsync();

        _context.RolePermissions.RemoveRange(existing);

        foreach (var permId in permissionIds)
        {
            _context.RolePermissions.Add(new RolePermission
            {
                RoleId = roleId,
                PermissionId = permId
            });
        }

        await _context.SaveChangesAsync();
    }

    public async Task SeedDefaultRolesAndPermissionsAsync()
    {
        // 1. Seed standard permissions if empty
        if (!await _context.Permissions.AnyAsync())
        {
            var defaultPermissions = new List<Permission>
            {
                // User & Role Admin
                new() { Code = "users.view", Name = "View Users", Module = "Administration", Description = "View user list and details" },
                new() { Code = "users.create", Name = "Create User", Module = "Administration", Description = "Create new users" },
                new() { Code = "users.edit", Name = "Edit User", Module = "Administration", Description = "Edit user profile and status" },
                new() { Code = "users.delete", Name = "Delete User", Module = "Administration", Description = "Delete or deactivate users" },
                new() { Code = "users.assign", Name = "Assign User Roles", Module = "Administration", Description = "Assign roles, tenant and apps" },
                new() { Code = "roles.view", Name = "View Roles", Module = "Administration", Description = "View roles and permissions" },
                new() { Code = "roles.manage", Name = "Manage Roles", Module = "Administration", Description = "Create, edit and assign role permissions" },

                // Billing & Invoices
                new() { Code = "billing.view", Name = "View Billing", Module = "Billing", Description = "View billing dashboards and records" },
                new() { Code = "billing.create", Name = "Create Billing", Module = "Billing", Description = "Create billing transactions" },
                new() { Code = "invoices.view", Name = "View Invoices", Module = "Invoices", Description = "View customer invoices" },
                new() { Code = "invoices.manage", Name = "Manage Invoices", Module = "Invoices", Description = "Create, edit and manage invoices" },

                // Payments & Reports
                new() { Code = "payments.view", Name = "View Payments", Module = "Payments", Description = "View payment transactions" },
                new() { Code = "payments.manage", Name = "Manage Payments", Module = "Payments", Description = "Record and refund payments" },
                new() { Code = "reports.view", Name = "View Reports", Module = "Reports", Description = "View financial and audit reports" }
            };

            await _context.Permissions.AddRangeAsync(defaultPermissions);
            await _context.SaveChangesAsync();
        }

        // 2. Seed standard roles if empty
        if (!await _context.Roles.AnyAsync())
        {
            var allPerms = await _context.Permissions.ToListAsync();

            var adminRole = new Role
            {
                Name = "Admin",
                Description = "System Administrator with full access",
                IsSystemRole = true,
                CreatedAtUtc = DateTime.UtcNow
            };

            var billingManagerRole = new Role
            {
                Name = "BillingManager",
                Description = "Manages invoices, billing, and payments",
                IsSystemRole = true,
                CreatedAtUtc = DateTime.UtcNow
            };

            var accountantRole = new Role
            {
                Name = "Accountant",
                Description = "Manages payments, reports, and invoices",
                IsSystemRole = true,
                CreatedAtUtc = DateTime.UtcNow
            };

            var userRole = new Role
            {
                Name = "User",
                Description = "Standard portal user with view access",
                IsSystemRole = true,
                CreatedAtUtc = DateTime.UtcNow
            };

            var viewerRole = new Role
            {
                Name = "Viewer",
                Description = "Read-only access across platform",
                IsSystemRole = true,
                CreatedAtUtc = DateTime.UtcNow
            };

            await _context.Roles.AddRangeAsync(adminRole, billingManagerRole, accountantRole, userRole, viewerRole);
            await _context.SaveChangesAsync();

            // Assign Admin all permissions
            foreach (var perm in allPerms)
            {
                _context.RolePermissions.Add(new RolePermission { RoleId = adminRole.Id, PermissionId = perm.Id });
            }

            // Assign BillingManager billing permissions
            var bmPerms = allPerms.Where(p => p.Module is "Billing" or "Invoices" or "Payments" or "Reports").ToList();
            foreach (var perm in bmPerms)
            {
                _context.RolePermissions.Add(new RolePermission { RoleId = billingManagerRole.Id, PermissionId = perm.Id });
            }

            // Assign Accountant payment and invoice view permissions
            var accPerms = allPerms.Where(p => p.Code is "invoices.view" or "payments.view" or "payments.manage" or "reports.view").ToList();
            foreach (var perm in accPerms)
            {
                _context.RolePermissions.Add(new RolePermission { RoleId = accountantRole.Id, PermissionId = perm.Id });
            }

            // Assign User standard view permissions
            var userPerms = allPerms.Where(p => p.Code is "billing.view" or "invoices.view").ToList();
            foreach (var perm in userPerms)
            {
                _context.RolePermissions.Add(new RolePermission { RoleId = userRole.Id, PermissionId = perm.Id });
                _context.RolePermissions.Add(new RolePermission { RoleId = viewerRole.Id, PermissionId = perm.Id });
            }

            await _context.SaveChangesAsync();
        }
    }
}
