using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace Billing.Contracts;

public class CreateProductRequest
{
    [StringLength(64, ErrorMessage = "Product code cannot exceed 64 characters.")]
    public string? ProductCode { get; set; }

    [Required(ErrorMessage = "Product name is required.")]
    [StringLength(256, MinimumLength = 2, ErrorMessage = "Product name must be between 2 and 256 characters.")]
    public string Name { get; set; } = string.Empty;

    [StringLength(1000, ErrorMessage = "Description cannot exceed 1000 characters.")]
    public string? Description { get; set; }

    [StringLength(32, ErrorMessage = "Type cannot exceed 32 characters.")]
    public string Type { get; set; } = "Product";

    [StringLength(128, ErrorMessage = "Category name cannot exceed 128 characters.")]
    public string? Category { get; set; }

    [StringLength(32, ErrorMessage = "Unit cannot exceed 32 characters.")]
    public string Unit { get; set; } = "Piece";

    [Required(ErrorMessage = "Price is required.")]
    [Range(0.00, 999999999.99, ErrorMessage = "Price must be a non-negative number.")]
    public decimal Price { get; set; }

    [StringLength(10, ErrorMessage = "Currency cannot exceed 10 characters.")]
    public string Currency { get; set; } = "INR";

    [StringLength(64, ErrorMessage = "Tax category cannot exceed 64 characters.")]
    public string? TaxCategory { get; set; }

    [StringLength(32, ErrorMessage = "HSN/SAC code cannot exceed 32 characters.")]
    public string? HsnSacCode { get; set; }

    [JsonConverter(typeof(BooleanOrYesNoJsonConverter))]
    public bool DiscountAllowed { get; set; } = true;

    [Range(0.00, 100.00, ErrorMessage = "Discount percent must be between 0 and 100.")]
    public decimal? DiscountPercent { get; set; } = 0.00m;

    [StringLength(32, ErrorMessage = "Status cannot exceed 32 characters.")]
    public string Status { get; set; } = "Active";
}
