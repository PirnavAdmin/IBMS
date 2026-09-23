using System.ComponentModel.DataAnnotations;

namespace Billing.Contracts.Quotation;

public class CreateQuotationItemRequest
{
    public int? ProductId { get; set; }

    [Required(ErrorMessage = "Item description is required.")]
    [StringLength(500, ErrorMessage = "Description cannot exceed 500 characters.")]
    public string Description { get; set; } = string.Empty;

    [Range(0.0001, 1000000, ErrorMessage = "Quantity must be greater than zero.")]
    public decimal Quantity { get; set; } = 1m;

    [Range(0, 1000000000, ErrorMessage = "UnitPrice must be non-negative.")]
    public decimal UnitPrice { get; set; }

    public string? DiscountType { get; set; } // "Percentage" or "Fixed"

    [Range(0, 1000000000, ErrorMessage = "Discount rate must be non-negative.")]
    public decimal? DiscountRate { get; set; }

    public string? TaxType { get; set; }

    [Range(0, 100, ErrorMessage = "Tax rate percent must be between 0 and 100.")]
    public decimal? TaxRate { get; set; }

    public string? HSNSAC { get; set; }
}

public class CreateQuotationRequest
{
    public string? QuoteNumber { get; set; }

    [Required(ErrorMessage = "CustomerId is required.")]
    [Range(1, int.MaxValue, ErrorMessage = "Valid CustomerId is required.")]
    public int CustomerId { get; set; }

    public DateTime? QuotationDate { get; set; }

    [Required(ErrorMessage = "ValidUntil date is required.")]
    public DateTime ValidUntil { get; set; }

    [StringLength(128, ErrorMessage = "Reference cannot exceed 128 characters.")]
    public string? Reference { get; set; }

    [StringLength(2000, ErrorMessage = "Notes cannot exceed 2000 characters.")]
    public string? Notes { get; set; }

    [StringLength(4000, ErrorMessage = "Terms and conditions cannot exceed 4000 characters.")]
    public string? TermsAndConditions { get; set; }

    [Required(ErrorMessage = "At least one item is required.")]
    [MinLength(1, ErrorMessage = "At least one item is required in the quotation.")]
    public List<CreateQuotationItemRequest> Items { get; set; } = new();
}

public class UpdateQuotationRequest
{
    [Required(ErrorMessage = "CustomerId is required.")]
    [Range(1, int.MaxValue, ErrorMessage = "Valid CustomerId is required.")]
    public int CustomerId { get; set; }

    [Required(ErrorMessage = "QuotationDate is required.")]
    public DateTime QuotationDate { get; set; }

    [Required(ErrorMessage = "ValidUntil date is required.")]
    public DateTime ValidUntil { get; set; }

    [StringLength(128, ErrorMessage = "Reference cannot exceed 128 characters.")]
    public string? Reference { get; set; }

    [StringLength(2000, ErrorMessage = "Notes cannot exceed 2000 characters.")]
    public string? Notes { get; set; }

    [StringLength(4000, ErrorMessage = "Terms and conditions cannot exceed 4000 characters.")]
    public string? TermsAndConditions { get; set; }

    [Required(ErrorMessage = "At least one item is required.")]
    [MinLength(1, ErrorMessage = "At least one item is required in the quotation.")]
    public List<CreateQuotationItemRequest> Items { get; set; } = new();

    public string? RowVersion { get; set; }
}

public class QuotationItemDto
{
    public int Id { get; set; }
    public int? ProductId { get; set; }
    public string? ProductCode { get; set; }
    public string? ProductName { get; set; }
    public string Description { get; set; } = string.Empty;
    public decimal Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public string? DiscountType { get; set; }
    public decimal? DiscountRate { get; set; }
    public decimal DiscountAmount { get; set; }
    public string? TaxType { get; set; }
    public decimal? TaxRate { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal TotalAmount { get; set; }
    public string? HSNSAC { get; set; }
}

public class QuotationCommunicationDto
{
    public int Id { get; set; }
    public string CommunicationType { get; set; } = string.Empty;
    public string Recipient { get; set; } = string.Empty;
    public string Subject { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTime SentAt { get; set; }
    public string SentBy { get; set; } = string.Empty;
}

public class QuotationResponse
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public string QuoteNumber { get; set; } = string.Empty;
    public int CustomerId { get; set; }
    public string CustomerName { get; set; } = string.Empty;
    public DateTime QuotationDate { get; set; }
    public DateTime ValidUntil { get; set; }
    public string? Reference { get; set; }
    public string Status { get; set; } = string.Empty;
    public decimal Subtotal { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal ChargesAmount { get; set; }
    public decimal TotalAmount { get; set; }
    public int? ConvertedInvoiceId { get; set; }
    public int ItemCount { get; set; }
    public string? RowVersion { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
}

public class QuotationDetailResponse : QuotationResponse
{
    public string? CustomerEmail { get; set; }
    public string? CustomerPhone { get; set; }
    public string? CustomerAddress { get; set; }
    public string? Notes { get; set; }
    public string? TermsAndConditions { get; set; }
    public List<QuotationItemDto> Items { get; set; } = new();
    public List<QuotationCommunicationDto> Communications { get; set; } = new();
}

public class QuotationListFilterRequest
{
    public string? Search { get; set; }
    public string? Status { get; set; }
    public int? CustomerId { get; set; }
    public DateTime? FromDate { get; set; }
    public DateTime? ToDate { get; set; }
    public int PageNumber { get; set; } = 1;
    public int PageSize { get; set; } = 10;
    public string? SortBy { get; set; } = "QuotationDate";
    public string? SortOrder { get; set; } = "desc";
}
