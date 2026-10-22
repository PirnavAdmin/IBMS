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
        var defaultPermissions = new List<Permission>
        {
            // Administration & Users / Roles
            new() { Code = "users.view", Name = "View Users", Module = "Administration", Description = "View user list and details" },
            new() { Code = "users.create", Name = "Create User", Module = "Administration", Description = "Create new users" },
            new() { Code = "users.edit", Name = "Edit User", Module = "Administration", Description = "Edit user profile and status" },
            new() { Code = "users.delete", Name = "Delete User", Module = "Administration", Description = "Delete or deactivate users" },
            new() { Code = "users.assign", Name = "Assign User Roles", Module = "Administration", Description = "Assign roles, tenant and apps" },
            new() { Code = "roles.view", Name = "View Roles", Module = "Administration", Description = "View roles and permissions" },
            new() { Code = "roles.manage", Name = "Manage Roles", Module = "Administration", Description = "Create, edit and assign role permissions" },

            // Billing & Dashboard
            new() { Code = "billing.view", Name = "View Billing", Module = "Billing", Description = "View billing dashboards and records" },
            new() { Code = "billing.create", Name = "Create Billing", Module = "Billing", Description = "Create billing transactions" },

            // Invoices
            new() { Code = "invoices.view", Name = "View Invoices", Module = "Invoices", Description = "View customer invoices" },
            new() { Code = "invoices.create", Name = "Create Invoice", Module = "Invoices", Description = "Create new invoices" },
            new() { Code = "invoices.edit", Name = "Edit Invoice", Module = "Invoices", Description = "Edit invoices and line items" },
            new() { Code = "invoices.delete", Name = "Delete Invoice", Module = "Invoices", Description = "Delete or cancel invoices" },
            new() { Code = "invoices.manage", Name = "Manage Invoices", Module = "Invoices", Description = "Manage invoices, templates, and reminders" },
            new() { Code = "invoices.approve", Name = "Approve Invoice", Module = "Invoices", Description = "Approve or issue invoices" },

            // Quotations
            new() { Code = "quotations.view", Name = "View Quotations", Module = "Quotations", Description = "View customer quotations and estimates" },
            new() { Code = "quotations.create", Name = "Create Quotation", Module = "Quotations", Description = "Create new quotations" },
            new() { Code = "quotations.edit", Name = "Edit Quotation", Module = "Quotations", Description = "Edit quotations and estimates" },
            new() { Code = "quotations.delete", Name = "Delete Quotation", Module = "Quotations", Description = "Delete or cancel quotations" },
            new() { Code = "quotations.manage", Name = "Manage Quotations", Module = "Quotations", Description = "Send and convert quotations to invoices" },
            new() { Code = "quotations.approve", Name = "Approve Quotation", Module = "Quotations", Description = "Approve and accept quotations" },

            // Payments
            new() { Code = "payments.view", Name = "View Payments", Module = "Payments", Description = "View payment transactions" },
            new() { Code = "payments.create", Name = "Record Payment", Module = "Payments", Description = "Record received payments" },
            new() { Code = "payments.manage", Name = "Manage Payments", Module = "Payments", Description = "Record, void and manage payments" },
            new() { Code = "payments.refund", Name = "Refund Payment", Module = "Payments", Description = "Process payment refunds" },

            // Customers
            new() { Code = "customers.view", Name = "View Customers", Module = "Customers", Description = "View customer profiles and contacts" },
            new() { Code = "customers.create", Name = "Create Customer", Module = "Customers", Description = "Create new customer records" },
            new() { Code = "customers.edit", Name = "Edit Customer", Module = "Customers", Description = "Edit customer information" },
            new() { Code = "customers.delete", Name = "Delete Customer", Module = "Customers", Description = "Archive or delete customers" },
            new() { Code = "customers.manage", Name = "Manage Customers", Module = "Customers", Description = "Full management of customer accounts" },

            // Products & Categories
            new() { Code = "products.view", Name = "View Products", Module = "Products", Description = "View products, services, and categories" },
            new() { Code = "products.create", Name = "Create Product", Module = "Products", Description = "Create new products, services, and categories" },
            new() { Code = "products.edit", Name = "Edit Product", Module = "Products", Description = "Edit products, services, and categories" },
            new() { Code = "products.delete", Name = "Delete Product", Module = "Products", Description = "Delete products, services, and categories" },
            new() { Code = "products.manage", Name = "Manage Products", Module = "Products", Description = "Manage product inventory, pricing, and categories" },

            // Credit Notes
            new() { Code = "creditnotes.view", Name = "View Credit Notes", Module = "CreditNotes", Description = "View credit notes and refunds" },
            new() { Code = "creditnotes.create", Name = "Create Credit Note", Module = "CreditNotes", Description = "Create new credit notes" },
            new() { Code = "creditnotes.edit", Name = "Edit Credit Note", Module = "CreditNotes", Description = "Edit credit notes" },
            new() { Code = "creditnotes.delete", Name = "Delete Credit Note", Module = "CreditNotes", Description = "Delete or cancel credit notes" },
            new() { Code = "creditnotes.manage", Name = "Manage Credit Notes", Module = "CreditNotes", Description = "Manage credit notes and exports" },
            new() { Code = "creditnotes.approve", Name = "Approve Credit Note", Module = "CreditNotes", Description = "Approve and process credit notes" },

            // Settings & Integrations
            new() { Code = "settings.view", Name = "View Settings", Module = "Settings", Description = "View taxes, numbering, and regional configurations" },
            new() { Code = "settings.manage", Name = "Manage Settings", Module = "Settings", Description = "Manage company settings, taxes, numbering, and discounts" },
            new() { Code = "integrations.manage", Name = "Manage Integrations", Module = "Integrations", Description = "Configure webhooks, API keys, and external integrations" },

            // Reports & Audit
            new() { Code = "reports.view", Name = "View Reports", Module = "Reports", Description = "View financial, sales, and operational reports" },
            new() { Code = "audit.view", Name = "View Audit Logs", Module = "Audit", Description = "View system security and audit activity logs" },
            new() { Code = "audit.export", Name = "Export Audit Logs", Module = "Audit", Description = "Download and export audit activity logs" },
            new() { Code = "integrations.view", Name = "View Integrations", Module = "Integrations", Description = "View connected third-party integrations and API keys" },
            new() { Code = "reports.export", Name = "Export Reports", Module = "Reports", Description = "Export report datasets and spreadsheets" },

            // Dashboard
            new() { Code = "dashboard.view", Name = "View Dashboard", Module = "Dashboard", Description = "View dashboard metrics, KPI cards and revenue trends" },

            // Background & Export Jobs
            new() { Code = "backgroundjobs.view", Name = "View Background Jobs", Module = "BackgroundJobs", Description = "Monitor job queue, execution status and logs" },
            new() { Code = "backgroundjobs.manage", Name = "Manage Background Jobs", Module = "BackgroundJobs", Description = "Trigger, pause, retry, and manage background jobs" },
            new() { Code = "exportjobs.view", Name = "View Export Jobs", Module = "ExportJobs", Description = "View export queue and download history" },
            new() { Code = "exportjobs.create", Name = "Create Export Job", Module = "ExportJobs", Description = "Request, generate and export system data archives" },

            // Templates & Branding
            new() { Code = "templates.view", Name = "View Templates", Module = "Templates", Description = "View document, invoice, and receipt templates" },
            new() { Code = "templates.create", Name = "Create Template", Module = "Templates", Description = "Create new invoice branding and document layouts" },
            new() { Code = "templates.edit", Name = "Edit Template", Module = "Templates", Description = "Customize template styling, logos, and layouts" },
            new() { Code = "templates.delete", Name = "Delete Template", Module = "Templates", Description = "Remove custom branding templates" },

            // Webhooks
            new() { Code = "webhooks.view", Name = "View Webhooks", Module = "Webhooks", Description = "View registered webhook endpoints and delivery history" },
            new() { Code = "webhooks.manage", Name = "Manage Webhooks", Module = "Webhooks", Description = "Create, test, rotate secrets, and manage webhooks" }
        };

        // 1. Ensure all permissions exist (idempotent addition)
        var existingPermCodes = await _context.Permissions.Select(p => p.Code).ToListAsync();
        var missingPerms = defaultPermissions
            .Where(p => !existingPermCodes.Contains(p.Code, StringComparer.OrdinalIgnoreCase))
            .ToList();

        if (missingPerms.Any())
        {
            await _context.Permissions.AddRangeAsync(missingPerms);
            await _context.SaveChangesAsync();
        }

        var allPerms = await _context.Permissions.ToListAsync();

        // 2. Ensure standard roles exist
        var existingRoles = await _context.Roles.Include(r => r.RolePermissions).ToListAsync();

        async Task EnsureRoleWithPermissionsAsync(string roleName, string description, Func<List<Permission>, List<Permission>> filterPerms)
        {
            var role = existingRoles.FirstOrDefault(r => string.Equals(r.Name, roleName, StringComparison.OrdinalIgnoreCase));
            if (role == null)
            {
                role = new Role
                {
                    Name = roleName,
                    Description = description,
                    IsSystemRole = true,
                    CreatedAtUtc = DateTime.UtcNow
                };
                await _context.Roles.AddAsync(role);
                await _context.SaveChangesAsync();
                existingRoles.Add(role);
            }

            var targetPerms = filterPerms(allPerms);
            var assignedPermIds = role.RolePermissions.Select(rp => rp.PermissionId).ToHashSet();

            foreach (var perm in targetPerms)
            {
                if (!assignedPermIds.Contains(perm.Id))
                {
                    _context.RolePermissions.Add(new RolePermission { RoleId = role.Id, PermissionId = perm.Id });
                }
            }
        }

        // Admin & TenantAdmin & SuperAdmin get all permissions
        await EnsureRoleWithPermissionsAsync("Admin", "System Administrator with full access", perms => perms);
        await EnsureRoleWithPermissionsAsync("TenantAdmin", "Company Tenant Administrator with full workspace access", perms => perms);
        await EnsureRoleWithPermissionsAsync("SuperAdmin", "Platform Super Administrator with system-wide access", perms => perms);

        // BillingManager
        await EnsureRoleWithPermissionsAsync("BillingManager", "Manages billing, invoices, quotations, payments, and customers", perms =>
            perms.Where(p => p.Module is "Billing" or "Invoices" or "Quotations" or "Payments" or "Customers" or "Products" or "CreditNotes" or "Reports").ToList());

        // Accountant
        await EnsureRoleWithPermissionsAsync("Accountant", "Manages payments, reports, invoices, and credit notes", perms =>
            perms.Where(p => p.Code is "invoices.view" or "quotations.view" or "payments.view" or "payments.create" or "payments.manage" or "payments.refund" or "creditnotes.view" or "reports.view").ToList());

        // Standard User
        await EnsureRoleWithPermissionsAsync("User", "Standard portal user with standard view access", perms =>
            perms.Where(p => p.Code.EndsWith(".view") && p.Module is not "Administration" and not "Audit").ToList());

        // Viewer
        await EnsureRoleWithPermissionsAsync("Viewer", "Read-only access across platform", perms =>
            perms.Where(p => p.Code.EndsWith(".view") && p.Module is not "Administration" and not "Audit").ToList());

        // Customer
        await EnsureRoleWithPermissionsAsync("Customer", "Client portal user with view access to their invoices and payments", perms =>
            perms.Where(p => p.Code is "billing.view" or "invoices.view" or "quotations.view" or "payments.view" or "creditnotes.view").ToList());

        await _context.SaveChangesAsync();
    }
}
