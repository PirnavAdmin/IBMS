using Billing.Application.Services;
using Billing.Contracts.Charges;
using Billing.Domain.Entities;
using Billing.Domain.Enums;
using Billing.Tests.Unit.Fakes;
using Xunit;

namespace Billing.Tests.Unit;

public class ChargesEngineTests
{
    private readonly FakeChargeRepository _repository;
    private readonly ChargeSettingService _settingService;
    private readonly ChargeCalculationService _calculationService;

    public ChargesEngineTests()
    {
        _repository = new FakeChargeRepository();
        _settingService = new ChargeSettingService(_repository);
        _calculationService = new ChargeCalculationService(_repository);
    }

    [Fact]
    public async Task CreateCharge_ValidRequest_CreatesSuccessfully()
    {
        var request = new CreateChargeRequest
        {
            Name = "Express Shipping",
            Code = "SHIP-EXP",
            ChargeType = "Shipping",
            CalculationType = "Fixed",
            Amount = 150.00m,
            IsTaxable = true,
            Status = "Active"
        };

        var result = await _settingService.CreateChargeAsync(request, tenantId: 1);

        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.Equal("SHIP-EXP", result.Data.Code);
        Assert.Equal(150.00m, result.Data.Amount);
        Assert.True(result.Data.IsTaxable);
    }

    [Fact]
    public async Task CreateCharge_DuplicateCode_ReturnsConflict()
    {
        var request = new CreateChargeRequest
        {
            Name = "Express Shipping",
            Code = "SHIP-DUP",
            Amount = 100m
        };

        await _settingService.CreateChargeAsync(request, tenantId: 1);
        var second = await _settingService.CreateChargeAsync(request, tenantId: 1);

        Assert.False(second.Success);
        Assert.Contains("already exists", second.Message);
    }

    [Fact]
    public async Task CalculateCharges_FixedAndPercentage_ComputesAccurately()
    {
        // 1. Fixed shipping charge
        await _repository.AddAsync(new ChargeConfiguration
        {
            TenantId = 1,
            Name = "Standard Shipping",
            Code = "SHIP-STD",
            ChargeType = ChargeType.Shipping,
            CalculationType = ChargeCalculationType.Fixed,
            Amount = 50.00m,
            IsTaxable = true,
            Status = "Active"
        });

        // 2. 2% convenience fee with max cap of 40
        await _repository.AddAsync(new ChargeConfiguration
        {
            TenantId = 1,
            Name = "Convenience Fee",
            Code = "CONV-2PCT",
            ChargeType = ChargeType.ConvenienceFee,
            CalculationType = ChargeCalculationType.Percentage,
            Amount = 2.00m,
            MaxChargeAmount = 40.00m,
            IsTaxable = true,
            Status = "Active"
        });

        // 3. Late fee non-taxable
        await _repository.AddAsync(new ChargeConfiguration
        {
            TenantId = 1,
            Name = "Late Fee",
            Code = "LATE-FEE",
            ChargeType = ChargeType.LateFee,
            CalculationType = ChargeCalculationType.Fixed,
            Amount = 20.00m,
            IsTaxable = false,
            Status = "Active"
        });

        var request = new CalculateChargesRequest
        {
            Subtotal = 1000.00m
        };

        var result = await _calculationService.CalculateChargesAsync(request, tenantId: 1);

        Assert.True(result.Success);
        Assert.NotNull(result.Data);

        // Shipping = 50, Convenience = 2% of 1000 = 20 (below cap 40), LateFee = 20
        // Total = 50 + 20 + 20 = 90
        Assert.Equal(90.00m, result.Data.TotalCharges);
        Assert.Equal(70.00m, result.Data.TotalTaxableCharges); // 50 + 20
        Assert.Equal(20.00m, result.Data.TotalNonTaxableCharges); // 20
        Assert.Equal(3, result.Data.AppliedCharges.Count);
    }

    [Fact]
    public async Task CalculateCharges_RespectsMinInvoiceAmountThreshold()
    {
        await _repository.AddAsync(new ChargeConfiguration
        {
            TenantId = 1,
            Name = "High Order Processing",
            Code = "HIGH-ORDER",
            ChargeType = ChargeType.Handling,
            CalculationType = ChargeCalculationType.Fixed,
            Amount = 200.00m,
            MinInvoiceAmount = 5000.00m, // Only applies if order >= 5000
            Status = "Active"
        });

        var belowThreshold = await _calculationService.CalculateChargesAsync(new CalculateChargesRequest { Subtotal = 3000.00m }, tenantId: 1);
        Assert.Equal(0.00m, belowThreshold.Data!.TotalCharges);

        var aboveThreshold = await _calculationService.CalculateChargesAsync(new CalculateChargesRequest { Subtotal = 6000.00m }, tenantId: 1);
        Assert.Equal(200.00m, aboveThreshold.Data!.TotalCharges);
    }

