using Billing.Application.Services;
using Billing.Contracts.Charges;
using Billing.Contracts.Discount;
using Billing.Contracts.Numbering;
using Billing.Contracts.Tax;
using Billing.Domain.Entities;
using Billing.Domain.Enums;
using Billing.Tests.Unit.Fakes;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Billing.Tests.Unit;

public class FinancialConfigurationAuditTests
{
    private readonly FakeAuditLogRepository _auditRepo;

    public FinancialConfigurationAuditTests()
    {
        _auditRepo = new FakeAuditLogRepository();
    }

    [Fact]
    public async Task TaxSettings_Update_WritesAuditLog()
    {
        var taxRepo = new FakeTaxRepository();
        var taxService = new TaxSettingService(taxRepo, _auditRepo);
        const int tenantId = 1;

        var updateReq = new UpdateTaxSettingsRequest
        {
            IsTaxEnabled = true,
            DefaultTaxCalculation = "Inclusive",
            PricesIncludeTax = true,
            State = "Karnataka"
        };

        var result = await taxService.UpdateTaxSettingsAsync(updateReq, tenantId);

        Assert.True(result.Success);
        Assert.Contains(_auditRepo.Logs, l => l.EntityName == "TaxSetting" && l.Action == "UPDATE" && l.TenantId == tenantId);
    }

    [Fact]
    public async Task TaxRate_CreateUpdateDelete_WritesAuditLogs()
    {
        var taxRepo = new FakeTaxRepository();
        var taxService = new TaxSettingService(taxRepo, _auditRepo);
        const int tenantId = 2;

        // 1. Create
        var createReq = new CreateTaxRateRequest
        {
            Name = "GST 18%",
            Code = "GST18",
            TaxType = "GST",
            Rate = 18.00m,
            Priority = 1
        };
        var createRes = await taxService.CreateTaxRateAsync(createReq, tenantId);
        Assert.True(createRes.Success);
        Assert.Contains(_auditRepo.Logs, l => l.EntityName == "TaxRate" && l.Action == "CREATE" && l.EntityId == createRes.Data!.Id.ToString());

        // 2. Update
        var updateReq = new UpdateTaxRateRequest
        {
            Name = "GST 18% Updated",
            Rate = 18.00m
        };
        var updateRes = await taxService.UpdateTaxRateAsync(createRes.Data!.Id, updateReq, tenantId);
        Assert.True(updateRes.Success);
        Assert.Contains(_auditRepo.Logs, l => l.EntityName == "TaxRate" && l.Action == "UPDATE" && l.EntityId == createRes.Data!.Id.ToString());

        // 3. Delete
        var deleteRes = await taxService.DeleteTaxRateAsync(createRes.Data!.Id, tenantId);
        Assert.True(deleteRes.Success);
        Assert.Contains(_auditRepo.Logs, l => l.EntityName == "TaxRate" && l.Action == "DELETE" && l.EntityId == createRes.Data!.Id.ToString());
    }

    [Fact]
    public async Task DiscountRule_CreateUpdateDelete_WritesAuditLogs()
    {
        var discountRepo = new FakeDiscountRuleRepository();
        var discountService = new DiscountService(discountRepo, _auditRepo, NullLogger<DiscountService>.Instance);
        const int tenantId = 3;

        // 1. Create Rule
        var createReq = new CreateDiscountRuleRequest
        {
            Code = "SUMMER20",
            Name = "Summer Sale",
            Type = "Percentage",
            Scope = "Invoice",
            Value = 20.00m
        };
        var createRes = await discountService.CreateRuleAsync(createReq, tenantId, userRole: "Admin");
        Assert.True(createRes.Success);
        Assert.Contains(_auditRepo.Logs, l => l.EntityName == "DiscountRule" && l.Action == "CREATE" && l.EntityId == createRes.Data!.Id.ToString());

        // 2. Update Rule
        var updateReq = new UpdateDiscountRuleRequest
        {
            Name = "Summer Sale Extended",
            Value = 25.00m,
            Status = "Active"
        };
        var updateRes = await discountService.UpdateRuleAsync(createRes.Data!.Id, updateReq, tenantId, userRole: "Admin");
        Assert.True(updateRes.Success);
        Assert.Contains(_auditRepo.Logs, l => l.EntityName == "DiscountRule" && l.Action == "UPDATE" && l.EntityId == createRes.Data!.Id.ToString());

        // 3. Delete Rule
        var deleteRes = await discountService.DeleteRuleAsync(createRes.Data!.Id, tenantId, userRole: "Admin");
        Assert.True(deleteRes.Success);
        Assert.Contains(_auditRepo.Logs, l => l.EntityName == "DiscountRule" && l.Action == "DELETE" && l.EntityId == createRes.Data!.Id.ToString());
    }

