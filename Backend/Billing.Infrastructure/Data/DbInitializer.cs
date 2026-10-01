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
                .FirstOrDefaultAsync(u => u.Email == normalizedEmail || u.RolesString.Contains("SuperAdmin"));

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
                    Roles = new List<string> { "SuperAdmin", "TenantAdmin" },
                    Permissions = new List<string> { "all", "billing.admin", "billing.view", "billing.create", "billing.manage_customers" },
                    IsActive = true,
                    CreatedAtUtc = DateTime.UtcNow
                };

                await context.Users.AddAsync(superAdmin);
                await context.SaveChangesAsync();
                logger?.LogInformation("Seeded default Super Admin with email: {Email}", normalizedEmail);
            }
            else if (!existingSuperAdmin.Roles.Contains("SuperAdmin"))
            {
                existingSuperAdmin.Roles = new List<string> { "SuperAdmin", "TenantAdmin" };
                await context.SaveChangesAsync();
                logger?.LogInformation("Updated existing user {Email} with SuperAdmin,TenantAdmin roles", normalizedEmail);
            }

            // 3. Ensure default Tax Settings & Standard Rates exist for tenant 1
            var defaultSettings = await context.TaxSettings.FirstOrDefaultAsync(s => s.TenantId == 1);
            if (defaultSettings == null)
            {
                defaultSettings = new TaxSetting
                {
                    TenantId = 1,
                    IsTaxEnabled = true,
                    DefaultTaxCalculation = "Exclusive",
                    PricesIncludeTax = false,
                    TaxNumberLabel = "GSTIN",
                    EnableMultipleTaxes = true,
                    State = "Telangana",
                    CreatedAtUtc = DateTime.UtcNow
                };
                await context.TaxSettings.AddAsync(defaultSettings);
                await context.SaveChangesAsync();
                logger?.LogInformation("Created default tax settings for tenant 1");
            }

            if (!await context.TaxRates.AnyAsync(r => r.TenantId == 1))
            {
                var defaultRates = new List<TaxRate>
                {
                    new()
                    {
                        TenantId = 1,
                        Name = "GST 18%",
                        Code = "GST_18",
                        TaxType = "GST",
                        Rate = 18.00m,
                        Description = "Standard GST 18% (Auto splits into CGST 9% + SGST 9% for intra-state)",
                        IsCompound = false,
                        IsInclusive = false,
                        ApplicationLevel = "Both",
                        Priority = 1,
                        Status = "Active"
                    },
                    new()
                    {
                        TenantId = 1,
                        Name = "CGST 9%",
                        Code = "CGST_9",
                        TaxType = "CGST",
                        Rate = 9.00m,
                        Description = "Central Goods and Services Tax 9%",
                        IsCompound = false,
                        IsInclusive = false,
                        ApplicationLevel = "Item",
                        Priority = 1,
                        Status = "Active"
                    },
                    new()
                    {
                        TenantId = 1,
                        Name = "SGST 9%",
                        Code = "SGST_9",
                        TaxType = "SGST",
                        Rate = 9.00m,
                        Description = "State Goods and Services Tax 9%",
                        IsCompound = false,
                        IsInclusive = false,
                        ApplicationLevel = "Item",
                        Priority = 1,
                        Status = "Active"
                    },
                    new()
                    {
                        TenantId = 1,
                        Name = "IGST 18%",
                        Code = "IGST_18",
                        TaxType = "IGST",
                        Rate = 18.00m,
                        Description = "Integrated Goods and Services Tax 18% for inter-state",
                        IsCompound = false,
                        IsInclusive = false,
                        ApplicationLevel = "Both",
                        Priority = 1,
                        Status = "Active"
                    },
                    new()
                    {
                        TenantId = 1,
                        Name = "VAT 5%",
                        Code = "VAT_5",
                        TaxType = "VAT",
                        Rate = 5.00m,
                        Description = "Standard VAT rate 5%",
                        IsCompound = false,
                        IsInclusive = false,
                        ApplicationLevel = "Item",
                        Priority = 1,
                        Status = "Active"
                    }
                };

                await context.TaxRates.AddRangeAsync(defaultRates);
                await context.SaveChangesAsync();
                logger?.LogInformation("Seeded default tax rates for tenant 1");
            }

            if (!await context.ChargeConfigurations.AnyAsync(c => c.TenantId == 1))
            {
                var defaultCharges = new List<ChargeConfiguration>
                {
                    new()
                    {
                        TenantId = 1,
                        Name = "Standard Shipping",
                        Code = "SHIPPING-STD",
                        Description = "Standard parcel shipping charge",
                        ChargeType = Domain.Enums.ChargeType.Shipping,
                        CalculationType = Domain.Enums.ChargeCalculationType.Fixed,
                        Amount = 50.00m,
                        IsTaxable = true,
                        Status = "Active",
                        CreatedAtUtc = DateTime.UtcNow
                    },
                    new()
                    {
                        TenantId = 1,
                        Name = "Handling Fee",
                        Code = "HANDLING-FEE",
                        Description = "Order packaging and handling fee",
                        ChargeType = Domain.Enums.ChargeType.Handling,
                        CalculationType = Domain.Enums.ChargeCalculationType.Fixed,
                        Amount = 25.00m,
                        IsTaxable = true,
                        Status = "Active",
                        CreatedAtUtc = DateTime.UtcNow
                    },
                    new()
                    {
                        TenantId = 1,
                        Name = "Convenience Fee",
                        Code = "CONV-FEE",
                        Description = "Digital payment processing fee",
                        ChargeType = Domain.Enums.ChargeType.ConvenienceFee,
                        CalculationType = Domain.Enums.ChargeCalculationType.Percentage,
                        Amount = 2.00m,
                        IsTaxable = true,
                        Status = "Active",
                        CreatedAtUtc = DateTime.UtcNow
                    },
                    new()
                    {
                        TenantId = 1,
                        Name = "Late Payment Fee",
                        Code = "LATE-FEE",
                        Description = "Invoice overdue late fee",
                        ChargeType = Domain.Enums.ChargeType.LateFee,
                        CalculationType = Domain.Enums.ChargeCalculationType.Fixed,
                        Amount = 100.00m,
                        IsTaxable = false,
                        Status = "Active",
                        CreatedAtUtc = DateTime.UtcNow
                    }
                };

                await context.ChargeConfigurations.AddRangeAsync(defaultCharges);
                await context.SaveChangesAsync();
                logger?.LogInformation("Seeded default charge configurations for tenant 1");
            }

            if (!await context.NumberingSettings.AnyAsync(s => s.TenantId == 1))
            {
                var defaultNumbering = new List<NumberingSetting>
                {
                    new()
                    {
                        TenantId = 1,
                        DocumentType = "Invoice",
                        Prefix = "INV-",
                        Tokens = "{YEAR}-",
                        SequenceLength = 4,
                        NextNumber = 1,
                        ResetPolicy = Domain.Enums.ResetPolicy.FinancialYear,
                        Status = "Active",
                        CreatedAtUtc = DateTime.UtcNow
                    },
                    new()
                    {
                        TenantId = 1,
                        DocumentType = "Credit Note",
                        Prefix = "CN-",
                        Tokens = "{YEAR}-",
                        SequenceLength = 4,
                        NextNumber = 1,
                        ResetPolicy = Domain.Enums.ResetPolicy.FinancialYear,
                        Status = "Active",
                        CreatedAtUtc = DateTime.UtcNow
                    },
                    new()
                    {
                        TenantId = 1,
                        DocumentType = "Quotation",
                        Prefix = "QT-",
                        Tokens = "{YEAR}-{MM}-",
                        SequenceLength = 4,
                        NextNumber = 1,
                        ResetPolicy = Domain.Enums.ResetPolicy.FinancialYear,
                        Status = "Active",
                        CreatedAtUtc = DateTime.UtcNow
                    },
                    new()
                    {
                        TenantId = 1,
                        DocumentType = "Estimate / Quote",
                        Prefix = "EST-",
                        Tokens = "{YEAR}-",
                        SequenceLength = 4,
                        NextNumber = 1,
                        ResetPolicy = Domain.Enums.ResetPolicy.Yearly,
                        Status = "Active",
                        CreatedAtUtc = DateTime.UtcNow
                    },
                    new()
                    {
                        TenantId = 1,
                        DocumentType = "Recurring Invoice",
                        Prefix = "REC-",
                        Tokens = "{YEAR}-",
                        SequenceLength = 4,
                        NextNumber = 1,
                        ResetPolicy = Domain.Enums.ResetPolicy.Yearly,
                        Status = "Active",
                        CreatedAtUtc = DateTime.UtcNow
                    },
                    new()
                    {
                        TenantId = 1,
                        DocumentType = "Delivery Challan",
                        Prefix = "DC-",
                        Tokens = "{YEAR}-",
                        SequenceLength = 4,
                        NextNumber = 1,
                        ResetPolicy = Domain.Enums.ResetPolicy.FinancialYear,
                        Status = "Active",
                        CreatedAtUtc = DateTime.UtcNow
                    },
                    new()
                    {
                        TenantId = 1,
                        DocumentType = "Payment",
                        Prefix = "PAY-",
                        Tokens = "{YEAR}-",
                        SequenceLength = 4,
                        NextNumber = 1,
                        ResetPolicy = Domain.Enums.ResetPolicy.FinancialYear,
                        Status = "Active",
                        CreatedAtUtc = DateTime.UtcNow
                    }
                };

                await context.NumberingSettings.AddRangeAsync(defaultNumbering);
                await context.SaveChangesAsync();
                logger?.LogInformation("Seeded default numbering settings for tenant 1");
            }
            else if (!await context.NumberingSettings.AnyAsync(s => s.TenantId == 1 && s.DocumentType == "Payment"))
            {
                await context.NumberingSettings.AddAsync(new NumberingSetting
                {
                    TenantId = 1,
                    DocumentType = "Payment",
                    Prefix = "PAY-",
                    Tokens = "{YEAR}-",
                    SequenceLength = 4,
                    NextNumber = 1,
                    ResetPolicy = Domain.Enums.ResetPolicy.FinancialYear,
                    Status = "Active",
                    CreatedAtUtc = DateTime.UtcNow
                });
                await context.SaveChangesAsync();
                logger?.LogInformation("Seeded default Payment numbering setting for tenant 1");
            }

            // 4. Ensure at least one demo Customer and Issued Invoice exist for tenant 1 so Payment testing works out of the box
            var demoCustomer = await context.Customers.FirstOrDefaultAsync(c => c.TenantId == 1);
            if (demoCustomer == null)
            {
                demoCustomer = new Customer
                {
                    TenantId = 1,
                    CustomerCode = "CUST-0001",
                    Name = "Acme Global Pvt Ltd",
                    CompanyName = "Acme Global Pvt Ltd",
                    Email = "accounts@acmeglobal.com",
                    Phone = "9876543210",
                    CustomerType = "Business",
                    Currency = "INR",
                    State = "Telangana",
                    Country = "India",
                    Status = "Active",
                    CreatedAtUtc = DateTime.UtcNow,
                    RowVersion = DateTime.UtcNow
                };
                await context.Customers.AddAsync(demoCustomer);
                await context.SaveChangesAsync();
                logger?.LogInformation("Seeded default demo Customer (Id: {Id}) for tenant 1", demoCustomer.Id);
            }

            if (!await context.Invoices.AnyAsync(i => i.TenantId == 1))
            {
                var demoInvoice = new Invoice
                {
                    TenantId = 1,
                    CustomerId = demoCustomer.Id,
                    InvoiceNumber = "INV-2026-0001",
                    InvoiceDate = DateTime.UtcNow.Date,
                    DueDate = DateTime.UtcNow.Date.AddDays(30),
                    Status = "Issued",
                    Subtotal = 1000.00m,
                    DiscountAmount = 0.00m,
                    TaxAmount = 180.00m,
                    ChargesAmount = 0.00m,
                    TotalAmount = 1180.00m,
                    PaidAmount = 0.00m,
                    BalanceAmount = 1180.00m,
                    Notes = "Demo issued invoice for testing Payment Management",
                    CreatedAtUtc = DateTime.UtcNow,
                    RowVersion = DateTime.UtcNow
                };
                await context.Invoices.AddAsync(demoInvoice);
                await context.SaveChangesAsync();
                logger?.LogInformation("Seeded default Issued Invoice (Id: {Id}, Number: {Number}) for tenant 1", demoInvoice.Id, demoInvoice.InvoiceNumber);
            }
        }
        catch (Exception ex)
        {
            logger?.LogWarning(ex, "DbInitializer encountered an error during initialization: {Message}", ex.Message);
        }
    }
}
