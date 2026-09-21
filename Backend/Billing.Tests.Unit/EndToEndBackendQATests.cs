using Billing.Application.Services;
using Billing.Contracts.Charges;
using Billing.Contracts.Discount;
using Billing.Contracts.Financial;
using Billing.Contracts.Numbering;
using Billing.Contracts.Tax;
using Billing.Domain.Entities;
using Billing.Domain.Enums;
using Billing.Tests.Unit.Fakes;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Billing.Tests.Unit;

/// <summary>
/// Comprehensive End-to-End QA Test Suite for Phase 5 Backend Deliverables (IBMSBE-021).
/// Validates multi-tenant isolation, the entire financial lifecycle (Taxes + Discounts + Charges + Numbering),
/// concurrency resilience, role-based override controls, and configuration audit trails.
/// </summary>
public class EndToEndBackendQATests
{
    private readonly FakeTaxRepository _taxRepo;
    private readonly FakeDiscountRuleRepository _discountRepo;
    private readonly FakeChargeRepository _chargeRepo;
    private readonly FakeNumberingRepository _numberingRepo;
    private readonly FakeAuditLogRepository _auditRepo;

    private readonly TaxSettingService _taxSettingService;
    private readonly TaxCalculationService _taxCalcService;
    private readonly DiscountService _discountService;
    private readonly ChargeSettingService _chargeSettingService;
    private readonly ChargeCalculationService _chargeCalcService;
    private readonly NumberingSettingService _numberingSettingService;
    private readonly NumberGenerationService _numberGenerationService;
    private readonly FinancialCalculationEngine _financialEngine;

    public EndToEndBackendQATests()
    {
        _taxRepo = new FakeTaxRepository();
        _discountRepo = new FakeDiscountRuleRepository();
        _chargeRepo = new FakeChargeRepository();
        _numberingRepo = new FakeNumberingRepository();
        _auditRepo = new FakeAuditLogRepository();

        _taxSettingService = new TaxSettingService(_taxRepo, _auditRepo);
        _taxCalcService = new TaxCalculationService(_taxRepo);

        _discountService = new DiscountService(
            _discountRepo,
            _auditRepo,
            NullLogger<DiscountService>.Instance);

        _chargeSettingService = new ChargeSettingService(_chargeRepo, _auditRepo);
        _chargeCalcService = new ChargeCalculationService(_chargeRepo);

        _numberGenerationService = new NumberGenerationService(_numberingRepo);
        _numberingSettingService = new NumberingSettingService(_numberingRepo, _numberGenerationService, _auditRepo);

        _financialEngine = new FinancialCalculationEngine(
            _discountService,
            _taxCalcService,
            _chargeCalcService,
            _taxRepo);
    }