    [Fact]
    public async Task Discount_ManualOverride_WritesDetailedAuditLog()
    {
        var discountRepo = new FakeDiscountRuleRepository();
        var discountService = new DiscountService(discountRepo, _auditRepo, NullLogger<DiscountService>.Instance);
        const int tenantId = 1;

        // Apply discount exceeding 50% limit with manual override
        var req = new CalculateInvoiceDiscountRequest
        {
            InvoiceId = "INV-2026-9999",
            InvoiceDiscountType = "Percentage",
            InvoiceDiscountValue = 60.00m, // exceeds default 50% max limit
            IsManualOverride = true,
            OverrideReason = "Special VIP customer discount approved by director",
            UserRole = "Manager",
            LineItems = new List<CalculateLineDiscountRequest>
            {
                new() { ProductId = 1, ProductName = "Server License", UnitPrice = 1000m, Quantity = 1 }
            }
        };

        var result = await discountService.CalculateInvoiceDiscountAsync(req, tenantId, userRole: "Manager", userName: "ManagerPrathap");

        Assert.True(result.Success);
        Assert.True(result.Data!.IsOverrideApplied);

        var audit = _auditRepo.Logs.FirstOrDefault(l => l.EntityName == "Discount" && l.Action == "MANUAL_OVERRIDE");
        Assert.NotNull(audit);
        Assert.Equal("INV-2026-9999", audit.EntityId);
        Assert.Equal("ManagerPrathap", audit.UserName);
        Assert.Contains("Special VIP customer discount approved by director", audit.Changes);
    }

    [Fact]
    public async Task ChargeConfiguration_CreateUpdateDelete_WritesAuditLogs()
    {
        var chargeRepo = new FakeChargeRepository();
        var chargeService = new ChargeSettingService(chargeRepo, _auditRepo);
        const int tenantId = 4;

        // 1. Create Charge
        var createReq = new CreateChargeRequest
        {
            Name = "Express Shipping",
            Code = "EXP-SHIP",
            ChargeType = "Shipping",
            CalculationType = "Fixed",
            Amount = 250.00m,
            IsTaxable = true
        };
        var createRes = await chargeService.CreateChargeAsync(createReq, tenantId);
        Assert.True(createRes.Success);
        Assert.Contains(_auditRepo.Logs, l => l.EntityName == "ChargeConfiguration" && l.Action == "CREATE" && l.EntityId == createRes.Data!.Id.ToString());

        // 2. Update Charge
        var updateReq = new UpdateChargeRequest
        {
            Name = "Express Shipping Air",
            Amount = 300.00m,
            Status = "Active"
        };
        var updateRes = await chargeService.UpdateChargeAsync(createRes.Data!.Id, updateReq, tenantId);
        Assert.True(updateRes.Success);
        Assert.Contains(_auditRepo.Logs, l => l.EntityName == "ChargeConfiguration" && l.Action == "UPDATE" && l.EntityId == createRes.Data!.Id.ToString());

        // 3. Delete Charge
        var deleteRes = await chargeService.DeleteChargeAsync(createRes.Data!.Id, tenantId);
        Assert.True(deleteRes.Success);
        Assert.Contains(_auditRepo.Logs, l => l.EntityName == "ChargeConfiguration" && l.Action == "DELETE" && l.EntityId == createRes.Data!.Id.ToString());
    }

    [Fact]
    public async Task NumberingSettings_Update_WritesAuditLog()
    {
        var numRepo = new FakeNumberingRepository();
        var genService = new NumberGenerationService(numRepo);
        var numService = new NumberingSettingService(numRepo, genService, _auditRepo);
        const int tenantId = 5;

        var updateReq = new UpdateNumberingSettingRequest
        {
            DocumentType = "Invoice",
            Prefix = "BL-",
            Tokens = "{YEAR}-{MONTH}-",
            SequenceLength = 5,
            NextNumber = 10,
            ResetPolicy = "Yearly"
        };

        var result = await numService.UpdateSettingAsync(updateReq, tenantId);

        Assert.True(result.Success);
        Assert.Contains(_auditRepo.Logs, l => l.EntityName == "NumberingSetting" && l.Action == "UPDATE" && l.TenantId == tenantId);

        var audit = _auditRepo.Logs.First(l => l.EntityName == "NumberingSetting");
        Assert.Contains("Invoice", audit.Changes);
        Assert.Contains("BL-", audit.Changes);
    }
}
