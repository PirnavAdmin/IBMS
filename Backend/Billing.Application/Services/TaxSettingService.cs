using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Tax;
using Billing.Domain.Entities;

namespace Billing.Application.Services;

public class TaxSettingService : ITaxSettingService
{
    private readonly ITaxRepository _taxRepository;
    private readonly IAuditLogRepository? _auditLogRepository;

    public TaxSettingService(
        ITaxRepository taxRepository,
        IAuditLogRepository? auditLogRepository = null)
    {
        _taxRepository = taxRepository;
        _auditLogRepository = auditLogRepository;
    }

    public async Task<ApiResponse<TaxSettingsDto>> GetTaxSettingsAsync(
        int tenantId,
        string? taxType = null,
        string? status = null,
        bool? isActive = null,
        string? applicationLevel = null)
    {
        var settings = await _taxRepository.GetSettingsAsync(tenantId);
        if (settings == null)
        {
            // Default settings for tenant
            settings = new TaxSetting
            {
                TenantId = tenantId,
                IsTaxEnabled = true,
                DefaultTaxCalculation = "Exclusive",
                PricesIncludeTax = false,
                TaxNumberLabel = "GSTIN",
                EnableMultipleTaxes = true,
                State = "Telangana"
            };
            settings = await _taxRepository.UpsertSettingsAsync(settings);
        }

        var rates = await _taxRepository.GetRatesAsync(tenantId, taxType, status, isActive, applicationLevel);

        var dto = MapToSettingsDto(settings, rates);
        return ApiResponse<TaxSettingsDto>.Ok(dto);
    }

    public async Task<ApiResponse<TaxSettingsDto>> UpdateTaxSettingsAsync(
        UpdateTaxSettingsRequest request,
        int tenantId)
    {
        var settings = await _taxRepository.GetSettingsAsync(tenantId) ?? new TaxSetting { TenantId = tenantId };

        if (request.IsTaxEnabled.HasValue)
            settings.IsTaxEnabled = request.IsTaxEnabled.Value;

        if (!string.IsNullOrWhiteSpace(request.DefaultTaxCalculation))
            settings.DefaultTaxCalculation = request.DefaultTaxCalculation.Trim();

        if (request.PricesIncludeTax.HasValue)
            settings.PricesIncludeTax = request.PricesIncludeTax.Value;

        if (request.DefaultTaxRateId.HasValue)
            settings.DefaultTaxRateId = request.DefaultTaxRateId.Value;

        if (request.TaxRegistrationNumber != null)
            settings.TaxRegistrationNumber = string.IsNullOrWhiteSpace(request.TaxRegistrationNumber)
                ? null : request.TaxRegistrationNumber.Trim();

        if (!string.IsNullOrWhiteSpace(request.TaxNumberLabel))
            settings.TaxNumberLabel = request.TaxNumberLabel.Trim();

        if (request.EnableMultipleTaxes.HasValue)
            settings.EnableMultipleTaxes = request.EnableMultipleTaxes.Value;

        if (!string.IsNullOrWhiteSpace(request.State))
            settings.State = request.State.Trim();

        // Process any tax rates submitted in batch
        if (request.TaxRates != null && request.TaxRates.Count > 0)
        {
            foreach (var rReq in request.TaxRates)
            {
                var valErrors = TaxValidator.ValidateCreateRate(rReq);
                if (valErrors.Count > 0)
                {
                    return ApiResponse<TaxSettingsDto>.Fail("Validation failed on one or more tax rates.", valErrors);
                }

                var existing = await _taxRepository.GetRateByCodeAsync(rReq.Code, tenantId);
                if (existing != null)
                {
                    existing.Name = rReq.Name.Trim();
                    existing.TaxType = rReq.TaxType.Trim();
                    existing.Rate = rReq.Rate;
                    existing.Description = rReq.Description?.Trim();
                    existing.IsCompound = rReq.IsCompound;
                    existing.IsInclusive = rReq.IsInclusive;
                    existing.ApplicationLevel = rReq.ApplicationLevel?.Trim() ?? "Item";
                    existing.Priority = rReq.Priority;
                    existing.EffectiveFrom = rReq.EffectiveFrom;
                    existing.EffectiveTo = rReq.EffectiveTo;
                    existing.Status = rReq.Status?.Trim() ?? "Active";

                    await _taxRepository.UpdateRateAsync(existing);
                }
                else
                {
                    var newRate = new TaxRate
                    {
                        TenantId = tenantId,
                        Name = rReq.Name.Trim(),
                        Code = rReq.Code.Trim().ToUpperInvariant(),
                        TaxType = rReq.TaxType.Trim(),
                        Rate = rReq.Rate,
                        Description = rReq.Description?.Trim(),
                        IsCompound = rReq.IsCompound,
                        IsInclusive = rReq.IsInclusive,
                        ApplicationLevel = rReq.ApplicationLevel?.Trim() ?? "Item",
                        Priority = rReq.Priority,
                        EffectiveFrom = rReq.EffectiveFrom,
                        EffectiveTo = rReq.EffectiveTo,
                        Status = rReq.Status?.Trim() ?? "Active"
                    };
                    await _taxRepository.CreateRateAsync(newRate);
                }
            }
        }

        settings = await _taxRepository.UpsertSettingsAsync(settings);
        var allRates = await _taxRepository.GetRatesAsync(tenantId);

        var conflictErrors = TaxValidator.ValidateConflicts(allRates);
        if (conflictErrors.Count > 0)
        {
            return ApiResponse<TaxSettingsDto>.Fail("Tax configuration has conflicts.", conflictErrors, "TAX_CONFIGURATION_CONFLICT");
        }

        if (_auditLogRepository != null)
        {
            await _auditLogRepository.AddAsync(new AuditLog
            {
                TenantId = tenantId,
                EntityName = "TaxSetting",
                EntityId = settings.Id.ToString(),
                Action = "UPDATE",
                UserName = "System",
                Timestamp = DateTime.UtcNow,
                Changes = "Updated tax settings and configurations."
            });
        }

        var dto = MapToSettingsDto(settings, allRates);
        return ApiResponse<TaxSettingsDto>.Ok(dto, "Tax settings updated successfully.");
    }

