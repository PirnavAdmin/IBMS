using System.Text.Json;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Discount;
using Billing.Domain.Entities;
using Microsoft.Extensions.Logging;

namespace Billing.Application.Services;

public class DiscountSettingService : IDiscountSettingService
{
    private readonly IDiscountSettingRepository _repository;
    private readonly IAuditLogRepository? _auditLogRepository;
    private readonly ILogger<DiscountSettingService> _logger;

    public DiscountSettingService(
        IDiscountSettingRepository repository,
        ILogger<DiscountSettingService> logger,
        IAuditLogRepository? auditLogRepository = null)
    {
        _repository = repository;
        _logger = logger;
        _auditLogRepository = auditLogRepository;
    }

    public async Task<ApiResponse<DiscountConfigurationDto>> GetDiscountConfigurationAsync(int tenantId)
    {
        if (tenantId <= 0)
        {
            return ApiResponse<DiscountConfigurationDto>.Fail("Invalid tenant identifier", "Tenant ID must be greater than zero.");
        }

        var setting = await _repository.GetByTenantIdAsync(tenantId);
        if (setting == null)
        {
            setting = CreateDefaultSetting(tenantId);
            await _repository.AddAsync(setting);
        }

        return ApiResponse<DiscountConfigurationDto>.Ok(MapToDto(setting), "Discount configuration retrieved successfully.");
    }

