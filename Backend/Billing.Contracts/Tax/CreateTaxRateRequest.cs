using System.ComponentModel.DataAnnotations;

namespace Billing.Contracts.Tax;

public class CreateTaxRateRequest
{
    [Required(ErrorMessage = "Tax rate name is required.")]
    [StringLength(128, MinimumLength = 2, ErrorMessage = "Tax rate name must be between 2 and 128 characters.")]
    [RegularExpression(@"^[\p{L}\p{M}0-9\s\-_()]+$", ErrorMessage = "Tax rate name can only contain letters, numbers, spaces, hyphens, and parentheses.")]
    public string Name { get; set; } = string.Empty;
    [Required(ErrorMessage = "Tax rate code is required.")]
    [StringLength(64, MinimumLength = 2, ErrorMessage = "Tax rate code must be between 2 and 64 characters.")]
    [RegularExpression(@"^[a-zA-Z0-9\-_]+$", ErrorMessage = "Tax rate code can only contain letters, numbers, hyphens, and underscores.")]
    public string Code { get; set; } = string.Empty;
    public string TaxType { get; set; } = "GST";
    public decimal Rate { get; set; }
    public string? Description { get; set; }
    public bool IsCompound { get; set; } = false;
    public bool IsInclusive { get; set; } = false;
    public string ApplicationLevel { get; set; } = "Item";
    public int Priority { get; set; } = 1;
    public DateTime? EffectiveFrom { get; set; }
    public DateTime? EffectiveTo { get; set; }
    public string Status { get; set; } = "Active";
}
