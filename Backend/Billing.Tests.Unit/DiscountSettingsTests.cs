using Billing.Application.Services;
using Billing.Contracts.Discount;
using Billing.Domain.Entities;
using Billing.Tests.Unit.Fakes;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Billing.Tests.Unit;

public class DiscountSettingsTests
{
    private readonly FakeDiscountSettingRepository _settingRepository;
    private readonly FakeAuditLogRepository _auditLogRepository;
    private readonly DiscountSettingService _service;

    public DiscountSettingsTests()
    {
        _settingRepository = new FakeDiscountSettingRepository();
        _auditLogRepository = new FakeAuditLogRepository();
        _service = new DiscountSettingService(
            _settingRepository,
            NullLogger<DiscountSettingService>.Instance,
            _auditLogRepository);
    }

    [Fact]
    public async Task GetDiscountConfiguration_ReturnsDefaultConfig_WhenNotConfigured()
    {
        var result = await _service.GetDiscountConfigurationAsync(tenantId: 1);

        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.Equal("Active", result.Data.Status);
        Assert.Equal("Percentage", result.Data.MaximumType);
        Assert.Equal(50.0m, result.Data.MaximumValue);
        Assert.Equal("Invoice Level", result.Data.ApplicationLevel);
        Assert.True(result.Data.AllowManualOverride);
        Assert.True(result.Data.RequireOverrideReason);
        Assert.Equal(10, result.Data.MinimumReasonLength);
        Assert.NotEmpty(result.Data.Roles);
        Assert.Contains(result.Data.Roles, r => r.Role == "Admin" && r.Maximum == 50.0m);
        Assert.Contains(result.Data.Roles, r => r.Role == "Manager" && r.Maximum == 30.0m);
        Assert.Contains(result.Data.Roles, r => r.Role == "Billing User" && r.Maximum == 10.0m);
        Assert.NotEmpty(result.Data.RowVersion);
    }

    [Fact]
    public async Task UpdateDiscountConfiguration_UpdatesOrgLevelSettingsAndAudits()
    {
        // First get default
        var initial = await _service.GetDiscountConfigurationAsync(tenantId: 1);

        var updateReq = new UpdateDiscountConfigurationRequest
        {
            Status = "Active",
            MaximumType = "Percentage",
            MaximumValue = 60.0m,
            DiscountType = "Percentage",
            ApplicationLevel = "Both",
            AllowLineLevel = true,
            AllowInvoiceLevel = true,
            EnforceMaximum = true,
            AllowManualOverride = true,
            RequireOverrideReason = true,
            MinimumReasonLength = 15,
            RowVersion = initial.Data!.RowVersion
        };

        var result = await _service.UpdateDiscountConfigurationAsync(updateReq, tenantId: 1, userName: "AdminUser");

        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.Equal(60.0m, result.Data.MaximumValue);
        Assert.Equal("Both", result.Data.ApplicationLevel);
        Assert.Equal(15, result.Data.MinimumReasonLength);

        // Verify audit log
        var logs = await _auditLogRepository.GetByEntityAsync(1, "DiscountSetting", result.Data.Id.ToString());
        Assert.NotEmpty(logs);
        Assert.Contains("AdminUser", logs[0].UserName);
    }

