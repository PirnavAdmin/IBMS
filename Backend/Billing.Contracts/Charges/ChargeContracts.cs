using System.ComponentModel.DataAnnotations;

namespace Billing.Contracts.Charges;

public class ChargeConfigurationDto
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string ChargeType { get; set; } = "Custom";
    public string CalculationType { get; set; } = "Fixed";
    public decimal Amount { get; set; }
    public decimal? MinInvoiceAmount { get; set; }
    public decimal? MaxChargeAmount { get; set; }
    public bool IsTaxable { get; set; } = true;
    public string? TaxCategory { get; set; }
    public string Status { get; set; } = "Active";
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
    public string? RowVersion { get; set; }
}

public class CreateChargeRequest
{
    [Required(ErrorMessage = "Charge name is required.")]
    [StringLength(128, MinimumLength = 2, ErrorMessage = "Charge name must be between 2 and 128 characters.")]
    public string Name { get; set; } = string.Empty;

    [Required(ErrorMessage = "Charge code is required.")]
    [StringLength(64, MinimumLength = 2, ErrorMessage = "Charge code must be between 2 and 64 characters.")]
    public string Code { get; set; } = string.Empty;

    [StringLength(500, ErrorMessage = "Description cannot exceed 500 characters.")]
    public string? Description { get; set; }

    [Required(ErrorMessage = "Charge type is required.")]
    [StringLength(32)]
    public string ChargeType { get; set; } = "Custom"; // Shipping, Handling, ConvenienceFee, LateFee, Custom

    [Required(ErrorMessage = "Calculation type is required.")]
    [StringLength(32)]
    public string CalculationType { get; set; } = "Fixed"; // Fixed, Percentage

    [Required(ErrorMessage = "Amount or rate is required.")]
    [Range(0.00, 99999999.99, ErrorMessage = "Amount must be a non-negative value.")]
    public decimal Amount { get; set; }

    [Range(0.00, 99999999.99, ErrorMessage = "Minimum invoice amount must be non-negative.")]
    public decimal? MinInvoiceAmount { get; set; }

    [Range(0.00, 99999999.99, ErrorMessage = "Maximum charge amount must be non-negative.")]
    public decimal? MaxChargeAmount { get; set; }

    public bool IsTaxable { get; set; } = true;

    [StringLength(64)]
    public string? TaxCategory { get; set; }

    [StringLength(32)]
    [RegularExpression("^(?i)(Active|Inactive)$", ErrorMessage = "Status must be either 'Active' or 'Inactive'.")]
    public string Status { get; set; } = "Active";
}

public class UpdateChargeRequest
{
    [Required(ErrorMessage = "Charge name is required.")]
    [StringLength(128, MinimumLength = 2, ErrorMessage = "Charge name must be between 2 and 128 characters.")]
    public string Name { get; set; } = string.Empty;

    [StringLength(64, MinimumLength = 2, ErrorMessage = "Charge code must be between 2 and 64 characters.")]
    public string? Code { get; set; }

    [StringLength(500, ErrorMessage = "Description cannot exceed 500 characters.")]
    public string? Description { get; set; }

    [StringLength(32)]
    public string ChargeType { get; set; } = "Custom";

    [StringLength(32)]
    public string CalculationType { get; set; } = "Fixed";

    [Required(ErrorMessage = "Amount or rate is required.")]
    [Range(0.00, 99999999.99, ErrorMessage = "Amount must be a non-negative value.")]
    public decimal Amount { get; set; }

    [Range(0.00, 99999999.99, ErrorMessage = "Minimum invoice amount must be non-negative.")]
    public decimal? MinInvoiceAmount { get; set; }

    [Range(0.00, 99999999.99, ErrorMessage = "Maximum charge amount must be non-negative.")]
    public decimal? MaxChargeAmount { get; set; }

    public bool IsTaxable { get; set; } = true;

    [StringLength(64)]
    public string? TaxCategory { get; set; }

    [StringLength(32)]
    [RegularExpression("^(?i)(Active|Inactive)$", ErrorMessage = "Status must be either 'Active' or 'Inactive'.")]
    public string Status { get; set; } = "Active";

    public string? RowVersion { get; set; }
}

public class CalculateChargesRequest
{
    [Required]
    [Range(0.00, 999999999.99)]
    public decimal Subtotal { get; set; }

    public List<string>? SelectedChargeCodes { get; set; }
    public List<int>? SelectedChargeIds { get; set; }
}

public class ChargeCalculationResultDto
{
    public decimal Subtotal { get; set; }
    public decimal TotalCharges { get; set; }
    public decimal TotalTaxableCharges { get; set; }
    public decimal TotalNonTaxableCharges { get; set; }
    public List<AppliedChargeDto> AppliedCharges { get; set; } = new();
}

public class AppliedChargeDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string ChargeType { get; set; } = "Custom";
    public string CalculationType { get; set; } = "Fixed";
    public decimal Rate { get; set; }
    public decimal CalculatedAmount { get; set; }
    public bool IsTaxable { get; set; }
    public string? TaxCategory { get; set; }
}