    public async Task<ApiResponse<TaxRateDto>> GetTaxRateByIdAsync(int id, int tenantId)
    {
        var rate = await _taxRepository.GetRateByIdAsync(id, tenantId);
        if (rate == null)
            return ApiResponse<TaxRateDto>.Fail($"Tax rate with ID {id} not found.", errorCode: "TAX_RATE_NOT_FOUND");

        return ApiResponse<TaxRateDto>.Ok(MapToRateDto(rate));
    }

    public async Task<ApiResponse<TaxRateDto>> CreateTaxRateAsync(CreateTaxRateRequest request, int tenantId)
    {
        var errors = TaxValidator.ValidateCreateRate(request);
        if (errors.Count > 0)
            return ApiResponse<TaxRateDto>.Fail("Validation failed.", errors, "VALIDATION_ERROR");

        if (await _taxRepository.ExistsByCodeAsync(request.Code, tenantId))
            return ApiResponse<TaxRateDto>.Fail($"Tax rate with code '{request.Code}' already exists for this tenant.", errorCode: "TAX_RATE_CODE_EXISTS");

        var rate = new TaxRate
        {
            TenantId = tenantId,
            Name = request.Name.Trim(),
            Code = request.Code.Trim().ToUpperInvariant(),
            TaxType = request.TaxType.Trim(),
            Rate = request.Rate,
            Description = request.Description?.Trim(),
            IsCompound = request.IsCompound,
            IsInclusive = request.IsInclusive,
            ApplicationLevel = string.IsNullOrWhiteSpace(request.ApplicationLevel) ? "Item" : request.ApplicationLevel.Trim(),
            Priority = request.Priority < 1 ? 1 : request.Priority,
            EffectiveFrom = request.EffectiveFrom,
            EffectiveTo = request.EffectiveTo,
            Status = string.IsNullOrWhiteSpace(request.Status) ? "Active" : request.Status.Trim()
        };

        // Conflict check with existing active rates
        var existingRates = await _taxRepository.GetRatesAsync(tenantId, status: "Active");
        existingRates.Add(rate);
        var conflictErrors = TaxValidator.ValidateConflicts(existingRates);
        if (conflictErrors.Count > 0)
            return ApiResponse<TaxRateDto>.Fail("Configuration conflict detected.", conflictErrors, errorCode: "TAX_CONFIGURATION_CONFLICT");

        var created = await _taxRepository.CreateRateAsync(rate);

        if (_auditLogRepository != null)
        {
            await _auditLogRepository.AddAsync(new AuditLog
            {
                TenantId = tenantId,
                EntityName = "TaxRate",
                EntityId = created.Id.ToString(),
                Action = "CREATE",
                UserName = "System",
                Timestamp = DateTime.UtcNow,
                Changes = $"Created tax rate '{created.Name}' ({created.Code})."
            });
        }

        return ApiResponse<TaxRateDto>.Ok(MapToRateDto(created), "Tax rate created successfully.");
    }

