using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Charges;
using Billing.Domain.Entities;
using Billing.Domain.Enums;

namespace Billing.Application.Services;

public class ChargeSettingService : IChargeSettingService
{
    private readonly IChargeRepository _chargeRepository;
    private readonly IAuditLogRepository? _auditLogRepository;

    public ChargeSettingService(
        IChargeRepository chargeRepository,
        IAuditLogRepository? auditLogRepository = null)
    {
        _chargeRepository = chargeRepository;
        _auditLogRepository = auditLogRepository;
    }

    public async Task<ApiResponse<List<ChargeConfigurationDto>>> GetChargesAsync(int tenantId, bool? activeOnly = null, string? chargeType = null)
    {
        if (tenantId <= 0)
        {
            return ApiResponse<List<ChargeConfigurationDto>>.Fail("Invalid tenant identifier", "Tenant ID must be greater than 0.");
        }

        var list = await _chargeRepository.GetAllAsync(tenantId, activeOnly, chargeType);
        var dtos = list.Select(MapToDto).ToList();
        return ApiResponse<List<ChargeConfigurationDto>>.Ok(dtos, "Charges retrieved successfully.");
    }

    public async Task<ApiResponse<ChargeConfigurationDto>> GetChargeByIdAsync(int id, int tenantId)
    {
        if (id <= 0 || tenantId <= 0)
        {
            return ApiResponse<ChargeConfigurationDto>.Fail("Invalid identifier", "Valid ID and Tenant ID are required.");
        }

        var charge = await _chargeRepository.GetByIdAsync(id, tenantId);
        if (charge == null)
        {
            return ApiResponse<ChargeConfigurationDto>.Fail("Not found", $"Charge with ID {id} was not found.");
        }

        return ApiResponse<ChargeConfigurationDto>.Ok(MapToDto(charge));
    }

