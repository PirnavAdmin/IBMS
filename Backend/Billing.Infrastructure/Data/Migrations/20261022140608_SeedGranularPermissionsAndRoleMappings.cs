using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Billing.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class SeedGranularPermissionsAndRoleMappings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. Seed or update all 60 granular permissions across 17 modules
            migrationBuilder.Sql(@"
                INSERT INTO `Permissions` (`Code`, `Name`, `Module`, `Description`) VALUES
                ('users.view', 'View Users', 'Administration', 'View user list and details'),
                ('users.create', 'Create User', 'Administration', 'Create new users'),
                ('users.edit', 'Edit User', 'Administration', 'Edit user profile and status'),
                ('users.delete', 'Delete User', 'Administration', 'Delete or deactivate users'),
                ('users.assign', 'Assign User Roles', 'Administration', 'Assign roles, tenant and apps'),
                ('roles.view', 'View Roles', 'Administration', 'View roles and permissions'),
                ('roles.manage', 'Manage Roles', 'Administration', 'Create, edit and assign role permissions'),
                ('billing.view', 'View Billing', 'Billing', 'View billing dashboards and records'),
                ('billing.create', 'Create Billing', 'Billing', 'Create billing transactions'),
                ('invoices.view', 'View Invoices', 'Invoices', 'View customer invoices'),
                ('invoices.create', 'Create Invoice', 'Invoices', 'Create new invoices'),
                ('invoices.edit', 'Edit Invoice', 'Invoices', 'Edit invoices and line items'),
                ('invoices.delete', 'Delete Invoice', 'Invoices', 'Delete or cancel invoices'),
                ('invoices.manage', 'Manage Invoices', 'Invoices', 'Manage invoices, templates, and reminders'),
                ('invoices.approve', 'Approve Invoice', 'Invoices', 'Approve or issue invoices'),
                ('quotations.view', 'View Quotations', 'Quotations', 'View customer quotations and estimates'),
                ('quotations.create', 'Create Quotation', 'Quotations', 'Create new quotations'),
                ('quotations.edit', 'Edit Quotation', 'Quotations', 'Edit quotations and estimates'),
                ('quotations.delete', 'Delete Quotation', 'Quotations', 'Delete or cancel quotations'),
                ('quotations.manage', 'Manage Quotations', 'Quotations', 'Send and convert quotations to invoices'),
                ('quotations.approve', 'Approve Quotation', 'Quotations', 'Approve and accept quotations'),
                ('payments.view', 'View Payments', 'Payments', 'View payment transactions'),
                ('payments.create', 'Record Payment', 'Payments', 'Record received payments'),
                ('payments.manage', 'Manage Payments', 'Payments', 'Record, void and manage payments'),
                ('payments.refund', 'Refund Payment', 'Payments', 'Process payment refunds'),
                ('customers.view', 'View Customers', 'Customers', 'View customer profiles and contacts'),
                ('customers.create', 'Create Customer', 'Customers', 'Create new customer records'),
                ('customers.edit', 'Edit Customer', 'Customers', 'Edit customer information'),
                ('customers.delete', 'Delete Customer', 'Customers', 'Archive or delete customers'),
                ('customers.manage', 'Manage Customers', 'Customers', 'Full management of customer accounts'),
                ('products.view', 'View Products', 'Products', 'View products, services, and categories'),
                ('products.create', 'Create Product', 'Products', 'Create new products, services, and categories'),
                ('products.edit', 'Edit Product', 'Products', 'Edit products, services, and categories'),
                ('products.delete', 'Delete Product', 'Products', 'Delete products, services, and categories'),
                ('products.manage', 'Manage Products', 'Products', 'Manage product inventory, pricing, and categories'),
                ('creditnotes.view', 'View Credit Notes', 'CreditNotes', 'View credit notes and refunds'),
                ('creditnotes.create', 'Create Credit Note', 'CreditNotes', 'Create new credit notes'),
                ('creditnotes.edit', 'Edit Credit Note', 'CreditNotes', 'Edit credit notes'),
                ('creditnotes.delete', 'Delete Credit Note', 'CreditNotes', 'Delete or cancel credit notes'),
                ('creditnotes.manage', 'Manage Credit Notes', 'CreditNotes', 'Manage credit notes and exports'),
                ('creditnotes.approve', 'Approve Credit Note', 'CreditNotes', 'Approve and process credit notes'),
                ('settings.view', 'View Settings', 'Settings', 'View taxes, numbering, and regional configurations'),
                ('settings.manage', 'Manage Settings', 'Settings', 'Manage company settings, taxes, numbering, and discounts'),
                ('integrations.view', 'View Integrations', 'Integrations', 'View connected third-party integrations and API keys'),
                ('integrations.manage', 'Manage Integrations', 'Integrations', 'Configure webhooks, API keys, and external integrations'),
                ('reports.view', 'View Reports', 'Reports', 'View financial, sales, and operational reports'),
                ('reports.export', 'Export Reports', 'Reports', 'Export report datasets and spreadsheets'),
                ('audit.view', 'View Audit Logs', 'Audit', 'View system security and audit activity logs'),
                ('audit.export', 'Export Audit Logs', 'Audit', 'Download and export audit activity logs'),
                ('dashboard.view', 'View Dashboard', 'Dashboard', 'View dashboard metrics, KPI cards and revenue trends'),
                ('backgroundjobs.view', 'View Background Jobs', 'BackgroundJobs', 'Monitor job queue, execution status and logs'),
                ('backgroundjobs.manage', 'Manage Background Jobs', 'BackgroundJobs', 'Trigger, pause, retry, and manage background jobs'),
                ('exportjobs.view', 'View Export Jobs', 'ExportJobs', 'View export queue and download history'),
                ('exportjobs.create', 'Create Export Job', 'ExportJobs', 'Request, generate and export system data archives'),
                ('templates.view', 'View Templates', 'Templates', 'View document, invoice, and receipt templates'),
                ('templates.create', 'Create Template', 'Templates', 'Create new invoice branding and document layouts'),
                ('templates.edit', 'Edit Template', 'Templates', 'Customize template styling, logos, and layouts'),
                ('templates.delete', 'Delete Template', 'Templates', 'Remove custom branding templates'),
                ('webhooks.view', 'View Webhooks', 'Webhooks', 'View registered webhook endpoints and delivery history'),
                ('webhooks.manage', 'Manage Webhooks', 'Webhooks', 'Create, test, rotate secrets, and manage webhooks')
                ON DUPLICATE KEY UPDATE
                    `Name` = VALUES(`Name`),
                    `Module` = VALUES(`Module`),
                    `Description` = VALUES(`Description`);
            ");

            // 2. Ensure standard system roles exist
            migrationBuilder.Sql(@"
                INSERT INTO `Roles` (`Name`, `Description`, `TenantId`, `IsSystemRole`, `CreatedAtUtc`)
                SELECT 'Admin', 'System Administrator with full access', NULL, 1, UTC_TIMESTAMP()
                WHERE NOT EXISTS (SELECT 1 FROM `Roles` WHERE `TenantId` IS NULL AND `Name` = 'Admin');

                INSERT INTO `Roles` (`Name`, `Description`, `TenantId`, `IsSystemRole`, `CreatedAtUtc`)
                SELECT 'TenantAdmin', 'Company Tenant Administrator with full workspace access', NULL, 1, UTC_TIMESTAMP()
                WHERE NOT EXISTS (SELECT 1 FROM `Roles` WHERE `TenantId` IS NULL AND `Name` = 'TenantAdmin');

                INSERT INTO `Roles` (`Name`, `Description`, `TenantId`, `IsSystemRole`, `CreatedAtUtc`)
                SELECT 'SuperAdmin', 'Platform Super Administrator with system-wide access', NULL, 1, UTC_TIMESTAMP()
                WHERE NOT EXISTS (SELECT 1 FROM `Roles` WHERE `TenantId` IS NULL AND `Name` = 'SuperAdmin');

                INSERT INTO `Roles` (`Name`, `Description`, `TenantId`, `IsSystemRole`, `CreatedAtUtc`)
                SELECT 'BillingManager', 'Manages billing, invoices, quotations, payments, and customers', NULL, 1, UTC_TIMESTAMP()
                WHERE NOT EXISTS (SELECT 1 FROM `Roles` WHERE `TenantId` IS NULL AND `Name` = 'BillingManager');

                INSERT INTO `Roles` (`Name`, `Description`, `TenantId`, `IsSystemRole`, `CreatedAtUtc`)
                SELECT 'Accountant', 'Manages payments, reports, invoices, and credit notes', NULL, 1, UTC_TIMESTAMP()
                WHERE NOT EXISTS (SELECT 1 FROM `Roles` WHERE `TenantId` IS NULL AND `Name` = 'Accountant');

                INSERT INTO `Roles` (`Name`, `Description`, `TenantId`, `IsSystemRole`, `CreatedAtUtc`)
                SELECT 'User', 'Standard portal user with standard view access', NULL, 1, UTC_TIMESTAMP()
                WHERE NOT EXISTS (SELECT 1 FROM `Roles` WHERE `TenantId` IS NULL AND `Name` = 'User');

                INSERT INTO `Roles` (`Name`, `Description`, `TenantId`, `IsSystemRole`, `CreatedAtUtc`)
                SELECT 'Viewer', 'Read-only access across platform', NULL, 1, UTC_TIMESTAMP()
                WHERE NOT EXISTS (SELECT 1 FROM `Roles` WHERE `TenantId` IS NULL AND `Name` = 'Viewer');

                INSERT INTO `Roles` (`Name`, `Description`, `TenantId`, `IsSystemRole`, `CreatedAtUtc`)
                SELECT 'Customer', 'Client portal user with view access to their invoices and payments', NULL, 1, UTC_TIMESTAMP()
                WHERE NOT EXISTS (SELECT 1 FROM `Roles` WHERE `TenantId` IS NULL AND `Name` = 'Customer');
            ");

            // 3. Map default role permissions (idempotent INSERT IGNORE)
            migrationBuilder.Sql(@"
                -- Admin, TenantAdmin, SuperAdmin get all permissions
                INSERT IGNORE INTO `RolePermissions` (`RoleId`, `PermissionId`)
                SELECT r.`Id`, p.`Id`
                FROM `Roles` r
                CROSS JOIN `Permissions` p
                WHERE r.`Name` IN ('Admin', 'TenantAdmin', 'SuperAdmin') AND r.`TenantId` IS NULL;

                -- BillingManager
                INSERT IGNORE INTO `RolePermissions` (`RoleId`, `PermissionId`)
                SELECT r.`Id`, p.`Id`
                FROM `Roles` r
                CROSS JOIN `Permissions` p
                WHERE r.`Name` = 'BillingManager' AND r.`TenantId` IS NULL
                  AND p.`Module` IN ('Billing', 'Invoices', 'Quotations', 'Payments', 'Customers', 'Products', 'CreditNotes', 'Reports');

                -- Accountant
                INSERT IGNORE INTO `RolePermissions` (`RoleId`, `PermissionId`)
                SELECT r.`Id`, p.`Id`
                FROM `Roles` r
                CROSS JOIN `Permissions` p
                WHERE r.`Name` = 'Accountant' AND r.`TenantId` IS NULL
                  AND p.`Code` IN ('invoices.view', 'quotations.view', 'payments.view', 'payments.create', 'payments.manage', 'payments.refund', 'creditnotes.view', 'reports.view');

                -- User
                INSERT IGNORE INTO `RolePermissions` (`RoleId`, `PermissionId`)
                SELECT r.`Id`, p.`Id`
                FROM `Roles` r
                CROSS JOIN `Permissions` p
                WHERE r.`Name` = 'User' AND r.`TenantId` IS NULL
                  AND p.`Code` LIKE '%.view' AND p.`Module` NOT IN ('Administration', 'Audit');

                -- Viewer
                INSERT IGNORE INTO `RolePermissions` (`RoleId`, `PermissionId`)
                SELECT r.`Id`, p.`Id`
                FROM `Roles` r
                CROSS JOIN `Permissions` p
                WHERE r.`Name` = 'Viewer' AND r.`TenantId` IS NULL
                  AND p.`Code` LIKE '%.view' AND p.`Module` NOT IN ('Administration', 'Audit');

                -- Customer
                INSERT IGNORE INTO `RolePermissions` (`RoleId`, `PermissionId`)
                SELECT r.`Id`, p.`Id`
                FROM `Roles` r
                CROSS JOIN `Permissions` p
                WHERE r.`Name` = 'Customer' AND r.`TenantId` IS NULL
                  AND p.`Code` IN ('billing.view', 'invoices.view', 'quotations.view', 'payments.view', 'creditnotes.view');
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                DELETE FROM `Permissions` WHERE `Code` IN (
                    'audit.export', 'audit.view', 'backgroundjobs.manage', 'backgroundjobs.view',
                    'creditnotes.approve', 'creditnotes.create', 'creditnotes.delete', 'creditnotes.edit', 'creditnotes.manage', 'creditnotes.view',
                    'customers.create', 'customers.delete', 'customers.edit', 'customers.manage', 'customers.view',
                    'dashboard.view', 'exportjobs.create', 'exportjobs.view', 'integrations.manage', 'integrations.view',
                    'invoices.approve', 'invoices.create', 'invoices.delete', 'invoices.edit',
                    'payments.refund', 'products.create', 'products.delete', 'products.edit', 'products.manage', 'products.view',
                    'quotations.approve', 'quotations.create', 'quotations.delete', 'quotations.edit', 'quotations.manage', 'quotations.view',
                    'reports.export', 'settings.manage', 'settings.view',
                    'templates.create', 'templates.delete', 'templates.edit', 'templates.view',
                    'webhooks.manage', 'webhooks.view'
                );
            ");
        }
    }
}