    [Fact]
    public async Task E2E_FullFinancialLifecycle_TaxesDiscountsChargesAndNumbering_AllIntegrateSeamlessly()
    {
        const int tenantId = 100;
        var now = DateTime.UtcNow;

        // 1. Configure Numbering Settings
        var numberingUpdate = await _numberingSettingService.UpdateSettingAsync(new UpdateNumberingSettingRequest
        {
            DocumentType = "Invoice",
            Prefix = "INV-",
            Suffix = "-CORP",
            Tokens = "{YYYY}-{MM}-",
            SequenceLength = 4,
            NextNumber = 1,
            ResetPolicy = "Never"
        }, tenantId);
        Assert.True(numberingUpdate.Success);

        // 2. Configure Taxes (GST 18% Exclusive)
        var gstResult = await _taxSettingService.CreateTaxRateAsync(new CreateTaxRateRequest
        {
            Name = "GST 18%",
            Code = "GST-18",
            TaxType = "GST",
            Rate = 18.0m,
            ApplicationLevel = "Item",
            Priority = 1,
            IsCompound = false,
            IsInclusive = false
        }, tenantId);
        Assert.True(gstResult.Success);

        // 3. Configure Charges (Express Shipping: 100 Taxable @ 18%, Handling: 50 Non-Taxable)
        var shippingResult = await _chargeSettingService.CreateChargeAsync(new CreateChargeRequest
        {
            Name = "Express Shipping",
            Code = "EXP-SHIP",
            ChargeType = "Shipping",
            CalculationType = "Fixed",
            Amount = 100.0m,
            IsTaxable = true,
            Status = "Active"
        }, tenantId);
        Assert.True(shippingResult.Success);

        var handlingResult = await _chargeSettingService.CreateChargeAsync(new CreateChargeRequest
        {
            Name = "Packaging & Handling",
            Code = "PKG-HAND",
            ChargeType = "Handling",
            CalculationType = "Fixed",
            Amount = 50.0m,
            IsTaxable = false,
            Status = "Active"
        }, tenantId);
        Assert.True(handlingResult.Success);

        // 4. Configure Discount Rule (Tiered 10% on orders above 1000)
        var discountResult = await _discountService.CreateRuleAsync(new CreateDiscountRuleRequest
        {
            Code = "FESTIVE-10",
            Name = "Festive 10% Off",
            Description = "10% off for orders over 1000",
            Type = "Percentage",
            Scope = "Invoice",
            Value = 10.0m,
            MinInvoiceAmount = 1000m,
            MaxDiscountAmount = 250m,
            StartDateUtc = now.AddDays(-1),
            EndDateUtc = now.AddDays(30)
        }, tenantId, "TenantAdmin");
        Assert.True(discountResult.Success);

        // 5. Generate Next Sequential Invoice Number
        var generatedNumberResult = await _numberGenerationService.GenerateNextNumberAsync(new GenerateNumberRequest
        {
            DocumentType = "Invoice"
        }, tenantId);
        Assert.True(generatedNumberResult.Success);
        Assert.NotNull(generatedNumberResult.Data);
        var invoiceNumber = generatedNumberResult.Data.GeneratedNumber;
        Assert.StartsWith($"INV-{now:yyyy}-{now:MM}-0001-CORP", invoiceNumber);

        // 6. Run Complete Financial Calculation
        // Line Item 1: 2 units * 1000 = 2000 gross. Line Discount: 10% (200) => Net: 1800.
        // Tax 18% on 1800 = 324. Line Total: 2124.
        // GrossSubtotal = 2000, TotalLineDiscounts = 200, NetItemSubtotal = 1800, LineTaxesTotal = 324.
        // Invoice Discount: 10% on 1800 = 180. TaxableSubtotal = 1800 - 180 = 1620.
        // Charges: Shipping 100 (Taxable @ 18% = 18) + Handling 50 (Non-Taxable) = 150. Tax on charges = 18.
        // Grand Total = (1800 - 180) + 324 + 150 + 18 = 2112.
        var calcRequest = new FinancialCalculationRequest
        {
            Items = new List<FinancialLineItemRequest>
            {
                new()
                {
                    Name = "Enterprise Suite License",
                    ProductCode = "LIC-ENT",
                    Quantity = 2,
                    UnitPrice = 1000m,
                    LineDiscountType = "Fixed",
                    LineDiscountValue = 200m,
                    TaxRateId = gstResult.Data!.Id
                }
            },
            Charges = new List<FinancialChargeRequest>
            {
                new()
                {
                    Name = "Express Shipping",
                    ChargeCode = "EXP-SHIP",
                    CalculationType = "Fixed",
                    Amount = 100m,
                    IsTaxable = true,
                    TaxRatePercent = 18m
                },
                new()
                {
                    Name = "Packaging & Handling",
                    ChargeCode = "PKG-HAND",
                    CalculationType = "Fixed",
                    Amount = 50m,
                    IsTaxable = false
                }
            },
            InvoiceDiscount = new FinancialInvoiceDiscountRequest
            {
                DiscountType = "Percentage",
                Value = 10m
            }
        };

        var finalResult = await _financialEngine.CalculateAsync(calcRequest, tenantId, "TenantAdmin", "Prathap");
        Assert.True(finalResult.Success);
        Assert.NotNull(finalResult.Data);

        var data = finalResult.Data;
        Assert.Equal(2000m, data.GrossSubtotal);
        Assert.Equal(200m, data.TotalLineDiscounts);
        Assert.Equal(1800m, data.NetItemSubtotal);
        Assert.Equal(180m, data.InvoiceDiscountAmount);
        Assert.Equal(1620m, data.TaxableSubtotal);
        Assert.Equal(324m, data.LineTaxesTotal);
        Assert.Equal(150m, data.ChargesTotal);
        Assert.Equal(18m, data.TaxOnChargesTotal);
        Assert.Equal(2112m, data.GrandTotal);

        // 7. Verify Comprehensive Financial Configuration Audit Trails
        var auditLogs = _auditRepo.Logs.Where(x => x.TenantId == tenantId).ToList();
        Assert.NotEmpty(auditLogs);
        Assert.Contains(auditLogs, l => l.EntityName == "NumberingSetting" && l.Action == "UPDATE");
        Assert.Contains(auditLogs, l => l.EntityName == "TaxRate" && l.Action == "CREATE" && l.Changes != null && l.Changes.Contains("GST-18"));
        Assert.Contains(auditLogs, l => l.EntityName == "ChargeConfiguration" && l.Action == "CREATE" && l.Changes != null && l.Changes.Contains("EXP-SHIP"));
        Assert.Contains(auditLogs, l => l.EntityName == "ChargeConfiguration" && l.Action == "CREATE" && l.Changes != null && l.Changes.Contains("PKG-HAND"));
        Assert.Contains(auditLogs, l => l.EntityName == "DiscountRule" && l.Action == "CREATE" && l.Changes != null && l.Changes.Contains("Festive 10% Off"));
    }

