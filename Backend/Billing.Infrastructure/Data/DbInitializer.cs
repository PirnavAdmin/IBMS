using Billing.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Billing.Infrastructure.Data;

public static class DbInitializer
{
    public static async Task InitializeAsync(IServiceProvider serviceProvider)
    {
        using var scope = serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<BillingDbContext>();
        var configuration = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        var logger = scope.ServiceProvider.GetService<ILoggerFactory>()?.CreateLogger("DbInitializer");

        try
        {
            // 1. Ensure default Tenant exists
            var defaultTenant = await context.Tenants.FirstOrDefaultAsync(t => t.Id == 1 || t.TenantCode == "default");
            if (defaultTenant == null)
            {
                defaultTenant = new Tenant
                {
                    Name = "Default Organization",
                    TenantCode = "default",
                    CompanyEmail = "admin@ibms.local",
                    IsActive = true,
                    CreatedAtUtc = DateTime.UtcNow
                };
                await context.Tenants.AddAsync(defaultTenant);
                await context.SaveChangesAsync();
                logger?.LogInformation("Created default tenant (TenantCode: default, Id: {Id})", defaultTenant.Id);
            }

            // 2. Ensure Super Admin exists
            var seedSection = configuration.GetSection("SuperAdminSeed");
            var adminEmail = seedSection["Email"] ?? "superadmin@ibms.com";
            var adminPassword = seedSection["Password"] ?? "SuperAdmin@123!";
            var adminName = seedSection["Name"] ?? "Super Admin";

            var normalizedEmail = adminEmail.Trim().ToLowerInvariant();
            var existingSuperAdmin = await context.Users
                .FirstOrDefaultAsync(u => u.Email == normalizedEmail || u.RolesJson.Contains("SuperAdmin"));

            if (existingSuperAdmin == null)
            {
                var passwordHash = BCrypt.Net.BCrypt.HashPassword(adminPassword);
                var superAdmin = new User
                {
                    Name = adminName,
                    Username = normalizedEmail,
                    Email = normalizedEmail,
                    PasswordHash = passwordHash,
                    TenantId = null,
                    ApplicationId = "IBMS-Billing",
                    Roles = new List<string> { "SuperAdmin" },
                    Permissions = new List<string> { "all", "billing.admin", "billing.view", "billing.create", "billing.manage_customers" },
                    IsActive = true,
                    CreatedAtUtc = DateTime.UtcNow
                };

                await context.Users.AddAsync(superAdmin);
                await context.SaveChangesAsync();
                logger?.LogInformation("Seeded default Super Admin with email: {Email}", normalizedEmail);
            }
        }
        catch (Exception ex)
        {
            logger?.LogWarning(ex, "DbInitializer encountered an error during initialization: {Message}", ex.Message);
        }
    }
}
