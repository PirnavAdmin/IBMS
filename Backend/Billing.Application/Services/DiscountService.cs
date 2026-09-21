using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Discount;
using Billing.Domain.Entities;
using Billing.Domain.Enums;
using Microsoft.Extensions.Logging;

namespace Billing.Application.Services;

public class DiscountService : IDiscountService
{
    // Tenant limit constants (IBMSBE-008)
    public const decimal DefaultMaxDiscountPercentage = 50.00m;
    public const decimal DefaultMaxFixedDiscountAmount = 10000.00m;

    // Role limit thresholds (IBMSBE-009)
    public const decimal CashierMaxDiscountPercentage = 10.00m;
    public const decimal ManagerMaxDiscountPercentage = 30.00m;

    private readonly IDiscountRuleRepository _discountRuleRepository;
    private readonly IAuditLogRepository _auditLogRepository;
    private readonly ILogger<DiscountService> _logger;

    public DiscountService(
        IDiscountRuleRepository discountRuleRepository,
        IAuditLogRepository auditLogRepository,
        ILogger<DiscountService> logger)
    {
        _discountRuleRepository = discountRuleRepository;
        _auditLogRepository = auditLogRepository;
        _logger = logger;
    }

    /// <summary>
    /// IBMSBE-007: Calculate line-level discount (percentage or fixed).
    /// </summary>
    public LineDiscountResultDto CalculateLineDiscount(CalculateLineDiscountRequest request)
    {
        if (request == null)
            throw new ArgumentNullException(nameof(request));

        var result = new LineDiscountResultDto
        {
            ProductId = request.ProductId,
            ProductName = request.ProductName,
            UnitPrice = Math.Max(0m, request.UnitPrice),
            Quantity = Math.Max(0, request.Quantity),
            AppliedDiscountType = request.DiscountType,
            AppliedDiscountValue = Math.Max(0m, request.DiscountValue),
            AppliedDiscountCode = request.DiscountCode
        };

        result.OriginalLineTotal = Math.Round(result.UnitPrice * result.Quantity, 2, MidpointRounding.AwayFromZero);

        if (result.OriginalLineTotal <= 0m || result.AppliedDiscountValue <= 0m)
        {
            result.DiscountAmount = 0m;
            result.DiscountedLineTotal = result.OriginalLineTotal;
            return result;
        }

        bool isPercentage = string.Equals(request.DiscountType, "Percentage", StringComparison.OrdinalIgnoreCase)
                            || string.Equals(request.DiscountType, "Percent", StringComparison.OrdinalIgnoreCase)
                            || string.Equals(request.DiscountType, "1", StringComparison.OrdinalIgnoreCase);

        decimal calculatedDiscount;
        if (isPercentage)
        {
            decimal cappedPercent = Math.Min(100.00m, result.AppliedDiscountValue);
            calculatedDiscount = Math.Round(result.OriginalLineTotal * (cappedPercent / 100.00m), 2, MidpointRounding.AwayFromZero);
        }
        else
        {
            calculatedDiscount = Math.Min(result.AppliedDiscountValue, result.OriginalLineTotal);
        }

        result.DiscountAmount = Math.Max(0m, Math.Min(calculatedDiscount, result.OriginalLineTotal));
        result.DiscountedLineTotal = Math.Round(result.OriginalLineTotal - result.DiscountAmount, 2, MidpointRounding.AwayFromZero);

        return result;
    }