    [Fact]
    public async Task UpdateDiscountConfiguration_MismatchedRowVersion_ReturnsConflict()
    {
        await _service.GetDiscountConfigurationAsync(tenantId: 1);

        var staleRowVersion = Convert.ToBase64String(BitConverter.GetBytes(DateTime.UtcNow.AddHours(-1).Ticks));
        var updateReq = new UpdateDiscountConfigurationRequest
        {
            MaximumValue = 40.0m,
            RowVersion = staleRowVersion
        };

        var result = await _service.UpdateDiscountConfigurationAsync(updateReq, tenantId: 1, userName: "AdminUser");

        Assert.False(result.Success);
        Assert.Equal("CONCURRENCY_CONFLICT", result.ErrorCode);
        Assert.Contains("concurrency conflict", result.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task GetRolePermissions_ReturnsRoleList()
    {
        var result = await _service.GetRolePermissionsAsync(tenantId: 1);

        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.True(result.Data.Count >= 4);
        var managerRole = result.Data.FirstOrDefault(r => r.Role == "Manager");
        Assert.NotNull(managerRole);
        Assert.Equal(30.0m, managerRole.Maximum);
        Assert.True(managerRole.CanApply);
        Assert.True(managerRole.CanOverride);
    }

    [Fact]
    public async Task UpdateRolePermissions_UpdatesRolesSuccessfully()
    {
        var initialRoles = await _service.GetRolePermissionsAsync(tenantId: 1);
        var rolesToUpdate = initialRoles.Data!;

        // Modify manager's max discount to 35%
        var manager = rolesToUpdate.First(r => r.Role == "Manager");
        manager.Maximum = 35.0m;

        var request = new UpdateDiscountRolePermissionsRequest
        {
            Roles = rolesToUpdate
        };

        var result = await _service.UpdateRolePermissionsAsync(request, tenantId: 1, userName: "AdminUser");

        Assert.True(result.Success);
        var updatedManager = result.Data!.First(r => r.Role == "Manager");
        Assert.Equal(35.0m, updatedManager.Maximum);
    }

    [Fact]
    public async Task ValidateMaxDiscount_WithinRoleLimits_ReturnsValid()
    {
        var request = new ValidateDiscountRequest
        {
            Role = "Manager",
            Value = 20.0m, // Within Manager 30% limit
            IsManualOverride = false
        };

        var result = await _service.ValidateMaxDiscountAsync(request, tenantId: 1);

        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.True(result.Data.IsValid);
        Assert.False(result.Data.ExceedsMaximum);
        Assert.False(result.Data.RequiresOverride);
    }

    [Fact]
    public async Task ValidateMaxDiscount_ExceedsRoleLimit_WithoutOverride_ReturnsExceedsMaximum()
    {
        var request = new ValidateDiscountRequest
        {
            Role = "Manager",
            Value = 35.0m, // Exceeds Manager 30% limit
            IsManualOverride = false
        };

        var result = await _service.ValidateMaxDiscountAsync(request, tenantId: 1);

        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.False(result.Data.IsValid);
        Assert.True(result.Data.ExceedsMaximum);
        Assert.True(result.Data.RequiresOverride);
        Assert.Contains("exceeds the maximum of 30", result.Data.Message);
    }

    [Fact]
    public async Task ValidateMaxDiscount_ExceedsRoleLimit_WithValidOverride_ReturnsValid()
    {
        var request = new ValidateDiscountRequest
        {
            Role = "Manager",
            Value = 40.0m,
            IsManualOverride = true,
            OverrideReason = "Special promotional campaign approved by director"
        };

        var result = await _service.ValidateMaxDiscountAsync(request, tenantId: 1);

        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.True(result.Data.IsValid);
        Assert.True(result.Data.ExceedsMaximum);
        Assert.True(result.Data.RequiresOverride);
        Assert.Contains("manual override is valid and accepted", result.Data.Message);
    }

    [Fact]
    public async Task ValidateMaxDiscount_ExceedsRoleLimit_OverrideMissingReason_ReturnsInvalid()
    {
        var request = new ValidateDiscountRequest
        {
            Role = "Manager",
            Value = 40.0m,
            IsManualOverride = true,
            OverrideReason = "short" // Less than 10 characters
        };

        var result = await _service.ValidateMaxDiscountAsync(request, tenantId: 1);

        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.False(result.Data.IsValid);
        Assert.Contains("requires an override reason of at least 10 characters", result.Data.Message);
    }

    [Fact]
    public async Task ValidateMaxDiscount_RoleCannotApplyDiscount_ReturnsInvalid()
    {
        var request = new ValidateDiscountRequest
        {
            Role = "Sales User",
            Value = 5.0m,
            IsManualOverride = false
        };

        var result = await _service.ValidateMaxDiscountAsync(request, tenantId: 1);

        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.False(result.Data.IsValid);
        Assert.Contains("does not have permission to apply discounts", result.Data.Message);
    }
}
