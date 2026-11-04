using Billing.Application.Interfaces;
using Billing.Domain.Entities;
using Billing.Domain.Enums;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Billing.Infrastructure.Services;

public class TenantProvisioningService : ITenantProvisioningService
{
    private readonly BillingDbContext _context;
    private readonly ILogger<TenantProvisioningService>? _logger;

    public TenantProvisioningService(BillingDbContext context, ILogger<TenantProvisioningService>? logger = null)
    {
        _context = context;
        _logger = logger;
    }

    public async Task ProvisionTenantDefaultsAsync(int tenantId, string? state = null, CancellationToken cancellationToken = default)
    {
        _logger?.LogInformation("Provisioning default master data blueprint for tenant {TenantId}...", tenantId);

        // 1. Tax Settings
        if (!await _context.TaxSettings.AnyAsync(s => s.TenantId == tenantId, cancellationToken))
        {
            var taxSetting = new TaxSetting
            {
                TenantId = tenantId,
                IsTaxEnabled = true,
                DefaultTaxCalculation = "Exclusive",
                PricesIncludeTax = false,
                TaxNumberLabel = "GSTIN",
                EnableMultipleTaxes = true,
                State = !string.IsNullOrWhiteSpace(state) ? state.Trim() : "Telangana",
                CreatedAtUtc = DateTime.UtcNow
            };
            await _context.TaxSettings.AddAsync(taxSetting, cancellationToken);
        }

        // 2. Standard Tax Rates
        if (!await _context.TaxRates.AnyAsync(r => r.TenantId == tenantId, cancellationToken))
        {
            var defaultRates = new List<TaxRate>
            {
                new()
                {
                    TenantId = tenantId,
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
                    TenantId = tenantId,
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
                    TenantId = tenantId,
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
                    TenantId = tenantId,
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
                    TenantId = tenantId,
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
            await _context.TaxRates.AddRangeAsync(defaultRates, cancellationToken);
        }

        // 3. Charge Configurations
        if (!await _context.ChargeConfigurations.AnyAsync(c => c.TenantId == tenantId, cancellationToken))
        {
            var defaultCharges = new List<ChargeConfiguration>
            {
                new()
                {
                    TenantId = tenantId,
                    Name = "Standard Shipping",
                    Code = "SHIPPING-STD",
                    Description = "Standard parcel shipping charge",
                    ChargeType = ChargeType.Shipping,
                    CalculationType = ChargeCalculationType.Fixed,
                    Amount = 50.00m,
                    IsTaxable = true,
                    Status = "Active",
                    CreatedAtUtc = DateTime.UtcNow
                },
                new()
                {
                    TenantId = tenantId,
                    Name = "Handling Fee",
                    Code = "HANDLING-FEE",
                    Description = "Order packaging and handling fee",
                    ChargeType = ChargeType.Handling,
                    CalculationType = ChargeCalculationType.Fixed,
                    Amount = 25.00m,
                    IsTaxable = true,
                    Status = "Active",
                    CreatedAtUtc = DateTime.UtcNow
                },
                new()
                {
                    TenantId = tenantId,
                    Name = "Convenience Fee",
                    Code = "CONV-FEE",
                    Description = "Digital payment processing fee",
                    ChargeType = ChargeType.ConvenienceFee,
                    CalculationType = ChargeCalculationType.Percentage,
                    Amount = 2.00m,
                    IsTaxable = true,
                    Status = "Active",
                    CreatedAtUtc = DateTime.UtcNow
                },
                new()
                {
                    TenantId = tenantId,
                    Name = "Late Payment Fee",
                    Code = "LATE-FEE",
                    Description = "Invoice overdue late fee",
                    ChargeType = ChargeType.LateFee,
                    CalculationType = ChargeCalculationType.Fixed,
                    Amount = 100.00m,
                    IsTaxable = false,
                    Status = "Active",
                    CreatedAtUtc = DateTime.UtcNow
                }
            };
            await _context.ChargeConfigurations.AddRangeAsync(defaultCharges, cancellationToken);
        }

        // 4. Numbering Settings
        if (!await _context.NumberingSettings.AnyAsync(s => s.TenantId == tenantId, cancellationToken))
        {
            var defaultNumbering = new List<NumberingSetting>
            {
                new()
                {
                    TenantId = tenantId,
                    DocumentType = "Invoice",
                    Prefix = "INV-",
                    Tokens = "{YEAR}-",
                    SequenceLength = 4,
                    NextNumber = 1,
                    ResetPolicy = ResetPolicy.FinancialYear,
                    Status = "Active",
                    CreatedAtUtc = DateTime.UtcNow
                },
                new()
                {
                    TenantId = tenantId,
                    DocumentType = "Credit Note",
                    Prefix = "CN-",
                    Tokens = "{YEAR}-",
                    SequenceLength = 4,
                    NextNumber = 1,
                    ResetPolicy = ResetPolicy.FinancialYear,
                    Status = "Active",
                    CreatedAtUtc = DateTime.UtcNow
                },
                new()
                {
                    TenantId = tenantId,
                    DocumentType = "Quotation",
                    Prefix = "QT-",
                    Tokens = "{YEAR}-{MM}-",
                    SequenceLength = 4,
                    NextNumber = 1,
                    ResetPolicy = ResetPolicy.FinancialYear,
                    Status = "Active",
                    CreatedAtUtc = DateTime.UtcNow
                },
                new()
                {
                    TenantId = tenantId,
                    DocumentType = "Payment",
                    Prefix = "PAY-",
                    Tokens = "{YEAR}-",
                    SequenceLength = 4,
                    NextNumber = 1,
                    ResetPolicy = ResetPolicy.FinancialYear,
                    Status = "Active",
                    CreatedAtUtc = DateTime.UtcNow
                }
            };
            await _context.NumberingSettings.AddRangeAsync(defaultNumbering, cancellationToken);
        }

        // 5. Default Invoice Template
        if (!await _context.InvoiceTemplates.AnyAsync(t => t.TenantId == tenantId, cancellationToken))
        {
            var template = new InvoiceTemplate
            {
                TenantId = tenantId,
                Name = "Standard Corporate",
                Description = "Clean, professional standard invoice layout with balanced branding and clear financial breakdown.",
                Style = TemplateStyle.Standard,
                Status = TemplateStatus.Active,
                IsDefault = true,
                CurrentVersionNumber = 1,
                CreatedAtUtc = DateTime.UtcNow,
                CreatedBy = "System"
            };
            await _context.InvoiceTemplates.AddAsync(template, cancellationToken);
            await _context.SaveChangesAsync(cancellationToken);

            var templateVersion = new TemplateVersion
            {
                TenantId = tenantId,
                TemplateId = template.Id,
                VersionNumber = 1,
                Status = TemplateStatus.Active,
                VersionDescription = "Default corporate layout version 1",
                BrandingJson = "{\"PrimaryColor\":\"#0f2942\",\"SecondaryColor\":\"#0284c7\",\"AccentColor\":\"#f1f5f9\",\"FontFamily\":\"Segoe UI\",\"LogoWidthMm\":40,\"LogoHeightMm\":20}",
                LayoutJson = "{\"ShowHeader\":true,\"ShowLogo\":true,\"ShowCompanyDetails\":true,\"ShowBillingAddress\":true,\"ShowShippingAddress\":true,\"ShowLineItemNumbers\":true,\"ShowHsnSacCode\":true,\"ShowTaxBreakdown\":true,\"ShowNotes\":true,\"ShowTerms\":true,\"ShowPaymentInstructions\":true,\"ShowSignature\":true}",
                CompanyDetailsJson = "{\"CompanyName\":\"Organization\",\"Address\":\"Registered Address\",\"City\":\"City\",\"State\":\"State\",\"Country\":\"India\",\"PostalCode\":\"500001\"}",
                PaymentInstructionsJson = "{\"BankName\":\"Bank\",\"AccountNumber\":\"000000000000\",\"IfscCode\":\"IFSC0000000\",\"AccountType\":\"Current\"}",
                TermsJson = "{\"Terms\":[\"Payment is due within payment terms specified.\",\"Please quote invoice number in all communications.\"]}",
                CreatedAtUtc = DateTime.UtcNow,
                CreatedBy = "System"
            };
            await _context.TemplateVersions.AddAsync(templateVersion, cancellationToken);
        }

        await _context.SaveChangesAsync(cancellationToken);
        _logger?.LogInformation("Successfully provisioned default blueprint for tenant {TenantId}.", tenantId);
    }
}