    public async Task<ApiResponse<ChargeConfigurationDto>> CreateChargeAsync(CreateChargeRequest request, int tenantId)
    {
        if (tenantId <= 0)
        {
            return ApiResponse<ChargeConfigurationDto>.Fail("Invalid tenant identifier", "Tenant ID must be greater than 0.");
        }

        if (request == null)
        {
            return ApiResponse<ChargeConfigurationDto>.Fail("Validation failed", "Request cannot be null.");
        }

        if (!string.IsNullOrWhiteSpace(request.Status) &&
            !string.Equals(request.Status.Trim(), "Active", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(request.Status.Trim(), "Inactive", StringComparison.OrdinalIgnoreCase))
        {
            return ApiResponse<ChargeConfigurationDto>.Fail("Status must be either 'Active' or 'Inactive'.", errorCode: "VALIDATION_ERROR");
        }

        var code = request.Code.Trim().ToUpperInvariant();
        var existing = await _chargeRepository.GetByCodeAsync(code, tenantId);
        if (existing != null)
        {
            return ApiResponse<ChargeConfigurationDto>.Fail($"Charge with code '{code}' already exists for this tenant.", errorCode: "CHARGE_CODE_EXISTS");
        }

        if (!Enum.TryParse<ChargeType>(request.ChargeType, true, out var parsedChargeType))
        {
            parsedChargeType = ChargeType.Custom;
        }

        if (!Enum.TryParse<ChargeCalculationType>(request.CalculationType, true, out var parsedCalcType))
        {
            parsedCalcType = ChargeCalculationType.Fixed;
        }

        var charge = new ChargeConfiguration
        {
            TenantId = tenantId,
            Name = request.Name.Trim(),
            Code = code,
            Description = request.Description?.Trim(),
            ChargeType = parsedChargeType,
            CalculationType = parsedCalcType,
            Amount = request.Amount,
            MinInvoiceAmount = request.MinInvoiceAmount,
            MaxChargeAmount = request.MaxChargeAmount,
            IsTaxable = request.IsTaxable,
            TaxCategory = request.TaxCategory?.Trim(),
            Status = string.IsNullOrWhiteSpace(request.Status) ? "Active" : request.Status.Trim(),
            CreatedAtUtc = DateTime.UtcNow,
            RowVersion = DateTime.UtcNow
        };

        var created = await _chargeRepository.AddAsync(charge);

        if (_auditLogRepository != null)
        {
            await _auditLogRepository.AddAsync(new AuditLog
            {
                TenantId = tenantId,
                EntityName = "ChargeConfiguration",
                EntityId = created.Id.ToString(),
                Action = "CREATE",
                UserName = "System",
                Timestamp = DateTime.UtcNow,
                Changes = $"Created charge '{created.Name}' ({created.Code}) with amount {created.Amount} and type {created.ChargeType}."
            });
        }

        return ApiResponse<ChargeConfigurationDto>.Ok(MapToDto(created), "Charge created successfully.");
    }

    public async Task<ApiResponse<ChargeConfigurationDto>> UpdateChargeAsync(int id, UpdateChargeRequest request, int tenantId)
    {
        if (id <= 0 || tenantId <= 0)
        {
            return ApiResponse<ChargeConfigurationDto>.Fail("Invalid identifier", "Valid ID and Tenant ID are required.");
        }

        if (request == null)
        {
            return ApiResponse<ChargeConfigurationDto>.Fail("Validation failed", "Request cannot be null.");
        }

        if (!string.IsNullOrWhiteSpace(request.Status) &&
            !string.Equals(request.Status.Trim(), "Active", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(request.Status.Trim(), "Inactive", StringComparison.OrdinalIgnoreCase))
        {
            return ApiResponse<ChargeConfigurationDto>.Fail("Status must be either 'Active' or 'Inactive'.", errorCode: "VALIDATION_ERROR");
        }

        var charge = await _chargeRepository.GetByIdForUpdateAsync(id, tenantId)
                     ?? await _chargeRepository.GetByIdAsync(id, tenantId);
        if (charge == null)
        {
            return ApiResponse<ChargeConfigurationDto>.Fail("Not found", $"Charge with ID {id} was not found.");
        }

        if (!string.IsNullOrWhiteSpace(request.RowVersion))
        {
            var currentBase64 = Convert.ToBase64String(BitConverter.GetBytes(charge.RowVersion.Ticks));
            if (!string.Equals(request.RowVersion.Trim(), currentBase64, StringComparison.Ordinal))
            {
                return ApiResponse<ChargeConfigurationDto>.Fail(
                    "A concurrency conflict occurred. The requested resource was updated or locked concurrently. Please reload and retry the operation.",
                    errorCode: "CONCURRENCY_CONFLICT");
            }
        }

        if (!string.IsNullOrWhiteSpace(request.Code))
        {
            var code = request.Code.Trim().ToUpperInvariant();
            if (!string.Equals(charge.Code, code, StringComparison.OrdinalIgnoreCase))
            {
                var existing = await _chargeRepository.GetByCodeAsync(code, tenantId);
                if (existing != null && existing.Id != charge.Id)
                {
                    return ApiResponse<ChargeConfigurationDto>.Fail($"Charge with code '{code}' already exists for this tenant.");
                }
                charge.Code = code;
            }
        }

        if (!Enum.TryParse<ChargeType>(request.ChargeType, true, out var parsedChargeType))
        {
            parsedChargeType = charge.ChargeType;
        }

        if (!Enum.TryParse<ChargeCalculationType>(request.CalculationType, true, out var parsedCalcType))
        {
            parsedCalcType = charge.CalculationType;
        }

        charge.Name = request.Name.Trim();
        charge.Description = request.Description?.Trim();
        charge.ChargeType = parsedChargeType;
        charge.CalculationType = parsedCalcType;
        charge.Amount = request.Amount;
        charge.MinInvoiceAmount = request.MinInvoiceAmount;
        charge.MaxChargeAmount = request.MaxChargeAmount;
        charge.IsTaxable = request.IsTaxable;
        charge.TaxCategory = request.TaxCategory?.Trim();
        if (!string.IsNullOrWhiteSpace(request.Status))
        {
            charge.Status = request.Status.Trim();
        }
        charge.UpdatedAtUtc = DateTime.UtcNow;

        var updated = await _chargeRepository.UpdateAsync(charge);

        if (_auditLogRepository != null)
        {
            await _auditLogRepository.AddAsync(new AuditLog
            {
                TenantId = tenantId,
                EntityName = "ChargeConfiguration",
                EntityId = updated.Id.ToString(),
                Action = "UPDATE",
                UserName = "System",
                Timestamp = DateTime.UtcNow,
                Changes = $"Updated charge '{updated.Name}' ({updated.Code}) with amount {updated.Amount} and status '{updated.Status}'."
            });
        }

        return ApiResponse<ChargeConfigurationDto>.Ok(MapToDto(updated), "Charge updated successfully.");
    }

    public async Task<ApiResponse<bool>> DeleteChargeAsync(int id, int tenantId)
    {
        if (id <= 0 || tenantId <= 0)
        {
            return ApiResponse<bool>.Fail("Invalid identifier", "Valid ID and Tenant ID are required.");
        }

        var charge = await _chargeRepository.GetByIdAsync(id, tenantId);
        var success = await _chargeRepository.DeleteAsync(id, tenantId);
        if (!success)
        {
            return ApiResponse<bool>.Fail("Not found", $"Charge with ID {id} was not found.");
        }

        if (_auditLogRepository != null)
        {
            await _auditLogRepository.AddAsync(new AuditLog
            {
                TenantId = tenantId,
                EntityName = "ChargeConfiguration",
                EntityId = id.ToString(),
                Action = "DELETE",
                UserName = "System",
                Timestamp = DateTime.UtcNow,
                Changes = $"Deleted charge '{charge?.Name ?? id.ToString()}' ({charge?.Code ?? string.Empty})."
            });
        }

        return ApiResponse<bool>.Ok(true, "Charge deleted successfully.");
    }

    private static ChargeConfigurationDto MapToDto(ChargeConfiguration c)
    {
        return new ChargeConfigurationDto
        {
            Id = c.Id,
            TenantId = c.TenantId,
            Name = c.Name,
            Code = c.Code,
            Description = c.Description,
            ChargeType = c.ChargeType.ToString(),
            CalculationType = c.CalculationType.ToString(),
            Amount = c.Amount,
            MinInvoiceAmount = c.MinInvoiceAmount,
            MaxChargeAmount = c.MaxChargeAmount,
            IsTaxable = c.IsTaxable,
            TaxCategory = c.TaxCategory,
            Status = c.Status,
            IsActive = c.IsActive,
            CreatedAtUtc = c.CreatedAtUtc,
            UpdatedAtUtc = c.UpdatedAtUtc,
            RowVersion = Convert.ToBase64String(BitConverter.GetBytes(c.RowVersion.Ticks))
        };
    }
}