    [Fact]
    public async Task E2E_MultiTenantIsolation_SeparateConfigurationsAndNumbering_NoLeakage()
    {
        const int tenantA = 201;
        const int tenantB = 202;

        // Tenant A: Prefix "T1-INV-", NextNumber 100
        await _numberingSettingService.UpdateSettingAsync(new UpdateNumberingSettingRequest
        {
            DocumentType = "Invoice",
            Prefix = "T1-INV-",
            Tokens = "",
            SequenceLength = 5,
            NextNumber = 100
        }, tenantA);

        // Tenant B: Prefix "T2-BILL-", NextNumber 500
        await _numberingSettingService.UpdateSettingAsync(new UpdateNumberingSettingRequest
        {
            DocumentType = "Invoice",
            Prefix = "T2-BILL-",
            Tokens = "",
            SequenceLength = 4,
            NextNumber = 500
        }, tenantB);

        // Tenant A: 18% GST
        var taxA = await _taxSettingService.CreateTaxRateAsync(new CreateTaxRateRequest
        {
            Name = "Tenant A Tax",
            Code = "TAX-A",
            TaxType = "GST",
            Rate = 18m
        }, tenantA);

        // Tenant B: 5% VAT
        var taxB = await _taxSettingService.CreateTaxRateAsync(new CreateTaxRateRequest
        {
            Name = "Tenant B Tax",
            Code = "TAX-B",
            TaxType = "VAT",
            Rate = 5m
        }, tenantB);

        // Concurrently generate numbers for both
        var taskA = _numberGenerationService.GenerateNextNumberAsync(new GenerateNumberRequest { DocumentType = "Invoice" }, tenantA);
        var taskB = _numberGenerationService.GenerateNextNumberAsync(new GenerateNumberRequest { DocumentType = "Invoice" }, tenantB);

        var results = await Task.WhenAll(taskA, taskB);

        Assert.Equal("T1-INV-00100", results[0].Data!.GeneratedNumber);
        Assert.Equal("T2-BILL-0500", results[1].Data!.GeneratedNumber);

        // Verify Tenant B cannot read Tenant A's tax rate
        var readCrossTenant = await _taxSettingService.GetTaxRateByIdAsync(taxA.Data!.Id, tenantB);
        Assert.False(readCrossTenant.Success);
        Assert.Equal("TAX_RATE_NOT_FOUND", readCrossTenant.ErrorCode);

        // Verify Tenant A cannot read Tenant B's tax rate
        var readCrossTenantReverse = await _taxSettingService.GetTaxRateByIdAsync(taxB.Data!.Id, tenantA);
        Assert.False(readCrossTenantReverse.Success);
        Assert.Equal("TAX_RATE_NOT_FOUND", readCrossTenantReverse.ErrorCode);
    }