    /// <summary>
    /// IBMSBE-007, 008, 009, 010: Calculate full invoice discounts with limits, role permissions, and override audits.
    /// </summary>
    public async Task<ApiResponse<InvoiceDiscountResultDto>> CalculateInvoiceDiscountAsync(
        CalculateInvoiceDiscountRequest request,
        int tenantId,
        string? userRole = null,
        string? userName = null,
        CancellationToken cancellationToken = default)
    {
        if (request == null)
        {
            return ApiResponse<InvoiceDiscountResultDto>.Fail("Invalid request", "Request body cannot be null.");
        }

        var result = new InvoiceDiscountResultDto();
        var validationErrors = new List<string>();

        // 1. Calculate line-level discounts
        if (request.LineItems != null && request.LineItems.Any())
        {
            foreach (var lineItem in request.LineItems)
            {
                var lineResult = CalculateLineDiscount(lineItem);
                result.LineItemResults.Add(lineResult);
                result.GrossSubtotal += lineResult.OriginalLineTotal;
                result.TotalLineDiscounts += lineResult.DiscountAmount;
            }
        }
        else if (request.InvoiceSubtotal.HasValue && request.InvoiceSubtotal.Value > 0)
        {
            result.GrossSubtotal = Math.Round(request.InvoiceSubtotal.Value, 2, MidpointRounding.AwayFromZero);
        }

        result.GrossSubtotal = Math.Round(result.GrossSubtotal, 2, MidpointRounding.AwayFromZero);
        result.TotalLineDiscounts = Math.Round(result.TotalLineDiscounts, 2, MidpointRounding.AwayFromZero);
        result.NetSubtotal = Math.Max(0m, Math.Round(result.GrossSubtotal - result.TotalLineDiscounts, 2, MidpointRounding.AwayFromZero));

        // 2. Invoice-level discount determination (either from Code or direct Value)
        decimal invoiceDiscountValue = request.InvoiceDiscountValue ?? 0m;
        string invoiceDiscountType = request.InvoiceDiscountType ?? "Percentage";
        decimal? maxDiscountCap = null;

        if (!string.IsNullOrWhiteSpace(request.DiscountCode))
        {
            var rule = await _discountRuleRepository.GetByCodeAsync(request.DiscountCode.Trim(), tenantId, cancellationToken);
            if (rule == null || !rule.IsActive)
            {
                validationErrors.Add($"Discount code '{request.DiscountCode}' is invalid, inactive, or not found.");
            }
            else
            {
                var now = DateTime.UtcNow;
                if (rule.StartDateUtc.HasValue && rule.StartDateUtc.Value > now)
                {
                    validationErrors.Add($"Discount code '{request.DiscountCode}' is not yet active (starts {rule.StartDateUtc.Value:yyyy-MM-dd}).");
                }
                if (rule.EndDateUtc.HasValue && rule.EndDateUtc.Value < now)
                {
                    validationErrors.Add($"Discount code '{request.DiscountCode}' has expired on {rule.EndDateUtc.Value:yyyy-MM-dd}.");
                }
                if (rule.MinInvoiceAmount.HasValue && result.NetSubtotal < rule.MinInvoiceAmount.Value)
                {
                    validationErrors.Add($"Discount code '{request.DiscountCode}' requires a minimum subtotal of INR {rule.MinInvoiceAmount.Value:F2}. Current: INR {result.NetSubtotal:F2}.");
                }

                invoiceDiscountType = rule.Type == DiscountType.Percentage ? "Percentage" : "FixedAmount";
                invoiceDiscountValue = rule.Value;
                maxDiscountCap = rule.MaxDiscountAmount;
            }
        }

        bool isInvoicePercentage = string.Equals(invoiceDiscountType, "Percentage", StringComparison.OrdinalIgnoreCase)
                                   || string.Equals(invoiceDiscountType, "Percent", StringComparison.OrdinalIgnoreCase)
                                   || string.Equals(invoiceDiscountType, "1", StringComparison.OrdinalIgnoreCase);

        // 3. IBMSBE-008: Maximum Discount Validation
        decimal effectiveDiscountPercentage = 0m;
        if (isInvoicePercentage)
        {
            effectiveDiscountPercentage = invoiceDiscountValue;
        }
        else if (result.NetSubtotal > 0m)
        {
            effectiveDiscountPercentage = Math.Round((invoiceDiscountValue / result.NetSubtotal) * 100m, 2);
        }

        if (!request.IsManualOverride)
        {
            if (effectiveDiscountPercentage > DefaultMaxDiscountPercentage)
            {
                validationErrors.Add($"Discount of {effectiveDiscountPercentage:F2}% exceeds the tenant maximum allowed limit of {DefaultMaxDiscountPercentage:F2}%. Manual manager override required.");
            }
            if (!isInvoicePercentage && invoiceDiscountValue > DefaultMaxFixedDiscountAmount)
            {
                validationErrors.Add($"Fixed discount of INR {invoiceDiscountValue:F2} exceeds tenant maximum limit of INR {DefaultMaxFixedDiscountAmount:F2}. Manual manager override required.");
            }
        }

        // 4. IBMSBE-009: Role-Based Discount Permissions
        string effectiveRole = string.IsNullOrWhiteSpace(request.UserRole)
            ? (string.IsNullOrWhiteSpace(userRole) ? "Cashier" : userRole.Trim())
            : request.UserRole.Trim();

        bool isCashier = string.Equals(effectiveRole, "Cashier", StringComparison.OrdinalIgnoreCase)
                         || string.Equals(effectiveRole, "Customer", StringComparison.OrdinalIgnoreCase)
                         || string.Equals(effectiveRole, "User", StringComparison.OrdinalIgnoreCase);

        bool isManager = string.Equals(effectiveRole, "Manager", StringComparison.OrdinalIgnoreCase);

        bool isAdmin = string.Equals(effectiveRole, "Admin", StringComparison.OrdinalIgnoreCase)
                       || string.Equals(effectiveRole, "SuperAdmin", StringComparison.OrdinalIgnoreCase)
                       || string.Equals(effectiveRole, "TenantAdmin", StringComparison.OrdinalIgnoreCase);

        if (isCashier && !request.IsManualOverride)
        {
            if (effectiveDiscountPercentage > CashierMaxDiscountPercentage)
            {
                validationErrors.Add($"User role '{effectiveRole}' is not authorized to apply discounts exceeding {CashierMaxDiscountPercentage:F2}%. Current requested: {effectiveDiscountPercentage:F2}%. Requires Manager or Admin authorization.");
            }
        }
        else if (isManager && !request.IsManualOverride)
        {
            if (effectiveDiscountPercentage > ManagerMaxDiscountPercentage)
            {
                validationErrors.Add($"User role '{effectiveRole}' is not authorized to apply discounts exceeding {ManagerMaxDiscountPercentage:F2}%. Current requested: {effectiveDiscountPercentage:F2}%. Requires Admin authorization.");
            }
        }

        // 5. IBMSBE-010: Manual Override Reason & Audit
        if (request.IsManualOverride)
        {
            // Cashier cannot perform manual override
            if (isCashier && !isAdmin && !isManager)
            {
                validationErrors.Add($"User role '{effectiveRole}' is not authorized to perform manual discount overrides. Requires Manager or Admin.");
            }

            // Reason is strictly mandatory (minimum 5 chars)
            if (string.IsNullOrWhiteSpace(request.OverrideReason) || request.OverrideReason.Trim().Length < 5)
            {
                validationErrors.Add("Manual discount override requires a mandatory 'OverrideReason' (minimum 5 characters).");
            }
            else
            {
                result.IsOverrideApplied = true;
                result.OverrideReason = request.OverrideReason.Trim();
            }
        }

        // If there are validation errors, return failed response
        if (validationErrors.Any())
        {
            result.IsValid = false;
            result.ValidationErrors = validationErrors;
            var failResponse = ApiResponse<InvoiceDiscountResultDto>.Fail("Discount validation failed", validationErrors);
            failResponse.Data = result;
            return failResponse;
        }

        // 6. Calculate invoice discount amount
        decimal calculatedInvoiceDiscount = 0m;
        if (result.NetSubtotal > 0m && invoiceDiscountValue > 0m)
        {
            if (isInvoicePercentage)
            {
                decimal cappedPercent = Math.Min(100.00m, invoiceDiscountValue);
                calculatedInvoiceDiscount = Math.Round(result.NetSubtotal * (cappedPercent / 100.00m), 2, MidpointRounding.AwayFromZero);
            }
            else
            {
                calculatedInvoiceDiscount = Math.Min(invoiceDiscountValue, result.NetSubtotal);
            }

            if (maxDiscountCap.HasValue && maxDiscountCap.Value > 0m)
            {
                calculatedInvoiceDiscount = Math.Min(calculatedInvoiceDiscount, maxDiscountCap.Value);
            }
        }

        result.InvoiceDiscountAmount = Math.Max(0m, Math.Min(calculatedInvoiceDiscount, result.NetSubtotal));
        result.TotalDiscountAmount = Math.Round(result.TotalLineDiscounts + result.InvoiceDiscountAmount, 2, MidpointRounding.AwayFromZero);
        result.FinalTotal = Math.Max(0m, Math.Round(result.GrossSubtotal - result.TotalDiscountAmount, 2, MidpointRounding.AwayFromZero));
        result.IsValid = true;

        // 7. IBMSBE-010: Log to AuditLog on manual override
        if (result.IsOverrideApplied)
        {
            try
            {
                var auditLog = new AuditLog
                {
                    TenantId = tenantId <= 0 ? 1 : tenantId,
                    EntityName = "Discount",
                    EntityId = string.IsNullOrWhiteSpace(request.InvoiceId) ? Guid.NewGuid().ToString("N")[..8].ToUpperInvariant() : request.InvoiceId.Trim(),
                    Action = "MANUAL_OVERRIDE",
                    UserName = string.IsNullOrWhiteSpace(userName) ? effectiveRole : userName.Trim(),
                    Timestamp = DateTime.UtcNow,
                    Changes = $"Manual discount override applied. Role: '{effectiveRole}', Reason: '{result.OverrideReason}', TotalDiscount: INR {result.TotalDiscountAmount:F2}, FinalTotal: INR {result.FinalTotal:F2}"
                };

                await _auditLogRepository.AddAsync(auditLog, cancellationToken);
                _logger.LogInformation("AuditLog recorded for discount manual override by {UserName} (Tenant {TenantId})", auditLog.UserName, tenantId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to write audit log for manual discount override in tenant {TenantId}", tenantId);
            }
        }

        return ApiResponse<InvoiceDiscountResultDto>.Ok(result, "Discount calculation completed successfully.");
    }

    /// <summary>
    /// IBMSBE-009: Configure new discount rule (Manager / Admin only).
    /// </summary>
    public async Task<ApiResponse<DiscountRuleDto>> CreateRuleAsync(
        CreateDiscountRuleRequest request,
        int tenantId,
        string? userRole = null,
        CancellationToken cancellationToken = default)
    {
        if (tenantId <= 0)
            return ApiResponse<DiscountRuleDto>.Fail("Invalid tenant", "A valid positive Tenant ID is required.");

        if (string.IsNullOrWhiteSpace(request.Code))
            return ApiResponse<DiscountRuleDto>.Fail("Validation failed", "Discount code is required.");

        if (string.IsNullOrWhiteSpace(request.Name))
            return ApiResponse<DiscountRuleDto>.Fail("Validation failed", "Discount name is required.");

        if (request.Value <= 0m)
            return ApiResponse<DiscountRuleDto>.Fail("Validation failed", "Discount value must be greater than zero.");

        // Check role permission to configure rules
        bool canConfigure = string.Equals(userRole, "Admin", StringComparison.OrdinalIgnoreCase)
                            || string.Equals(userRole, "SuperAdmin", StringComparison.OrdinalIgnoreCase)
                            || string.Equals(userRole, "TenantAdmin", StringComparison.OrdinalIgnoreCase)
                            || string.Equals(userRole, "Manager", StringComparison.OrdinalIgnoreCase);

        if (!string.IsNullOrWhiteSpace(userRole) && !canConfigure)
        {
            return ApiResponse<DiscountRuleDto>.Fail("Unauthorized", $"User role '{userRole}' is not authorized to create discount rules.");
        }

        var normalizedCode = request.Code.Trim().ToUpperInvariant();
        var existing = await _discountRuleRepository.GetByCodeAsync(normalizedCode, tenantId, cancellationToken);
        if (existing != null)
        {
            return ApiResponse<DiscountRuleDto>.Fail("Conflict", $"Discount code '{normalizedCode}' already exists for this tenant.");
        }

        var type = string.Equals(request.Type, "FixedAmount", StringComparison.OrdinalIgnoreCase)
                   || string.Equals(request.Type, "Fixed", StringComparison.OrdinalIgnoreCase)
            ? DiscountType.FixedAmount
            : DiscountType.Percentage;

        var scope = string.Equals(request.Scope, "LineItem", StringComparison.OrdinalIgnoreCase)
            ? DiscountScope.LineItem
            : DiscountScope.Invoice;

        var rule = new DiscountRule
        {
            TenantId = tenantId,
            Code = normalizedCode,
            Name = request.Name.Trim(),
            Description = request.Description?.Trim(),
            Type = type,
            Scope = scope,
            Value = request.Value,
            MinInvoiceAmount = request.MinInvoiceAmount,
            MaxDiscountAmount = request.MaxDiscountAmount,
            StartDateUtc = request.StartDateUtc,
            EndDateUtc = request.EndDateUtc,
            Status = "Active",
            ApplicableRole = request.ApplicableRole?.Trim(),
            CreatedAtUtc = DateTime.UtcNow,
            RowVersion = DateTime.UtcNow
        };

        var saved = await _discountRuleRepository.AddAsync(rule, cancellationToken);

        try
        {
            await _auditLogRepository.AddAsync(new AuditLog
            {
                TenantId = tenantId,
                EntityName = "DiscountRule",
                EntityId = saved.Id.ToString(),
                Action = "CREATE",
                UserName = string.IsNullOrWhiteSpace(userRole) ? "Admin" : userRole.Trim(),
                Timestamp = DateTime.UtcNow,
                Changes = $"Created discount rule '{saved.Name}' ({saved.Code}) with value {saved.Value}."
            }, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to write audit log for creating discount rule {Code}", saved.Code);
        }

        return ApiResponse<DiscountRuleDto>.Ok(MapToDto(saved), "Discount rule created successfully.");
    }

    public async Task<ApiResponse<DiscountRuleDto>> UpdateRuleAsync(
        int id,
        UpdateDiscountRuleRequest request,
        int tenantId,
        string? userRole = null,
        CancellationToken cancellationToken = default)
    {
        if (id <= 0 || tenantId <= 0)
            return ApiResponse<DiscountRuleDto>.Fail("Invalid ID", "Valid rule ID and Tenant ID are required.");

        bool canConfigure = string.Equals(userRole, "Admin", StringComparison.OrdinalIgnoreCase)
                            || string.Equals(userRole, "SuperAdmin", StringComparison.OrdinalIgnoreCase)
                            || string.Equals(userRole, "TenantAdmin", StringComparison.OrdinalIgnoreCase)
                            || string.Equals(userRole, "Manager", StringComparison.OrdinalIgnoreCase);

        if (!string.IsNullOrWhiteSpace(userRole) && !canConfigure)
        {
            return ApiResponse<DiscountRuleDto>.Fail("Unauthorized", $"User role '{userRole}' is not authorized to update discount rules.");
        }

        var rule = await _discountRuleRepository.GetByIdAsync(id, tenantId, cancellationToken);
        if (rule == null)
        {
            return ApiResponse<DiscountRuleDto>.Fail("Not found", $"Discount rule with ID {id} not found.");
        }

        if (!string.IsNullOrWhiteSpace(request.Name))
            rule.Name = request.Name.Trim();

        rule.Description = request.Description?.Trim();

        if (request.Value > 0m)
            rule.Value = request.Value;

        rule.MinInvoiceAmount = request.MinInvoiceAmount;
        rule.MaxDiscountAmount = request.MaxDiscountAmount;
        rule.StartDateUtc = request.StartDateUtc;
        rule.EndDateUtc = request.EndDateUtc;

        if (!string.IsNullOrWhiteSpace(request.Status))
            rule.Status = request.Status.Trim();

        rule.ApplicableRole = request.ApplicableRole?.Trim();
        rule.UpdatedAtUtc = DateTime.UtcNow;

        await _discountRuleRepository.UpdateAsync(rule, cancellationToken);

        try
        {
            await _auditLogRepository.AddAsync(new AuditLog
            {
                TenantId = tenantId,
                EntityName = "DiscountRule",
                EntityId = rule.Id.ToString(),
                Action = "UPDATE",
                UserName = string.IsNullOrWhiteSpace(userRole) ? "Admin" : userRole.Trim(),
                Timestamp = DateTime.UtcNow,
                Changes = $"Updated discount rule '{rule.Name}' ({rule.Code}) with value {rule.Value} and status '{rule.Status}'."
            }, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to write audit log for updating discount rule {Code}", rule.Code);
        }

        return ApiResponse<DiscountRuleDto>.Ok(MapToDto(rule), "Discount rule updated successfully.");
    }

    public async Task<ApiResponse<DiscountRuleDto>> GetRuleByIdAsync(int id, int tenantId, CancellationToken cancellationToken = default)
    {
        var rule = await _discountRuleRepository.GetByIdAsync(id, tenantId, cancellationToken);
        if (rule == null)
            return ApiResponse<DiscountRuleDto>.Fail("Not found", $"Discount rule with ID {id} not found.");

        return ApiResponse<DiscountRuleDto>.Ok(MapToDto(rule), "Discount rule retrieved successfully.");
    }

    public async Task<ApiResponse<PagedResult<DiscountRuleDto>>> GetRulesAsync(
        int tenantId,
        int page = 1,
        int pageSize = 10,
        bool? activeOnly = null,
        CancellationToken cancellationToken = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var (items, totalCount) = await _discountRuleRepository.GetPagedAsync(tenantId, page, pageSize, activeOnly, cancellationToken);
        var dtos = items.Select(MapToDto).ToList();
        var paged = new PagedResult<DiscountRuleDto>(dtos, totalCount, page, pageSize);

        return ApiResponse<PagedResult<DiscountRuleDto>>.Ok(paged, "Discount rules retrieved successfully.");
    }

    public async Task<ApiResponse<bool>> DeleteRuleAsync(int id, int tenantId, string? userRole = null, CancellationToken cancellationToken = default)
    {
        bool canConfigure = string.Equals(userRole, "Admin", StringComparison.OrdinalIgnoreCase)
                            || string.Equals(userRole, "SuperAdmin", StringComparison.OrdinalIgnoreCase)
                            || string.Equals(userRole, "TenantAdmin", StringComparison.OrdinalIgnoreCase);

        if (!string.IsNullOrWhiteSpace(userRole) && !canConfigure)
        {
            return ApiResponse<bool>.Fail("Unauthorized", $"User role '{userRole}' is not authorized to delete discount rules.");
        }

        var rule = await _discountRuleRepository.GetByIdAsync(id, tenantId, cancellationToken);
        if (rule == null)
            return ApiResponse<bool>.Fail("Not found", $"Discount rule with ID {id} not found.");

        await _discountRuleRepository.DeleteAsync(rule, cancellationToken);

        try
        {
            await _auditLogRepository.AddAsync(new AuditLog
            {
                TenantId = tenantId,
                EntityName = "DiscountRule",
                EntityId = id.ToString(),
                Action = "DELETE",
                UserName = string.IsNullOrWhiteSpace(userRole) ? "Admin" : userRole.Trim(),
                Timestamp = DateTime.UtcNow,
                Changes = $"Deleted discount rule '{rule.Name}' ({rule.Code})."
            }, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to write audit log for deleting discount rule {Id}", id);
        }

        return ApiResponse<bool>.Ok(true, "Discount rule deleted successfully.");
    }

    private static DiscountRuleDto MapToDto(DiscountRule rule) => new()
    {
        Id = rule.Id,
        TenantId = rule.TenantId,
        Code = rule.Code,
        Name = rule.Name,
        Description = rule.Description,
        Type = rule.Type == DiscountType.FixedAmount ? "FixedAmount" : "Percentage",
        Scope = rule.Scope == DiscountScope.LineItem ? "LineItem" : "Invoice",
        Value = rule.Value,
        MinInvoiceAmount = rule.MinInvoiceAmount,
        MaxDiscountAmount = rule.MaxDiscountAmount,
        StartDateUtc = rule.StartDateUtc,
        EndDateUtc = rule.EndDateUtc,
        Status = rule.Status,
        IsActive = rule.IsActive,
        ApplicableRole = rule.ApplicableRole,
        CreatedAtUtc = rule.CreatedAtUtc,
        UpdatedAtUtc = rule.UpdatedAtUtc
    };
}