    [Fact]
    public async Task CalculateCharges_PercentageCappedByMaxChargeAmount()
    {
        await _repository.AddAsync(new ChargeConfiguration
        {
            TenantId = 1,
            Name = "Capped Handling",
            Code = "CAP-HANDLING",
            ChargeType = ChargeType.Handling,
            CalculationType = ChargeCalculationType.Percentage,
            Amount = 10.00m, // 10%
            MaxChargeAmount = 50.00m, // Capped at 50
            Status = "Active"
        });

        // 10% of 1000 = 100, but cap is 50
        var result = await _calculationService.CalculateChargesAsync(new CalculateChargesRequest { Subtotal = 1000.00m }, tenantId: 1);
        Assert.Equal(50.00m, result.Data!.TotalCharges);
    }

    [Fact]
    public async Task CreateCharge_InvalidStatus_ReturnsValidationError()
    {
        var request = new CreateChargeRequest
        {
            Name = "Bad Status Charge",
            Code = "BAD-STAT",
            Amount = 50.00m,
            Status = "string" // Invalid status reported by frontend
        };

        var result = await _settingService.CreateChargeAsync(request, tenantId: 1);
        Assert.False(result.Success);
        Assert.Contains("Status must be either 'Active' or 'Inactive'", result.Message);
    }

    [Fact]
    public async Task UpdateCharge_MatchingRowVersion_UpdatesSuccessfully()
    {
        var createRequest = new CreateChargeRequest
        {
            Name = "Initial Charge",
            Code = "UPD-TEST",
            Amount = 100.00m,
            Status = "Active"
        };
        var created = await _settingService.CreateChargeAsync(createRequest, tenantId: 1);
        Assert.True(created.Success);

        var updateRequest = new UpdateChargeRequest
        {
            Name = "Updated Charge Name",
            Amount = 125.00m,
            Status = "Inactive",
            RowVersion = created.Data!.RowVersion
        };

        var updated = await _settingService.UpdateChargeAsync(created.Data.Id, updateRequest, tenantId: 1);
        Assert.True(updated.Success);
        Assert.Equal("Updated Charge Name", updated.Data!.Name);
        Assert.Equal(125.00m, updated.Data.Amount);
        Assert.Equal("Inactive", updated.Data.Status);
    }

    [Fact]
    public async Task UpdateCharge_MismatchedRowVersion_ReturnsConflict()
    {
        var createRequest = new CreateChargeRequest
        {
            Name = "Concurrency Charge",
            Code = "CONCUR-TEST",
            Amount = 100.00m,
            Status = "Active"
        };
        var created = await _settingService.CreateChargeAsync(createRequest, tenantId: 1);
        Assert.True(created.Success);

        var staleRowVersion = Convert.ToBase64String(BitConverter.GetBytes(DateTime.UtcNow.AddMinutes(-5).Ticks));
        var updateRequest = new UpdateChargeRequest
        {
            Name = "Stale Update",
            Amount = 150.00m,
            Status = "Active",
            RowVersion = staleRowVersion
        };

        var updated = await _settingService.UpdateChargeAsync(created.Data!.Id, updateRequest, tenantId: 1);
        Assert.False(updated.Success);
        Assert.Equal("CONCURRENCY_CONFLICT", updated.ErrorCode);
        Assert.Contains("concurrency conflict", updated.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task UpdateCharge_InvalidStatus_ReturnsValidationError()
    {
        var createRequest = new CreateChargeRequest
        {
            Name = "Status Test Charge",
            Code = "STAT-TEST",
            Amount = 100.00m,
            Status = "Active"
        };
        var created = await _settingService.CreateChargeAsync(createRequest, tenantId: 1);

        var updateRequest = new UpdateChargeRequest
        {
            Status = "InvalidStatus"
        };

        var updated = await _settingService.UpdateChargeAsync(created.Data!.Id, updateRequest, tenantId: 1);
        Assert.False(updated.Success);
        Assert.Contains("Status must be either 'Active' or 'Inactive'", updated.Message);
    }
}