    public async Task<ApiResponse<DiscountConfigurationDto>> UpdateDiscountConfigurationAsync(
        UpdateDiscountConfigurationRequest request,
        int tenantId,
        string? userName = null)
    {
        if (tenantId <= 0)
        {
            return ApiResponse<DiscountConfigurationDto>.Fail("Invalid tenant identifier", "Tenant ID must be greater than zero.");
        }

        if (request == null)
        {
            return ApiResponse<DiscountConfigurationDto>.Fail("Validation failed", "Request body cannot be null.");
        }

        var setting = await _repository.GetByTenantIdForUpdateAsync(tenantId)
                      ?? await _repository.GetByTenantIdAsync(tenantId);

        if (setting == null)
        {
            setting = CreateDefaultSetting(tenantId);
            await _repository.AddAsync(setting);
        }

        // Concurrency check if RowVersion provided
        if (!string.IsNullOrWhiteSpace(request.RowVersion))
        {
            var currentBase64 = Convert.ToBase64String(BitConverter.GetBytes(setting.RowVersion.Ticks));
            if (!string.Equals(request.RowVersion.Trim(), currentBase64, StringComparison.Ordinal))
            {
                return ApiResponse<DiscountConfigurationDto>.Fail(
                    "A concurrency conflict occurred. The discount configuration was updated concurrently. Please reload and retry.",
                    errorCode: "CONCURRENCY_CONFLICT");
            }
        }

        if (!string.IsNullOrWhiteSpace(request.Status))
        {
            var normalizedStatus = request.Status.Trim();
            if (!string.Equals(normalizedStatus, "Active", StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(normalizedStatus, "Inactive", StringComparison.OrdinalIgnoreCase))
            {
                return ApiResponse<DiscountConfigurationDto>.Fail("Status must be either 'Active' or 'Inactive'.", errorCode: "VALIDATION_ERROR");
            }
            setting.Status = normalizedStatus;
        }

        if (!string.IsNullOrWhiteSpace(request.MaximumType))
            setting.MaximumType = request.MaximumType.Trim();

        if (request.MaximumValue.HasValue)
        {
            if (request.MaximumValue.Value < 0)
            {
                return ApiResponse<DiscountConfigurationDto>.Fail("Validation failed", "Maximum discount value must be non-negative.");
            }
            if (string.Equals(setting.MaximumType, "Percentage", StringComparison.OrdinalIgnoreCase) && request.MaximumValue.Value > 100)
            {
                return ApiResponse<DiscountConfigurationDto>.Fail("Validation failed", "Maximum discount percentage cannot exceed 100%.");
            }
            setting.MaximumValue = request.MaximumValue.Value;
        }

        if (!string.IsNullOrWhiteSpace(request.DiscountType))
            setting.DiscountType = request.DiscountType.Trim();

        if (!string.IsNullOrWhiteSpace(request.ApplicationLevel))
            setting.ApplicationLevel = request.ApplicationLevel.Trim();

        if (request.AllowLineLevel.HasValue)
            setting.AllowLineLevel = request.AllowLineLevel.Value;

        if (request.AllowInvoiceLevel.HasValue)
            setting.AllowInvoiceLevel = request.AllowInvoiceLevel.Value;

        if (request.EnforceMaximum.HasValue)
            setting.EnforceMaximum = request.EnforceMaximum.Value;

        if (request.AllowManualOverride.HasValue)
            setting.AllowManualOverride = request.AllowManualOverride.Value;

        if (request.RequireOverrideReason.HasValue)
            setting.RequireOverrideReason = request.RequireOverrideReason.Value;

        if (request.MinimumReasonLength.HasValue && request.MinimumReasonLength.Value > 0)
            setting.MinimumReasonLength = request.MinimumReasonLength.Value;

        if (request.Roles != null && request.Roles.Count > 0)
        {
            setting.RolesJson = JsonSerializer.Serialize(request.Roles);
        }

        setting.UpdatedAtUtc = DateTime.UtcNow;

        var updated = await _repository.UpdateAsync(setting);

        if (_auditLogRepository != null)
        {
            await _auditLogRepository.AddAsync(new AuditLog
            {
                TenantId = tenantId,
                EntityName = "DiscountSetting",
                EntityId = updated.Id.ToString(),
                Action = "UPDATE",
                UserName = userName ?? "System",
                Timestamp = DateTime.UtcNow,
                Changes = $"Updated discount configuration: Max={updated.MaximumValue} ({updated.MaximumType}), Status='{updated.Status}'."
            });
        }

        return ApiResponse<DiscountConfigurationDto>.Ok(MapToDto(updated), "Discount configuration updated successfully.");
    }

    public async Task<ApiResponse<List<DiscountRolePermissionDto>>> GetRolePermissionsAsync(int tenantId)
    {
        var configResult = await GetDiscountConfigurationAsync(tenantId);
        if (!configResult.Success || configResult.Data == null)
        {
            return ApiResponse<List<DiscountRolePermissionDto>>.Fail(configResult.Message);
        }

        return ApiResponse<List<DiscountRolePermissionDto>>.Ok(configResult.Data.Roles, "Role permissions retrieved successfully.");
    }

    public async Task<ApiResponse<List<DiscountRolePermissionDto>>> UpdateRolePermissionsAsync(
        UpdateDiscountRolePermissionsRequest request,
        int tenantId,
        string? userName = null)
    {
        if (request?.Roles == null || request.Roles.Count == 0)
        {
            return ApiResponse<List<DiscountRolePermissionDto>>.Fail("Validation failed", "Roles list cannot be empty.");
        }

        var updateReq = new UpdateDiscountConfigurationRequest
        {
            Roles = request.Roles
        };

        var configResult = await UpdateDiscountConfigurationAsync(updateReq, tenantId, userName);
        if (!configResult.Success || configResult.Data == null)
        {
            return ApiResponse<List<DiscountRolePermissionDto>>.Fail(configResult.Message);
        }

        return ApiResponse<List<DiscountRolePermissionDto>>.Ok(configResult.Data.Roles, "Role permissions updated successfully.");
    }

    public async Task<ApiResponse<ValidateDiscountResultDto>> ValidateMaxDiscountAsync(
        ValidateDiscountRequest request,
        int tenantId,
        string? userRole = null)
    {
        if (request == null)
        {
            return ApiResponse<ValidateDiscountResultDto>.Fail("Validation failed", "Request cannot be null.");
        }

        var configRes = await GetDiscountConfigurationAsync(tenantId);
        var config = configRes.Data ?? MapToDto(CreateDefaultSetting(tenantId));

        var roleName = !string.IsNullOrWhiteSpace(request.Role) ? request.Role : (userRole ?? "Billing User");
        var matchedRole = config.Roles.FirstOrDefault(r => string.Equals(r.Role, roleName, StringComparison.OrdinalIgnoreCase) ||
                                                           string.Equals(r.Id, roleName, StringComparison.OrdinalIgnoreCase))
                          ?? config.Roles.FirstOrDefault(r => string.Equals(r.Id, "billing", StringComparison.OrdinalIgnoreCase))
                          ?? new DiscountRolePermissionDto { Role = roleName, Maximum = 10.0m, CanApply = true };

        var result = new ValidateDiscountResultDto
        {
            ConfiguredMaximum = config.MaximumValue,
            RoleMaximum = matchedRole.Maximum
        };

        if (!matchedRole.CanApply && request.Value > 0)
        {
            result.IsValid = false;
            result.ExceedsMaximum = true;
            result.Message = $"Role '{matchedRole.Role}' does not have permission to apply discounts.";
            return ApiResponse<ValidateDiscountResultDto>.Ok(result);
        }

        // Compare against role maximum and configured org maximum
        bool exceedsRole = request.Value > matchedRole.Maximum;
        bool exceedsOrg = config.EnforceMaximum && request.Value > config.MaximumValue;

        if (exceedsRole || exceedsOrg)
        {
            result.ExceedsMaximum = true;
            result.RequiresOverride = true;
            result.RequiresReason = config.RequireOverrideReason || matchedRole.RequiresReason;

            if (request.IsManualOverride)
            {
                if (!config.AllowManualOverride || !matchedRole.CanOverride)
                {
                    result.IsValid = false;
                    result.Message = $"Role '{matchedRole.Role}' is not permitted to override maximum discount limits.";
                    return ApiResponse<ValidateDiscountResultDto>.Ok(result);
                }

                if (result.RequiresReason)
                {
                    if (string.IsNullOrWhiteSpace(request.OverrideReason) || request.OverrideReason.Trim().Length < config.MinimumReasonLength)
                    {
                        result.IsValid = false;
                        result.Message = $"Manual override requires an override reason of at least {config.MinimumReasonLength} characters.";
                        return ApiResponse<ValidateDiscountResultDto>.Ok(result);
                    }
                }

                result.IsValid = true;
                result.Message = "Discount exceeds standard maximum but manual override is valid and accepted.";
                return ApiResponse<ValidateDiscountResultDto>.Ok(result);
            }

            result.IsValid = false;
            result.Message = exceedsRole
                ? $"Requested discount of {request.Value}% exceeds the maximum of {matchedRole.Maximum}% allowed for role '{matchedRole.Role}'."
                : $"Requested discount of {request.Value}% exceeds the organization maximum limit of {config.MaximumValue}%.";

            return ApiResponse<ValidateDiscountResultDto>.Ok(result);
        }

        result.IsValid = true;
        result.ExceedsMaximum = false;
        result.RequiresOverride = false;
        result.RequiresReason = false;
        result.Message = "Discount is within allowed limits.";

        return ApiResponse<ValidateDiscountResultDto>.Ok(result);
    }

    private static DiscountSetting CreateDefaultSetting(int tenantId)
    {
        return new DiscountSetting
        {
            TenantId = tenantId,
            Status = "Active",
            MaximumType = "Percentage",
            MaximumValue = 50.0m,
            DiscountType = "Percentage",
            ApplicationLevel = "Invoice Level",
            AllowLineLevel = true,
            AllowInvoiceLevel = true,
            EnforceMaximum = true,
            AllowManualOverride = true,
            RequireOverrideReason = true,
            MinimumReasonLength = 10,
            RolesJson = JsonSerializer.Serialize(GetDefaultRoles()),
            CreatedAtUtc = DateTime.UtcNow,
            RowVersion = DateTime.UtcNow
        };
    }

    private static List<DiscountRolePermissionDto> GetDefaultRoles() => new()
    {
        new DiscountRolePermissionDto { Id = "admin", Role = "Admin", CanApply = true, Maximum = 50.0m, CanOverride = true, RequiresReason = true, Status = "Active" },
        new DiscountRolePermissionDto { Id = "manager", Role = "Manager", CanApply = true, Maximum = 30.0m, CanOverride = true, RequiresReason = true, Status = "Active" },
        new DiscountRolePermissionDto { Id = "billing", Role = "Billing User", CanApply = true, Maximum = 10.0m, CanOverride = false, RequiresReason = false, Status = "Active" },
        new DiscountRolePermissionDto { Id = "sales", Role = "Sales User", CanApply = false, Maximum = 0.0m, CanOverride = false, RequiresReason = false, Status = "Active" }
    };

    private static DiscountConfigurationDto MapToDto(DiscountSetting s)
    {
        List<DiscountRolePermissionDto> roles;
        try
        {
            roles = !string.IsNullOrWhiteSpace(s.RolesJson)
                ? JsonSerializer.Deserialize<List<DiscountRolePermissionDto>>(s.RolesJson) ?? GetDefaultRoles()
                : GetDefaultRoles();
        }
        catch
        {
            roles = GetDefaultRoles();
        }

        return new DiscountConfigurationDto
        {
            Id = s.Id,
            TenantId = s.TenantId,
            Status = s.Status,
            MaximumType = s.MaximumType,
            MaximumValue = s.MaximumValue,
            DiscountType = s.DiscountType,
            ApplicationLevel = s.ApplicationLevel,
            AllowLineLevel = s.AllowLineLevel,
            AllowInvoiceLevel = s.AllowInvoiceLevel,
            EnforceMaximum = s.EnforceMaximum,
            AllowManualOverride = s.AllowManualOverride,
            RequireOverrideReason = s.RequireOverrideReason,
            MinimumReasonLength = s.MinimumReasonLength,
            Roles = roles,
            CreatedAtUtc = s.CreatedAtUtc,
            UpdatedAtUtc = s.UpdatedAtUtc,
            RowVersion = Convert.ToBase64String(BitConverter.GetBytes(s.RowVersion.Ticks))
        };
    }
}
