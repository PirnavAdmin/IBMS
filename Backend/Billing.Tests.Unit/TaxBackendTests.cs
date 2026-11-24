using System.Security.Claims;
using Billing.API.Controllers;
using Billing.Application.Services;
using Billing.Contracts;
using Billing.Contracts.Tax;
using Billing.Domain.Entities;
using Billing.Tests.Unit.Fakes;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Billing.Tests.Unit;

public class TaxBackendTests
{
    private readonly FakeTaxRepository _repository;
    private readonly TaxSettingService _settingService;
    private readonly TaxCalculationService _calculationService;
    private readonly TaxSettingsController _controller;

    public TaxBackendTests()
    {
        _repository = new FakeTaxRepository();
        _settingService = new TaxSettingService(_repository);
        _calculationService = new TaxCalculationService(_repository);
        _controller = new TaxSettingsController(_settingService, _calculationService, NullLogger<TaxSettingsController>.Instance);

        SetUserContext(_controller, tenantId: 1, role: "TenantAdmin", email: "admin@tenant1.com");
    }

    private static void SetUserContext(ControllerBase controller, int tenantId, string role, string email)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, "1"),
            new(ClaimTypes.Email, email),
            new(ClaimTypes.Name, "Test Admin"),
            new(ClaimTypes.Role, role),
            new("TenantId", tenantId.ToString()),
            new("tenant_id", tenantId.ToString())
        };

        var identity = new ClaimsIdentity(claims, "TestAuth");
        var principal = new ClaimsPrincipal(identity);

        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = principal }
        };
    }

    #region 1. IBMSBE-001: Tax Models, DTOs & Validation Tests

    [Theory]
    [InlineData("GST")]
    [InlineData("CGST")]
    [InlineData("SGST")]
    [InlineData("IGST")]
    [InlineData("VAT")]
    [InlineData("Custom")]
    public void CreateTaxRate_SupportedTaxTypes_PassValidation(string taxType)
    {
        var req = new CreateTaxRateRequest
        {
            Name = $"{taxType} 18%",
            Code = $"{taxType}_18",
            TaxType = taxType,
            Rate = 18.00m,
            Priority = 1
        };

        var errors = TaxValidator.ValidateCreateRate(req);
        Assert.Empty(errors);
    }

    [Fact]
    public void CreateTaxRate_NegativeRate_FailsValidation()
    {
        var req = new CreateTaxRateRequest
        {
            Name = "Invalid Negative Tax",
            Code = "NEG_1",
            TaxType = "GST",
            Rate = -5.00m
        };

        var errors = TaxValidator.ValidateCreateRate(req);
        Assert.Contains(errors, e => e.Contains("between 0.00% and 100.00%"));
    }

    [Fact]
    public void CreateTaxRate_RateGreaterThan100_FailsValidation()
    {
        var req = new CreateTaxRateRequest
        {
            Name = "Extreme Tax",
            Code = "EXT_105",
            TaxType = "VAT",
            Rate = 105.00m
        };

        var errors = TaxValidator.ValidateCreateRate(req);
        Assert.Contains(errors, e => e.Contains("between 0.00% and 100.00%"));
    }

    [Fact]
    public void CreateTaxRate_EmptyNameOrCode_FailsValidation()
    {
        var req = new CreateTaxRateRequest
        {
            Name = "",
            Code = "   ",
            TaxType = "GST",
            Rate = 10.00m
        };

        var errors = TaxValidator.ValidateCreateRate(req);
        Assert.Contains(errors, e => e.Contains("name is required"));
        Assert.Contains(errors, e => e.Contains("code is required"));
    }

    [Fact]
    public void CreateTaxRate_SpecialCharactersInName_FailsValidation()
    {
        // 1. Ticket reproduction sample: dyediuwy7373872839$#$^^%$7
        var req = new CreateTaxRateRequest
        {
            Name = "dyediuwy7373872839$#$^^%$7",
            Code = "TX-01",
            TaxType = "GST",
            Rate = 18.00m
        };

        var errors = TaxValidator.ValidateCreateRate(req);
        Assert.Contains(errors, e => e.Contains("can only contain letters, numbers, spaces, hyphens, and parentheses"));

        // 2. Pure symbols
        var symbolReq = new CreateTaxRateRequest
        {
            Name = "@#$%^&*()",
            Code = "TX-02",
            TaxType = "GST",
            Rate = 18.00m
        };
        var symbolErrors = TaxValidator.ValidateCreateRate(symbolReq);
        Assert.Contains(symbolErrors, e => e.Contains("can only contain letters, numbers, spaces, hyphens, and parentheses"));

        // 3. Valid tax rate name passes
        var validReq = new CreateTaxRateRequest
        {
            Name = "GST 18 (Standard)",
            Code = "TX-03",
            TaxType = "GST",
            Rate = 18.00m
        };
        var validErrors = TaxValidator.ValidateCreateRate(validReq);
        Assert.DoesNotContain(validErrors, e => e.Contains("name"));
    }

    [Fact]
    public void CreateTaxRate_SpecialCharactersInCode_FailsValidation()
    {
        // 1. Ticket reproduction sample: GST11.@$$
        var req = new CreateTaxRateRequest
        {
            Name = "SGST",
            Code = "GST11.@$$",
            TaxType = "SGST",
            Rate = 9.00m
        };

        var errors = TaxValidator.ValidateCreateRate(req);
        Assert.Contains(errors, e => e.Contains("can only contain letters, numbers, hyphens, and underscores"));

        // 2. Pure symbols
        var symbolReq = new CreateTaxRateRequest
        {
            Name = "SGST",
            Code = "@#$%^&*()",
            TaxType = "SGST",
            Rate = 9.00m
        };
        var symbolErrors = TaxValidator.ValidateCreateRate(symbolReq);
        Assert.Contains(symbolErrors, e => e.Contains("can only contain letters, numbers, hyphens, and underscores"));

        // 3. Valid tax rate code passes
        var validReq = new CreateTaxRateRequest
        {
            Name = "SGST",
            Code = "GST_11-A",
            TaxType = "SGST",
            Rate = 9.00m
        };
        var validErrors = TaxValidator.ValidateCreateRate(validReq);
        Assert.DoesNotContain(validErrors, e => e.Contains("code"));
    }

    [Fact]
    public void CreateTaxRate_InvalidTaxType_FailsValidation()
    {
        var req = new CreateTaxRateRequest
        {
            Name = "Unknown Tax",
            Code = "UNK_1",
            TaxType = "RandomNonExistentTax",
            Rate = 10.00m
        };

        var errors = TaxValidator.ValidateCreateRate(req);
        Assert.Contains(errors, e => e.Contains("Invalid TaxType"));
    }

    [Fact]
    public void CreateTaxRate_EffectiveToBeforeEffectiveFrom_FailsValidation()
    {
        var req = new CreateTaxRateRequest
        {
            Name = "Time Travel Tax",
            Code = "TT_1",
            TaxType = "GST",
            Rate = 10.00m,
            EffectiveFrom = new DateTime(2026, 12, 31),
            EffectiveTo = new DateTime(2026, 1, 1)
        };

        var errors = TaxValidator.ValidateCreateRate(req);
        Assert.Contains(errors, e => e.Contains("EffectiveTo date cannot be earlier"));
    }

    #endregion

    #region 2. IBMSBE-002: GET / PUT Tax Settings & Rates Endpoints

    [Fact]
    public async Task GetTaxSettings_ReturnsDefaultSettings_ForNewTenant()
    {
        var actionResult = await _controller.GetTaxSettings();
        var okResult = Assert.IsType<OkObjectResult>(actionResult);
        var res = Assert.IsType<ApiResponse<TaxSettingsDto>>(okResult.Value);

        Assert.True(res.Success);
        Assert.NotNull(res.Data);
        Assert.Equal(1, res.Data.TenantId);
        Assert.True(res.Data.IsTaxEnabled);
        Assert.Equal("Exclusive", res.Data.DefaultTaxCalculation);
        Assert.Equal("GSTIN", res.Data.TaxNumberLabel);
    }

    [Fact]
    public async Task UpdateTaxSettings_UpdatesSettingsAndRates_ReturnsSuccess()
    {
        var updateReq = new UpdateTaxSettingsRequest
        {
            DefaultTaxCalculation = "Inclusive",
            PricesIncludeTax = true,
            TaxRegistrationNumber = "36AAAAA0000A1Z5",
            TaxNumberLabel = "GSTIN",
            State = "Telangana",
            TaxRates = new List<CreateTaxRateRequest>
            {
                new()
                {
                    Name = "GST 18%",
                    Code = "GST_18",
                    TaxType = "GST",
                    Rate = 18.00m,
                    ApplicationLevel = "Both"
                },
                new()
                {
                    Name = "VAT 5%",
                    Code = "VAT_5",
                    TaxType = "VAT",
                    Rate = 5.00m,
                    ApplicationLevel = "Item"
                }
            }
        };

        var actionResult = await _controller.UpdateTaxSettings(updateReq);
        var okResult = Assert.IsType<OkObjectResult>(actionResult);
        var res = Assert.IsType<ApiResponse<TaxSettingsDto>>(okResult.Value);

        Assert.True(res.Success);
        Assert.Equal("Inclusive", res.Data!.DefaultTaxCalculation);
        Assert.True(res.Data.PricesIncludeTax);
        Assert.Equal("36AAAAA0000A1Z5", res.Data.TaxRegistrationNumber);
        Assert.Equal(2, res.Data.TaxRates.Count);
    }

    [Fact]
    public async Task TaxSettings_TenantIsolation_Tenant1CannotAccessOrModifyTenant2Settings()
    {
        // Seed tenant 2 tax rate
        await _repository.CreateRateAsync(new TaxRate
        {
            TenantId = 2,
            Name = "Tenant 2 Tax",
            Code = "T2_TAX",
            TaxType = "Custom",
            Rate = 12.00m,
            Status = "Active"
        });

        // Query as Tenant 1
        var actionResult = await _controller.GetTaxSettings();
        var okResult = Assert.IsType<OkObjectResult>(actionResult);
        var res = Assert.IsType<ApiResponse<TaxSettingsDto>>(okResult.Value);

        Assert.DoesNotContain(res.Data!.TaxRates, r => r.Code == "T2_TAX");
    }

    [Fact]
    public async Task CreateTaxRate_DuplicateCode_ReturnsBadRequest()
    {
        var req = new CreateTaxRateRequest
        {
            Name = "First Rate",
            Code = "DUP_RATE",
            TaxType = "GST",
            Rate = 5.00m
        };

        var actionResult1 = await _controller.CreateRate(req);
        Assert.IsType<CreatedAtActionResult>(actionResult1);

        var actionResult2 = await _controller.CreateRate(req);
        var badResult = Assert.IsType<BadRequestObjectResult>(actionResult2);
        var res = Assert.IsType<ApiResponse<TaxRateDto>>(badResult.Value);
        Assert.False(res.Success);
        Assert.Contains("already exists", res.Message);
    }

    [Fact]
    public async Task DeleteTaxRate_ExistingRate_RemovesSuccessfully()
    {
        var rate = await _repository.CreateRateAsync(new TaxRate
        {
            TenantId = 1,
            Name = "To Delete",
            Code = "DEL_1",
            TaxType = "Custom",
            Rate = 2.00m,
            Status = "Active"
        });

        var actionResult = await _controller.DeleteRate(rate.Id);
        var okResult = Assert.IsType<OkObjectResult>(actionResult);
        var res = Assert.IsType<ApiResponse<bool>>(okResult.Value);
        Assert.True(res.Success);

        var getResult = await _repository.GetRateByIdAsync(rate.Id, 1);
        Assert.Null(getResult);
    }

    #endregion

    #region 3. IBMSBE-003: Tax Calculation Engine Tests (Inclusive, Exclusive, Compound, Multiple)

    [Fact]
    public void Calculate_ExclusiveTax_SingleItem_ComputesCorrectly()
    {
        var rates = new List<TaxRate>
        {
            new() { Id = 1, TenantId = 1, Name = "VAT 10%", Code = "VAT_10", TaxType = "VAT", Rate = 10.00m, IsCompound = false, Priority = 1, Status = "Active" }
        };

        var request = new TaxCalculationRequest
        {
            PricesIncludeTax = false,
            Items = new List<TaxCalculationItemRequest>
            {
                new()
                {
                    ItemId = 101,
                    Name = "Keyboard",
                    Quantity = 2,
                    UnitPrice = 500.00m,
                    TaxRateIds = new List<int> { 1 }
                }
            }
        };

        var result = _calculationService.Calculate(request, rates, null);

        Assert.Single(result.LineItems);
        var item = result.LineItems[0];
        Assert.Equal(1000.00m, item.BaseAmount);
        Assert.Equal(1000.00m, item.TaxableAmount);
        Assert.Equal(100.00m, item.TotalTaxAmount); // 10% of 1000
        Assert.Equal(1100.00m, item.GrossAmount);

        Assert.Equal(1000.00m, result.Summary.TotalTaxableAmount);
        Assert.Equal(100.00m, result.Summary.TotalTaxAmount);
        Assert.Equal(1100.00m, result.Summary.GrandTotal);
    }

    [Fact]
    public void Calculate_ExclusiveTax_MultipleAdditiveTaxes_ComputesCorrectly()
    {
        var rates = new List<TaxRate>
        {
            new() { Id = 1, TenantId = 1, Name = "CGST 9%", Code = "CGST_9", TaxType = "CGST", Rate = 9.00m, IsCompound = false, Priority = 1, Status = "Active" },
            new() { Id = 2, TenantId = 1, Name = "SGST 9%", Code = "SGST_9", TaxType = "SGST", Rate = 9.00m, IsCompound = false, Priority = 1, Status = "Active" }
        };

        var request = new TaxCalculationRequest
        {
            PricesIncludeTax = false,
            Items = new List<TaxCalculationItemRequest>
            {
                new()
                {
                    ItemId = 201,
                    Name = "Monitor",
                    Quantity = 1,
                    UnitPrice = 10000.00m,
                    TaxRateIds = new List<int> { 1, 2 }
                }
            }
        };

        var result = _calculationService.Calculate(request, rates, null);

        var item = result.LineItems[0];
        Assert.Equal(10000.00m, item.TaxableAmount);
        Assert.Equal(1800.00m, item.TotalTaxAmount); // 900 + 900
        Assert.Equal(11800.00m, item.GrossAmount);

        Assert.Equal(2, item.AppliedTaxes.Count);
        Assert.Contains(item.AppliedTaxes, t => t.Code == "CGST_9" && t.TaxAmount == 900.00m);
        Assert.Contains(item.AppliedTaxes, t => t.Code == "SGST_9" && t.TaxAmount == 900.00m);
    }

    [Fact]
    public void Calculate_InclusiveTax_SingleItem_ReversesTaxCorrectly()
    {
        var rates = new List<TaxRate>
        {
            new() { Id = 1, TenantId = 1, Name = "VAT 20%", Code = "VAT_20", TaxType = "VAT", Rate = 20.00m, IsInclusive = true, Status = "Active" }
        };

        var request = new TaxCalculationRequest
        {
            PricesIncludeTax = true,
            Items = new List<TaxCalculationItemRequest>
            {
                new()
                {
                    ItemId = 301,
                    Name = "Book",
                    Quantity = 1,
                    UnitPrice = 120.00m,
                    IsInclusive = true,
                    TaxRateIds = new List<int> { 1 }
                }
            }
        };

        var result = _calculationService.Calculate(request, rates, null);

        var item = result.LineItems[0];
        Assert.Equal(120.00m, item.BaseAmount);
        Assert.Equal(100.00m, item.TaxableAmount); // 120 / 1.20 = 100
        Assert.Equal(20.00m, item.TotalTaxAmount); // 120 - 100 = 20
        Assert.Equal(120.00m, item.GrossAmount);
        Assert.Equal(120.00m, result.Summary.GrandTotal);
    }

    [Fact]
    public void Calculate_InclusiveTax_MultipleAdditiveTaxes_ReversesTaxCorrectly()
    {
        var rates = new List<TaxRate>
        {
            new() { Id = 1, TenantId = 1, Name = "CGST 9%", Code = "CGST_9", TaxType = "CGST", Rate = 9.00m, Status = "Active" },
            new() { Id = 2, TenantId = 1, Name = "SGST 9%", Code = "SGST_9", TaxType = "SGST", Rate = 9.00m, Status = "Active" }
        };

        var request = new TaxCalculationRequest
        {
            PricesIncludeTax = true,
            Items = new List<TaxCalculationItemRequest>
            {
                new()
                {
                    ItemId = 401,
                    Name = "Electronics",
                    Quantity = 1,
                    UnitPrice = 1180.00m,
                    IsInclusive = true,
                    TaxRateIds = new List<int> { 1, 2 }
                }
            }
        };

        var result = _calculationService.Calculate(request, rates, null);

        var item = result.LineItems[0];
        Assert.Equal(1180.00m, item.BaseAmount);
        Assert.Equal(1000.00m, item.TaxableAmount); // 1180 / 1.18 = 1000
        Assert.Equal(180.00m, item.TotalTaxAmount);
        Assert.Equal(90.00m, item.AppliedTaxes.First(t => t.Code == "CGST_9").TaxAmount);
        Assert.Equal(90.00m, item.AppliedTaxes.First(t => t.Code == "SGST_9").TaxAmount);
        Assert.Equal(1180.00m, result.Summary.GrandTotal);
    }

    [Fact]
    public void Calculate_CompoundTax_CalculatesOnTaxablePlusPriorTaxes()
    {
        // Rate 1: Base VAT 10% (Priority 1)
        // Rate 2: Compound Surcharge 5% (Priority 2, IsCompound = true)
        // On 1000:
        // Tax 1 = 10% of 1000 = 100
        // Tax 2 = 5% of (1000 + 100) = 5% of 1100 = 55
        // Total Tax = 155, Gross = 1155
        var rates = new List<TaxRate>
        {
            new() { Id = 1, TenantId = 1, Name = "Base VAT 10%", Code = "VAT_10", TaxType = "VAT", Rate = 10.00m, IsCompound = false, Priority = 1, Status = "Active" },
            new() { Id = 2, TenantId = 1, Name = "Surcharge 5%", Code = "SUR_5", TaxType = "Custom", Rate = 5.00m, IsCompound = true, Priority = 2, Status = "Active" }
        };

        var request = new TaxCalculationRequest
        {
            PricesIncludeTax = false,
            Items = new List<TaxCalculationItemRequest>
            {
                new()
                {
                    ItemId = 501,
                    Name = "Luxury Item",
                    Quantity = 1,
                    UnitPrice = 1000.00m,
                    TaxRateIds = new List<int> { 1, 2 }
                }
            }
        };

        var result = _calculationService.Calculate(request, rates, null);

        var item = result.LineItems[0];
        Assert.Equal(1000.00m, item.TaxableAmount);
        Assert.Equal(155.00m, item.TotalTaxAmount);
        Assert.Equal(1155.00m, item.GrossAmount);

        var vat = item.AppliedTaxes.First(t => t.Code == "VAT_10");
        var surcharge = item.AppliedTaxes.First(t => t.Code == "SUR_5");
        Assert.Equal(100.00m, vat.TaxAmount);
        Assert.Equal(55.00m, surcharge.TaxAmount);
    }

    [Fact]
    public void Calculate_ItemLevel_And_InvoiceLevelTaxes_AggregatesCorrectly()
    {
        var rates = new List<TaxRate>
        {
            new() { Id = 1, TenantId = 1, Name = "Item Tax 10%", Code = "ITM_10", TaxType = "VAT", Rate = 10.00m, ApplicationLevel = "Item", Status = "Active" },
            new() { Id = 2, TenantId = 1, Name = "Invoice Stamp Duty 2%", Code = "INV_2", TaxType = "Custom", Rate = 2.00m, ApplicationLevel = "Invoice", Status = "Active" }
        };

        var request = new TaxCalculationRequest
        {
            PricesIncludeTax = false,
            Items = new List<TaxCalculationItemRequest>
            {
                new() { ItemId = 601, Quantity = 2, UnitPrice = 1000.00m, TaxRateIds = new List<int> { 1 } },
                new() { ItemId = 602, Quantity = 1, UnitPrice = 3000.00m, TaxRateIds = new List<int> { 1 } }
            },
            InvoiceLevelTaxRateIds = new List<int> { 2 }
        };

        var result = _calculationService.Calculate(request, rates, null);

        // Subtotal = 2000 + 3000 = 5000
        // Item Tax = 10% of 5000 = 500
        // Invoice Tax = 2% of 5000 = 100
        // Grand Total = 5000 + 500 + 100 = 5600
        Assert.Equal(5000.00m, result.Summary.TotalTaxableAmount);
        Assert.Equal(500.00m, result.Summary.TotalItemTaxAmount);
        Assert.Equal(100.00m, result.Summary.TotalInvoiceTaxAmount);
        Assert.Equal(600.00m, result.Summary.TotalTaxAmount);
        Assert.Equal(5600.00m, result.Summary.GrandTotal);
    }

    [Fact]
    public void Calculate_WithItemDiscount_CalculatesTaxOnDiscountedAmount()
    {
        var rates = new List<TaxRate>
        {
            new() { Id = 1, TenantId = 1, Name = "VAT 10%", Code = "VAT_10", TaxType = "VAT", Rate = 10.00m, Status = "Active" }
        };

        var request = new TaxCalculationRequest
        {
            PricesIncludeTax = false,
            Items = new List<TaxCalculationItemRequest>
            {
                new()
                {
                    ItemId = 701,
                    Quantity = 1,
                    UnitPrice = 1000.00m,
                    DiscountPercent = 20.00m, // 200 discount -> 800 taxable
                    TaxRateIds = new List<int> { 1 }
                }
            }
        };

        var result = _calculationService.Calculate(request, rates, null);

        var item = result.LineItems[0];
        Assert.Equal(1000.00m, item.BaseAmount);
        Assert.Equal(200.00m, item.DiscountAmount);
        Assert.Equal(800.00m, item.TaxableAmount);
        Assert.Equal(80.00m, item.TotalTaxAmount); // 10% of 800
        Assert.Equal(880.00m, item.GrossAmount);
    }

    #endregion

    #region 4. IBMSBE-004: Priority Ordering, Effective Dates & Active Tax Selection Tests

    [Fact]
    public void Calculate_PriorityOrdering_ExecutesInAscendingPriorityOrder()
    {
        var rates = new List<TaxRate>
        {
            new() { Id = 2, TenantId = 1, Name = "Priority 2 Surcharge", Code = "P2", TaxType = "Custom", Rate = 10.00m, IsCompound = true, Priority = 2, Status = "Active" },
            new() { Id = 1, TenantId = 1, Name = "Priority 1 Base", Code = "P1", TaxType = "VAT", Rate = 10.00m, IsCompound = false, Priority = 1, Status = "Active" }
        };

        var request = new TaxCalculationRequest
        {
            Items = new List<TaxCalculationItemRequest>
            {
                new() { Quantity = 1, UnitPrice = 100.00m, TaxRateIds = new List<int> { 2, 1 } }
            }
        };

        var result = _calculationService.Calculate(request, rates, null);

        var taxes = result.LineItems[0].AppliedTaxes;
        Assert.Equal("P1", taxes[0].Code);
        Assert.Equal("P2", taxes[1].Code);
        Assert.Equal(10.00m, taxes[0].TaxAmount); // 10% of 100
        Assert.Equal(11.00m, taxes[1].TaxAmount); // 10% of 110
    }

    [Fact]
    public void Calculate_EffectiveDates_ActiveInsideRange_IgnoredOutsideRange()
    {
        var activeRate = new TaxRate
        {
            Id = 1,
            TenantId = 1,
            Name = "Active Rate",
            Code = "ACT_10",
            TaxType = "VAT",
            Rate = 10.00m,
            EffectiveFrom = new DateTime(2026, 1, 1),
            EffectiveTo = new DateTime(2026, 12, 31),
            Status = "Active"
        };

        var expiredRate = new TaxRate
        {
            Id = 2,
            TenantId = 1,
            Name = "Expired Rate",
            Code = "EXP_15",
            TaxType = "VAT",
            Rate = 15.00m,
            EffectiveFrom = new DateTime(2025, 1, 1),
            EffectiveTo = new DateTime(2025, 12, 31),
            Status = "Active"
        };

        var request = new TaxCalculationRequest
        {
            TransactionDate = new DateTime(2026, 6, 1),
            Items = new List<TaxCalculationItemRequest>
            {
                new() { Quantity = 1, UnitPrice = 100.00m, TaxRateIds = new List<int> { 1, 2 } }
            }
        };

        var result = _calculationService.Calculate(request, new List<TaxRate> { activeRate, expiredRate }, null);

        var item = result.LineItems[0];
        Assert.Single(item.AppliedTaxes);
        Assert.Equal("ACT_10", item.AppliedTaxes[0].Code);
    }

    [Fact]
    public void Calculate_IntraState_CustomerStateEqualsTenantState_SplitsGSTIntoCGSTAndSGST()
    {
        var gstRate = new TaxRate
        {
            Id = 1,
            TenantId = 1,
            Name = "GST 18%",
            Code = "GST_18",
            TaxType = "GST",
            Rate = 18.00m,
            Status = "Active"
        };

        var request = new TaxCalculationRequest
        {
            CustomerState = "Telangana",
            TenantState = "Telangana",
            Items = new List<TaxCalculationItemRequest>
            {
                new() { Quantity = 1, UnitPrice = 1000.00m, TaxRateIds = new List<int> { 1 } }
            }
        };

        var result = _calculationService.Calculate(request, new List<TaxRate> { gstRate }, null);

        var item = result.LineItems[0];
        Assert.Equal(2, item.AppliedTaxes.Count);
        Assert.Contains(item.AppliedTaxes, t => t.TaxType == "CGST" && t.Rate == 9.00m && t.TaxAmount == 90.00m);
        Assert.Contains(item.AppliedTaxes, t => t.TaxType == "SGST" && t.Rate == 9.00m && t.TaxAmount == 90.00m);
    }

    [Fact]
    public void Calculate_InterState_CustomerStateDiffersFromTenantState_AppliesIGST()
    {
        var gstRate = new TaxRate
        {
            Id = 1,
            TenantId = 1,
            Name = "GST 18%",
            Code = "GST_18",
            TaxType = "GST",
            Rate = 18.00m,
            Status = "Active"
        };

        var request = new TaxCalculationRequest
        {
            CustomerState = "Karnataka",
            TenantState = "Telangana",
            Items = new List<TaxCalculationItemRequest>
            {
                new() { Quantity = 1, UnitPrice = 1000.00m, TaxRateIds = new List<int> { 1 } }
            }
        };

        var result = _calculationService.Calculate(request, new List<TaxRate> { gstRate }, null);

        var item = result.LineItems[0];
        Assert.Single(item.AppliedTaxes);
        Assert.Equal("IGST", item.AppliedTaxes[0].TaxType);
        Assert.Equal(18.00m, item.AppliedTaxes[0].Rate);
        Assert.Equal(180.00m, item.AppliedTaxes[0].TaxAmount);
    }

    #endregion

    #region 5. IBMSBE-005: Tax Configuration Conflict Validation Tests

    [Fact]
    public void ValidateConflicts_OverlappingDatesSameCode_ReturnsConflictError()
    {
        var rates = new List<TaxRate>
        {
            new()
            {
                Name = "Rate 2026 H1",
                Code = "VAT_STD",
                TaxType = "VAT",
                Rate = 10.00m,
                EffectiveFrom = new DateTime(2026, 1, 1),
                EffectiveTo = new DateTime(2026, 6, 30),
                Status = "Active"
            },
            new()
            {
                Name = "Rate 2026 Q2",
                Code = "VAT_STD",
                TaxType = "VAT",
                Rate = 12.00m,
                EffectiveFrom = new DateTime(2026, 4, 1),
                EffectiveTo = new DateTime(2026, 12, 31),
                Status = "Active"
            }
        };

        var errors = TaxValidator.ValidateConflicts(rates);
        Assert.Contains(errors, e => e.Contains("Conflicting overlapping effective dates"));
    }

    [Fact]
    public void ValidateConflicts_NonOverlappingDatesSameCode_PassesValidation()
    {
        var rates = new List<TaxRate>
        {
            new()
            {
                Name = "Rate 2025",
                Code = "VAT_HIST",
                TaxType = "VAT",
                Rate = 10.00m,
                EffectiveFrom = new DateTime(2025, 1, 1),
                EffectiveTo = new DateTime(2025, 12, 31),
                Status = "Active"
            },
            new()
            {
                Name = "Rate 2026",
                Code = "VAT_HIST",
                TaxType = "VAT",
                Rate = 12.00m,
                EffectiveFrom = new DateTime(2026, 1, 1),
                EffectiveTo = new DateTime(2026, 12, 31),
                Status = "Active"
            }
        };

        var errors = TaxValidator.ValidateConflicts(rates);
        Assert.Empty(errors);
    }

    [Fact]
    public void ValidateAppliedTaxConflicts_IGSTWithCGSTOrSGST_ReturnsConflictError()
    {
        var taxes = new List<TaxRate>
        {
            new() { Name = "IGST 18%", TaxType = "IGST", Rate = 18.00m, Status = "Active" },
            new() { Name = "CGST 9%", TaxType = "CGST", Rate = 9.00m, Status = "Active" }
        };

        var errors = TaxValidator.ValidateAppliedTaxConflicts(taxes);
        Assert.Contains(errors, e => e.Contains("IGST (Integrated Tax) cannot be applied simultaneously with CGST/SGST"));
    }

    [Fact]
    public async Task CalculateTaxesAsync_WhenConfigurationHasConflicts_ReturnsFail()
    {
        // Seed overlapping rates into repository
        await _repository.CreateRateAsync(new TaxRate
        {
            TenantId = 1,
            Name = "Rate 1",
            Code = "CONF_1",
            TaxType = "VAT",
            Rate = 10.00m,
            EffectiveFrom = new DateTime(2026, 1, 1),
            EffectiveTo = new DateTime(2026, 12, 31),
            Status = "Active"
        });

        await _repository.CreateRateAsync(new TaxRate
        {
            TenantId = 1,
            Name = "Rate 2",
            Code = "CONF_1",
            TaxType = "VAT",
            Rate = 12.00m,
            EffectiveFrom = new DateTime(2026, 6, 1),
            EffectiveTo = new DateTime(2026, 12, 31),
            Status = "Active"
        });

        var request = new TaxCalculationRequest
        {
            Items = new List<TaxCalculationItemRequest>
            {
                new() { Quantity = 1, UnitPrice = 100.00m, TaxCodes = new List<string> { "CONF_1" } }
            }
        };

        var res = await _calculationService.CalculateTaxesAsync(request, 1);
        Assert.False(res.Success);
        Assert.Contains("conflicts", res.Message, StringComparison.OrdinalIgnoreCase);
    }

    #endregion
}