    [Fact]
    public async Task E2E_RoleBasedDiscountOverride_AuditLoggedWithReason()
    {
        const int tenantId = 301;

        var overrideRequest = new CalculateInvoiceDiscountRequest
        {
            InvoiceSubtotal = 1000m,
            LineItems = new List<CalculateLineDiscountRequest>
            {
                new()
                {
                    UnitPrice = 500m,
                    Quantity = 2,
                    DiscountType = "Fixed",
                    DiscountValue = 0m
                }
            },
            IsManualOverride = true,
            InvoiceDiscountType = "Fixed",
            InvoiceDiscountValue = 200m,
            OverrideReason = "Special VIP Corporate Partner Agreement negotiated by VP of Sales"
        };

        var result = await _discountService.CalculateInvoiceDiscountAsync(
            overrideRequest,
            tenantId,
            userRole: "SuperAdmin",
            userName: "Prathap Admin");

        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.True(result.Data.IsOverrideApplied);
        Assert.Equal(200m, result.Data.TotalDiscountAmount);

        // Verify Audit Log entry created for Manual Override
        var overrideLog = _auditRepo.Logs.FirstOrDefault(l =>
            l.TenantId == tenantId &&
            l.EntityName == "Discount" &&
            l.Action == "MANUAL_OVERRIDE");

        Assert.NotNull(overrideLog);
        Assert.Equal("Prathap Admin", overrideLog.UserName);
        Assert.Contains("Special VIP Corporate Partner Agreement", overrideLog.Changes);
    }

    [Fact]
    public async Task E2E_NegativeScenarios_ValidationAndConflictsCleanlyRejected()
    {
        const int tenantId = 401;

        // 1. Conflict on duplicate charge code
        var chargeReq = new CreateChargeRequest
        {
            Name = "Platform Fee",
            Code = "PLAT-01",
            Amount = 25m
        };
        var firstCharge = await _chargeSettingService.CreateChargeAsync(chargeReq, tenantId);
        Assert.True(firstCharge.Success);

        var duplicateCharge = await _chargeSettingService.CreateChargeAsync(chargeReq, tenantId);
        Assert.False(duplicateCharge.Success);
        Assert.Equal("CHARGE_CODE_EXISTS", duplicateCharge.ErrorCode);

        // 2. Conflict on duplicate tax rate code
        var taxReq = new CreateTaxRateRequest
        {
            Name = "VAT Standard",
            Code = "VAT-STD",
            TaxType = "VAT",
            Rate = 12m
        };
        var firstTax = await _taxSettingService.CreateTaxRateAsync(taxReq, tenantId);
        Assert.True(firstTax.Success);

        var duplicateTax = await _taxSettingService.CreateTaxRateAsync(taxReq, tenantId);
        Assert.False(duplicateTax.Success);
        Assert.Equal("TAX_RATE_CODE_EXISTS", duplicateTax.ErrorCode);

        // 3. Validation rejection on invalid tenant ID
        var invalidTenant = await _numberingSettingService.UpdateSettingAsync(new UpdateNumberingSettingRequest
        {
            DocumentType = "Invoice",
            Prefix = "INV-",
            Tokens = "{YYYY}-{MM}-",
            SequenceLength = 4
        }, -1);
        Assert.False(invalidTenant.Success);
        Assert.Equal("Invalid tenant identifier", invalidTenant.Message);
    }
}