    public async Task<ApiResponse<TaxRateDto>> UpdateTaxRateAsync(int id, UpdateTaxRateRequest request, int tenantId)
    {
        var rate = await _taxRepository.GetRateByIdAsync(id, tenantId);
        if (rate == null)
            return ApiResponse<TaxRateDto>.Fail($"Tax rate with ID {id} not found.", errorCode: "TAX_RATE_NOT_FOUND");

        var errors = TaxValidator.ValidateUpdateRate(request);
        if (errors.Count > 0)
            return ApiResponse<TaxRateDto>.Fail("Validation failed.", errors, "VALIDATION_ERROR");

        if (request.Code != null && !string.Equals(rate.Code, request.Code.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            if (await _taxRepository.ExistsByCodeAsync(request.Code, tenantId, id))
                return ApiResponse<TaxRateDto>.Fail($"Tax rate with code '{request.Code}' already exists for this tenant.", errorCode: "TAX_RATE_CODE_EXISTS");

            rate.Code = request.Code.Trim().ToUpperInvariant();
        }

        if (request.Name != null) rate.Name = request.Name.Trim();
        if (request.TaxType != null) rate.TaxType = request.TaxType.Trim();
        if (request.Rate.HasValue) rate.Rate = request.Rate.Value;
        if (request.Description != null) rate.Description = request.Description.Trim();
        if (request.IsCompound.HasValue) rate.IsCompound = request.IsCompound.Value;
        if (request.IsInclusive.HasValue) rate.IsInclusive = request.IsInclusive.Value;
        if (request.ApplicationLevel != null) rate.ApplicationLevel = request.ApplicationLevel.Trim();
        if (request.Priority.HasValue) rate.Priority = request.Priority.Value;
        if (request.EffectiveFrom.HasValue) rate.EffectiveFrom = request.EffectiveFrom.Value;
        if (request.EffectiveTo.HasValue) rate.EffectiveTo = request.EffectiveTo.Value;
        if (request.Status != null) rate.Status = request.Status.Trim();

        var updated = await _taxRepository.UpdateRateAsync(rate);

        if (_auditLogRepository != null)
        {
            await _auditLogRepository.AddAsync(new AuditLog
            {
                TenantId = tenantId,
                EntityName = "TaxRate",
                EntityId = updated.Id.ToString(),
                Action = "UPDATE",
                UserName = "System",
                Timestamp = DateTime.UtcNow,
                Changes = $"Updated tax rate '{updated.Name}' ({updated.Code})."
            });
        }

        return ApiResponse<TaxRateDto>.Ok(MapToRateDto(updated), "Tax rate updated successfully.");
    }

    public async Task<ApiResponse<bool>> DeleteTaxRateAsync(int id, int tenantId)
    {
        var rate = await _taxRepository.GetRateByIdAsync(id, tenantId);
        if (rate == null)
            return ApiResponse<bool>.Fail($"Tax rate with ID {id} not found.", errorCode: "TAX_RATE_NOT_FOUND");

        var deleted = await _taxRepository.DeleteRateAsync(id, tenantId);

        if (deleted && _auditLogRepository != null)
        {
            await _auditLogRepository.AddAsync(new AuditLog
            {
                TenantId = tenantId,
                EntityName = "TaxRate",
                EntityId = id.ToString(),
                Action = "DELETE",
                UserName = "System",
                Timestamp = DateTime.UtcNow,
                Changes = $"Deleted tax rate '{rate.Name}' ({rate.Code})."
            });
        }

        return ApiResponse<bool>.Ok(deleted, "Tax rate deleted successfully.");
    }

    private static TaxSettingsDto MapToSettingsDto(TaxSetting setting, List<TaxRate> rates)
    {
        return new TaxSettingsDto
        {
            Id = setting.Id,
            TenantId = setting.TenantId,
            IsTaxEnabled = setting.IsTaxEnabled,
            DefaultTaxCalculation = setting.DefaultTaxCalculation,
            PricesIncludeTax = setting.PricesIncludeTax,
            DefaultTaxRateId = setting.DefaultTaxRateId,
            TaxRegistrationNumber = setting.TaxRegistrationNumber,
            TaxNumberLabel = setting.TaxNumberLabel,
            EnableMultipleTaxes = setting.EnableMultipleTaxes,
            State = setting.State,
            TaxRates = rates.Select(MapToRateDto).ToList()
        };
    }

    private static TaxRateDto MapToRateDto(TaxRate r)
    {
        return new TaxRateDto
        {
            Id = r.Id,
            TenantId = r.TenantId,
            Name = r.Name,
            Code = r.Code,
            TaxType = r.TaxType,
            Rate = r.Rate,
            Description = r.Description,
            IsCompound = r.IsCompound,
            IsInclusive = r.IsInclusive,
            ApplicationLevel = r.ApplicationLevel,
            Priority = r.Priority,
            EffectiveFrom = r.EffectiveFrom,
            EffectiveTo = r.EffectiveTo,
            Status = r.Status,
            IsActive = r.IsActive,
            CreatedAtUtc = r.CreatedAtUtc,
            UpdatedAtUtc = r.UpdatedAtUtc
        };
    }
}
