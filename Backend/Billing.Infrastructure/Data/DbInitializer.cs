using Billing.Domain.Entities;
using Billing.Application.Interfaces;
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

            // 2. Ensure Roles & Permissions and Super Admin exist
            var roleRepo = scope.ServiceProvider.GetService<IRoleRepository>();
            if (roleRepo != null)
            {
                await roleRepo.SeedDefaultRolesAndPermissionsAsync();
            }

            var allPermCodes = await context.Permissions.Select(p => p.Code).ToListAsync();

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
                    Roles = new List<string> { "SuperAdmin", "TenantAdmin", "Admin" },
                    Permissions = allPermCodes,
                    IsActive = true,
                    CreatedAtUtc = DateTime.UtcNow
                };

                await context.Users.AddAsync(superAdmin);
                await context.SaveChangesAsync();
                logger?.LogInformation("Seeded default Super Admin with email: {Email} and {Count} permissions", normalizedEmail, allPermCodes.Count);
            }
            else
            {
                var rolesList = existingSuperAdmin.Roles;
                if (!rolesList.Contains("SuperAdmin")) rolesList.Add("SuperAdmin");
                if (!rolesList.Contains("TenantAdmin")) rolesList.Add("TenantAdmin");
                existingSuperAdmin.Roles = rolesList;
                existingSuperAdmin.Permissions = allPermCodes;
                await context.SaveChangesAsync();
                logger?.LogInformation("Updated existing Super Admin {Email} with full roles and permissions", normalizedEmail);
            }

            // Sync all TenantAdmin and Admin users with full permission set
            var adminUsers = await context.Users
                .Where(u => u.RolesString.Contains("TenantAdmin") || u.RolesString.Contains("Admin"))
                .ToListAsync();

            foreach (var au in adminUsers)
            {
                var combined = au.Permissions.Union(allPermCodes).Distinct().ToList();
                if (combined.Count != au.Permissions.Count)
                {
                    au.Permissions = combined;
                }
            }
            await context.SaveChangesAsync();
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

            if (!await context.InvoiceTemplates.AnyAsync(t => t.TenantId == 1))
            {
                var standardTemplate = new InvoiceTemplate
                {
                    TenantId = 1,
                    Name = "Standard Corporate",
                    Description = "Clean, professional standard invoice layout with balanced branding and clear financial breakdown.",
                    Style = Domain.Enums.TemplateStyle.Standard,
                    Status = Domain.Enums.TemplateStatus.Active,
                    IsDefault = true,
                    CurrentVersionNumber = 1,
                    CreatedAtUtc = DateTime.UtcNow,
                    CreatedBy = "SystemSeed"
                };

                var standardVersion = new TemplateVersion
                {
                    TenantId = 1,
                    VersionNumber = 1,
                    Status = Domain.Enums.TemplateStatus.Active,
                    VersionDescription = "Default corporate layout version 1",
                    BrandingJson = "{\"PrimaryColor\":\"#0f2942\",\"SecondaryColor\":\"#0284c7\",\"AccentColor\":\"#f1f5f9\",\"FontFamily\":\"Segoe UI\",\"LogoWidthMm\":40,\"LogoHeightMm\":20}",
                    CompanyDetailsJson = "{\"CompanyName\":\"IBMS Billing Enterprise\",\"Email\":\"billing@ibms.com\",\"Phone\":\"+91 98765 43210\",\"Website\":\"https://ibms.example.com\",\"AddressLine1\":\"Plot 42, Hitech City Main Road\",\"City\":\"Hyderabad\",\"State\":\"Telangana\",\"PostalCode\":\"500081\",\"Country\":\"India\",\"TaxId\":\"36AAAAA0000A1Z5\"}",
                    LayoutJson = "{\"ShowLogo\":true,\"ShowHeader\":true,\"ShowFooter\":true,\"ShowTaxBreakdown\":true,\"ShowPaymentInstructions\":true,\"ShowTermsAndConditions\":true,\"CurrencyCode\":\"INR\",\"CurrencySymbol\":\"â‚¹\",\"MarginTopMm\":12,\"MarginBottomMm\":12,\"MarginLeftMm\":14,\"MarginRightMm\":14}",
                    PaymentInstructionsJson = "{\"BankName\":\"State Bank of India\",\"AccountHolderName\":\"IBMS Tech Private Limited\",\"AccountNumber\":\"38192837461\",\"IfscCode\":\"SBIN0004123\",\"UpiId\":\"ibmsbilling@sbi\",\"PaymentNotes\":\"Please quote invoice number on payment transfer.\"} ",
                    TermsJson = "{\"TermsAndConditions\":\"1. Payment is due within 30 days of issue.\\n2. Late payments incur a 1.5% monthly charge.\\n3. Goods once sold will not be accepted back without prior written authorization.\",\"FooterNote\":\"Thank you for partnering with IBMS Technologies!\"}",
                    CreatedAtUtc = DateTime.UtcNow,
                    CreatedBy = "SystemSeed"
                };

                standardTemplate.Versions.Add(standardVersion);

                var proTemplate = new InvoiceTemplate
                {
                    TenantId = 1,
                    Name = "Modern Executive",
                    Description = "Sleek, high-contrast professional layout designed for enterprise consulting and services.",
                    Style = Domain.Enums.TemplateStyle.Professional,
                    Status = Domain.Enums.TemplateStatus.Active,
                    IsDefault = false,
                    CurrentVersionNumber = 1,
                    CreatedAtUtc = DateTime.UtcNow,
                    CreatedBy = "SystemSeed"
                };

                var proVersion = new TemplateVersion
                {
                    TenantId = 1,
                    VersionNumber = 1,
                    Status = Domain.Enums.TemplateStatus.Active,
                    VersionDescription = "Initial executive styling",
                    BrandingJson = "{\"PrimaryColor\":\"#1e1b4b\",\"SecondaryColor\":\"#4338ca\",\"AccentColor\":\"#e0e7ff\",\"FontFamily\":\"Segoe UI\",\"LogoWidthMm\":45,\"LogoHeightMm\":22}",
                    CompanyDetailsJson = "{\"CompanyName\":\"IBMS Global Services\",\"Email\":\"invoicing@ibms.com\",\"Phone\":\"+91 98765 43210\",\"Website\":\"https://ibms.example.com\",\"AddressLine1\":\"Tower 3, Financial District\",\"City\":\"Hyderabad\",\"State\":\"Telangana\",\"PostalCode\":\"500032\",\"Country\":\"India\",\"TaxId\":\"36AAAAA0000A1Z5\"}",
                    LayoutJson = "{\"ShowLogo\":true,\"ShowHeader\":true,\"ShowFooter\":true,\"ShowTaxBreakdown\":true,\"ShowPaymentInstructions\":true,\"ShowTermsAndConditions\":true,\"CurrencyCode\":\"INR\",\"CurrencySymbol\":\"â‚¹\",\"MarginTopMm\":10,\"MarginBottomMm\":10,\"MarginLeftMm\":12,\"MarginRightMm\":12}",
                    PaymentInstructionsJson = "{\"BankName\":\"HDFC Bank\",\"AccountHolderName\":\"IBMS Global Services Ltd\",\"AccountNumber\":\"50200012345678\",\"IfscCode\":\"HDFC0001234\",\"UpiId\":\"ibmsglobal@hdfcbank\",\"PaymentNotes\":\"Remit via RTGS / NEFT quoting invoice ID.\"} ",
                    TermsJson = "{\"TermsAndConditions\":\"Payment strictly net 15 calendar days from billing date. Subject to Hyderabad jurisdiction.\",\"FooterNote\":\"We appreciate your business!\"}",
                    CreatedAtUtc = DateTime.UtcNow,
                    CreatedBy = "SystemSeed"
                };

                proTemplate.Versions.Add(proVersion);

                var compactTemplate = new InvoiceTemplate
                {
                    TenantId = 1,
                    Name = "Compact Retail & Wholesale",
                    Description = "High line-item density layout tailored for fast wholesale, retail, and multi-item invoices.",
                    Style = Domain.Enums.TemplateStyle.Compact,
                    Status = Domain.Enums.TemplateStatus.Active,
                    IsDefault = false,
                    CurrentVersionNumber = 1,
                    CreatedAtUtc = DateTime.UtcNow,
                    CreatedBy = "SystemSeed"
                };

                var compactVersion = new TemplateVersion
                {
                    TenantId = 1,
                    VersionNumber = 1,
                    Status = Domain.Enums.TemplateStatus.Active,
                    VersionDescription = "Compact density version 1",
                    BrandingJson = "{\"PrimaryColor\":\"#047857\",\"SecondaryColor\":\"#059669\",\"AccentColor\":\"#ecfdf5\",\"FontFamily\":\"Segoe UI\",\"LogoWidthMm\":35,\"LogoHeightMm\":18}",
                    CompanyDetailsJson = "{\"CompanyName\":\"IBMS Distribution Hub\",\"Email\":\"hub@ibms.com\",\"Phone\":\"+91 98765 43210\",\"AddressLine1\":\"Warehouse 12, Industrial Area\",\"City\":\"Hyderabad\",\"State\":\"Telangana\",\"PostalCode\":\"500077\",\"Country\":\"India\",\"TaxId\":\"36AAAAA0000A1Z5\"}",
                    LayoutJson = "{\"ShowLogo\":true,\"ShowHeader\":true,\"ShowFooter\":true,\"ShowTaxBreakdown\":true,\"ShowPaymentInstructions\":true,\"ShowTermsAndConditions\":false,\"CurrencyCode\":\"INR\",\"CurrencySymbol\":\"â‚¹\",\"MarginTopMm\":8,\"MarginBottomMm\":8,\"MarginLeftMm\":10,\"MarginRightMm\":10}",
                    PaymentInstructionsJson = "{\"BankName\":\"ICICI Bank\",\"AccountHolderName\":\"IBMS Distribution\",\"AccountNumber\":\"000405001234\",\"IfscCode\":\"ICIC0000004\",\"UpiId\":\"ibmsdist@icici\"}",
                    TermsJson = "{\"TermsAndConditions\":\"Immediate payment upon receipt.\",\"FooterNote\":\"Computer generated invoice. Signature not required.\"} ",
                    CreatedAtUtc = DateTime.UtcNow,
                    CreatedBy = "SystemSeed"
                };

                compactTemplate.Versions.Add(compactVersion);

                await context.InvoiceTemplates.AddRangeAsync(standardTemplate, proTemplate, compactTemplate);
                await context.SaveChangesAsync();

                // Link active version IDs
                standardTemplate.ActiveVersionId = standardVersion.Id;
                proTemplate.ActiveVersionId = proVersion.Id;
                compactTemplate.ActiveVersionId = compactVersion.Id;
                await context.SaveChangesAsync();

                logger?.LogInformation("Seeded default invoice templates (Standard, Professional, Compact) for tenant 1");
            }

            // Add the reusable Pirnav layouts independently of the original seed block.
            var allTenantIds = await context.Tenants.Where(t => t.IsActive).Select(t => t.Id).ToListAsync();
            if (!allTenantIds.Contains(1)) allTenantIds.Add(1);
            if (!allTenantIds.Contains(2)) allTenantIds.Add(2);

            var pirnavTemplatesToSeed = new (string Name, string Design, string Description, Domain.Enums.TemplateStyle Style)[]
            {
                ("Pirnav Standard Invoice", "Banner", "Reusable Pirnav-branded invoice layout. Customer, invoice, item, payment, and total values are populated from the selected invoice.", Domain.Enums.TemplateStyle.Professional),
                ("Pirnav Template 4", "Corner", "Angled brown corner badge, highlighted balance due box, dashed details strip, and rounded header.", Domain.Enums.TemplateStyle.Professional)
            };

            foreach (var pirnavTenantId in allTenantIds)
            {
                foreach (var tmpl in pirnavTemplatesToSeed)
                {
                    var exists = await context.InvoiceTemplates.AnyAsync(t => t.TenantId == pirnavTenantId && t.Name == tmpl.Name);
                    if (exists) continue;

                    var pirnavTemplate = new InvoiceTemplate
                    {
                        TenantId = pirnavTenantId,
                        Name = tmpl.Name,
                        Description = tmpl.Description,
                        Style = tmpl.Style,
                        Status = Domain.Enums.TemplateStatus.Active,
                        CurrentVersionNumber = 1,
                        CreatedAtUtc = DateTime.UtcNow,
                        CreatedBy = "SystemSeed"
                    };



                    var pirnavVersion = new TemplateVersion
                    {
                        TenantId = pirnavTenantId,
                        VersionNumber = 1,
                        Status = Domain.Enums.TemplateStatus.Active,
                        VersionDescription = $"Initial {tmpl.Name} layout",
                        BrandingJson = "{\"LogoUrl\":\"/template-assets/pirnav.png\",\"LogoName\":\"pirnav.png\",\"LogoPosition\":\"right\",\"LogoWidth\":132,\"PrimaryColor\":\"#6B2D0C\",\"SecondaryColor\":\"#F6EBE3\",\"AccentColor\":\"#D9A57F\",\"FontFamily\":\"Segoe UI\"}",
                        CompanyDetailsJson = "{\"CompanyName\":\"Pirnav Software Solutions Pvt. Ltd.\",\"Email\":\"info@pirnav.com\",\"Phone\":\"+91 8121076485\",\"Website\":\"https://www.pirnav.com/\",\"AddressLine1\":\"Capital Park Road, Madhapur, Hitech City, Hyderabad, Telangana 500081\",\"Country\":\"India\"}",
                        LayoutJson = $"{{\"UsePirnavStandardLayout\":true,\"TemplateDesign\":\"{tmpl.Design}\",\"ShowLogo\":true,\"ShowHeader\":true,\"ShowFooter\":true,\"ShowTaxBreakdown\":true,\"ShowPaymentInstructions\":true,\"ShowTermsAndConditions\":true,\"CurrencyCode\":\"INR\",\"CurrencySymbol\":\"₹\",\"MarginTopMm\":12,\"MarginBottomMm\":12,\"MarginLeftMm\":14,\"MarginRightMm\":14}}",
                        PaymentInstructionsJson = "{}",
                        TermsJson = "{\"TermsAndConditions\":\"1. Payment should be made against this invoice as per the agreed payment terms.\\n2. Please mention the invoice number in all payment references.\\n3. Any billing discrepancy should be reported within 7 days from the invoice date.\\n4. Services are subject to the agreed scope and commercial terms.\",\"FooterNote\":\"Thank you for choosing us! This is a system-generated invoice and does not require a physical signature.\"}",
                        CreatedAtUtc = DateTime.UtcNow,
                        CreatedBy = "SystemSeed"
                    };

                    pirnavTemplate.Versions.Add(pirnavVersion);
                    await context.InvoiceTemplates.AddAsync(pirnavTemplate);
                    await context.SaveChangesAsync();
                    pirnavTemplate.ActiveVersionId = pirnavVersion.Id;
                    await context.SaveChangesAsync();
                    logger?.LogInformation("Seeded reusable {TemplateName} for tenant {TenantId}", tmpl.Name, pirnavTenantId);
                }
            }

            // Seed the Gemini AI created modern sidebar layout independently so existing templates are untouched.
            foreach (var geminiTenantId in new[] { 1, 2 })
            {
                var geminiTemplate = await context.InvoiceTemplates
                    .FirstOrDefaultAsync(t => t.TenantId == geminiTenantId && t.Name == "Pirnav Gemini Modern");
                if (geminiTemplate != null) continue;

                geminiTemplate = new InvoiceTemplate
                {
                    TenantId = geminiTenantId,
                    Name = "Pirnav Gemini Modern",
                    Description = "Modern two-column sidebar layout created with Gemini AI featuring branded company credentials, recipient billing, itemized billing with duration, and executive balance summary.",
                    Style = Domain.Enums.TemplateStyle.Professional,
                    Status = Domain.Enums.TemplateStatus.Active,
                    CurrentVersionNumber = 1,
                    CreatedAtUtc = DateTime.UtcNow,
                    CreatedBy = "SystemSeed"
                };

                var geminiVersion = new TemplateVersion
                {
                    TenantId = geminiTenantId,
                    VersionNumber = 1,
                    Status = Domain.Enums.TemplateStatus.Active,
                    VersionDescription = "Initial Gemini AI modern sidebar invoice layout",
                    BrandingJson = "{\"LogoUrl\":\"/template-assets/pirnav.png\",\"LogoName\":\"pirnav.png\",\"LogoPosition\":\"left\",\"LogoWidth\":140,\"PrimaryColor\":\"#5A2D16\",\"SecondaryColor\":\"#C98A5E\",\"AccentColor\":\"#F6EFEA\",\"FontFamily\":\"Segoe UI\"}",
                    CompanyDetailsJson = "{\"CompanyName\":\"Pirnav Software Solutions Pvt. Ltd.\",\"Email\":\"pradeep@pirnav.com\",\"Phone\":\"+91 8121076485\",\"Website\":\"https://www.pirnav.com/\",\"AddressLine1\":\"Capital Park Road, Cyber Hills Colony, VIP Hills\",\"City\":\"Madhapur, Hitech City, Hyderabad\",\"State\":\"Telangana\",\"PostalCode\":\"500081\",\"Country\":\"India\"}",
                    LayoutJson = "{\"UsePirnavSidebarLayout\":true,\"UsePirnavStandardLayout\":false,\"ShowLogo\":true,\"ShowHeader\":true,\"ShowFooter\":true,\"ShowTaxBreakdown\":true,\"ShowPaymentInstructions\":true,\"ShowTermsAndConditions\":true,\"CurrencyCode\":\"INR\",\"CurrencySymbol\":\"â‚¹\",\"MarginTopMm\":0,\"MarginBottomMm\":8,\"MarginLeftMm\":0,\"MarginRightMm\":10}",
                    PaymentInstructionsJson = "{}",
                    TermsJson = "{\"TermsAndConditions\":\"1. Payment should be made against this invoice as per the agreed payment terms.\\n2. Please mention the invoice number in all payment references.\\n3. Any billing discrepancy should be reported within 7 days from the invoice date.\\n4. Services are subject to the agreed scope and commercial terms.\",\"FooterNote\":\"Thank you for choosing us!\\nThis is a system-generated invoice and does not require a physical signature.\"}",
                    CreatedAtUtc = DateTime.UtcNow,
                    CreatedBy = "SystemSeed"
                };

                geminiTemplate.Versions.Add(geminiVersion);
                await context.InvoiceTemplates.AddAsync(geminiTemplate);
                await context.SaveChangesAsync();
                geminiTemplate.ActiveVersionId = geminiVersion.Id;
                await context.SaveChangesAsync();
                logger?.LogInformation("Seeded Pirnav Gemini Modern template for tenant {TenantId}", geminiTenantId);
            }
        }
        catch (Exception ex)
        {
            logger?.LogWarning(ex, "DbInitializer encountered an error during initialization: {Message}", ex.Message);
        }
    }
}
