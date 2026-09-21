using System.ComponentModel.DataAnnotations;

namespace Billing.Contracts.Discount;

public class DiscountRolePermissionDto
{
    public string Id { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public bool CanApply { get; set; } = true;
    public decimal Maximum { get; set; } = 10.0m;
    public bool CanOverride { get; set; } = false;
    public bool RequiresReason { get; set; } = false;
    public string Status { get; set; } = "Active";
}

public class DiscountConfigurationDto
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public string Status { get; set; } = "Active";
    public string MaximumType { get; set; } = "Percentage";
    public decimal MaximumValue { get; set; } = 50.0m;
    public string DiscountType { get; set; } = "Percentage";
    public string ApplicationLevel { get; set; } = "Invoice Level";
    public bool AllowLineLevel { get; set; } = true;
    public bool AllowInvoiceLevel { get; set; } = true;
    public bool EnforceMaximum { get; set; } = true;
    public bool AllowManualOverride { get; set; } = true;
    public bool RequireOverrideReason { get; set; } = true;
    public int MinimumReasonLength { get; set; } = 10;
    public List<DiscountRolePermissionDto> Roles { get; set; } = new();
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
    public string? RowVersion { get; set; }
}

public class UpdateDiscountConfigurationRequest
{
    public string? Status { get; set; }
    public string? MaximumType { get; set; }
    public decimal? MaximumValue { get; set; }
    public string? DiscountType { get; set; }
    public string? ApplicationLevel { get; set; }
    public bool? AllowLineLevel { get; set; }
    public bool? AllowInvoiceLevel { get; set; }
    public bool? EnforceMaximum { get; set; }
    public bool? AllowManualOverride { get; set; }
    public bool? RequireOverrideReason { get; set; }
    public int? MinimumReasonLength { get; set; }
    public List<DiscountRolePermissionDto>? Roles { get; set; }
    public string? RowVersion { get; set; }
}

public class UpdateDiscountRolePermissionsRequest
{
    [Required]
    public List<DiscountRolePermissionDto> Roles { get; set; } = new();
}

public class ValidateDiscountRequest
{
    [Required]
    [Range(0.00, 999999999.99)]
    public decimal Value { get; set; }

    public string DiscountType { get; set; } = "Percentage"; // "Percentage" or "Fixed"

    public string? Role { get; set; }

    public decimal? InvoiceAmount { get; set; }

    public bool IsManualOverride { get; set; } = false;

    public string? OverrideReason { get; set; }
}

public class ValidateDiscountResultDto
{
    public bool IsValid { get; set; }
    public bool ExceedsMaximum { get; set; }
    public decimal ConfiguredMaximum { get; set; }
    public decimal RoleMaximum { get; set; }
    public bool RequiresOverride { get; set; }
    public bool RequiresReason { get; set; }
    public string Message { get; set; } = string.Empty;
}
