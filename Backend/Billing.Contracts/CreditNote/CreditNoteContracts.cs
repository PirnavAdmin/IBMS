using System.ComponentModel.DataAnnotations;

namespace Billing.Contracts.CreditNote;

public class CreateCreditNoteRequest
{
    [Required(ErrorMessage = "Invoice ID is required.")]
    [Range(1, int.MaxValue, ErrorMessage = "Invoice ID must be greater than 0.")]
    public int InvoiceId { get; set; }

    public DateTime? CreditDate { get; set; }

    /// <summary>
    /// Type of credit: "Full" or "Partial"
    /// </summary>
    [Required(ErrorMessage = "Credit type is required.")]
    public string Type { get; set; } = "Full";

    [Required(ErrorMessage = "Credit reason is required.")]
    [StringLength(250, ErrorMessage = "Reason must not exceed 250 characters.")]
    public string Reason { get; set; } = string.Empty;

    [StringLength(1000, ErrorMessage = "Notes must not exceed 1000 characters.")]
    public string? Notes { get; set; }

    /// <summary>
    /// Line items for Partial Credit (optional if Full credit)
    /// </summary>
    public List<CreateCreditNoteItemRequest> Items { get; set; } = new();

    /// <summary>
    /// Client-supplied or header-bound idempotency key
    /// </summary>
    public string? IdempotencyKey { get; set; }
}

public class CreateCreditNoteItemRequest
{
    public int? InvoiceItemId { get; set; }

    public int? ProductId { get; set; }

    [Required(ErrorMessage = "Item description is required.")]
    [StringLength(250)]
    public string Description { get; set; } = string.Empty;

    [Range(0.0001, 1000000, ErrorMessage = "Quantity must be greater than 0.")]
    public decimal Quantity { get; set; } = 1m;

    [Range(0, 1000000000, ErrorMessage = "Unit price cannot be negative.")]
    public decimal UnitPrice { get; set; }

    public decimal DiscountAmount { get; set; }

    public string? TaxType { get; set; }

    public decimal? TaxRate { get; set; }

    public decimal TaxAmount { get; set; }

    public decimal TotalAmount { get; set; }

    public string? HSNSAC { get; set; }
}

public class UpdateCreditNoteRequest
{
    public DateTime? CreditDate { get; set; }

    [Required(ErrorMessage = "Credit type is required.")]
    public string Type { get; set; } = "Full";

    [Required(ErrorMessage = "Credit reason is required.")]
    [StringLength(250, ErrorMessage = "Reason must not exceed 250 characters.")]
    public string Reason { get; set; } = string.Empty;

    [StringLength(1000, ErrorMessage = "Notes must not exceed 1000 characters.")]
    public string? Notes { get; set; }

    public List<CreateCreditNoteItemRequest> Items { get; set; } = new();
}

public class RejectCreditNoteRequest
{
    [Required(ErrorMessage = "Rejection reason is required.")]
    [StringLength(500, MinimumLength = 3, ErrorMessage = "Rejection reason must be between 3 and 500 characters.")]
    public string Reason { get; set; } = string.Empty;
}

public class CancelCreditNoteRequest
{
    [Required(ErrorMessage = "Cancellation reason is required.")]
    [StringLength(500, MinimumLength = 3, ErrorMessage = "Cancellation reason must be between 3 and 500 characters.")]
    public string Reason { get; set; } = string.Empty;
}

public class ProcessRefundRequest
{
    [Required(ErrorMessage = "Refund amount is required.")]
    [Range(0.01, 1000000000, ErrorMessage = "Refund amount must be greater than 0.")]
    public decimal RefundAmount { get; set; }

    [Required(ErrorMessage = "Payment method is required.")]
    [StringLength(50)]
    public string PaymentMethod { get; set; } = "Bank Transfer";

    [StringLength(100)]
    public string? ReferenceNumber { get; set; }

    [StringLength(500)]
    public string? Notes { get; set; }
}

public class CreditNoteFilterRequest
{
    public string? Search { get; set; }
    public string? Status { get; set; }
    public string? Type { get; set; }
    public int? CustomerId { get; set; }
    public int? InvoiceId { get; set; }
    public DateTime? FromDate { get; set; }
    public DateTime? ToDate { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 10;
    public string? SortBy { get; set; } = "CreditDate";
    public bool SortDescending { get; set; } = true;
}

public class CreditNoteListItemDto
{
    public int Id { get; set; }
    public string CreditNoteNumber { get; set; } = string.Empty;
    public int InvoiceId { get; set; }
    public string InvoiceNumber { get; set; } = string.Empty;
    public int CustomerId { get; set; }
    public string CustomerName { get; set; } = string.Empty;
    public DateTime CreditDate { get; set; }
    public string Type { get; set; } = "Full";
    public decimal Subtotal { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal TotalAmount { get; set; }
    public decimal RefundedAmount { get; set; }
    public decimal RemainingRefundableAmount { get; set; }
    public string Status { get; set; } = "Draft";
    public string Reason { get; set; } = string.Empty;
    public string Currency { get; set; } = "INR";
    public DateTime CreatedAtUtc { get; set; }
}

public class CreditNoteDetailDto
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public string CreditNoteNumber { get; set; } = string.Empty;
    public int InvoiceId { get; set; }
    public string InvoiceNumber { get; set; } = string.Empty;
    public int CustomerId { get; set; }
    public string CustomerName { get; set; } = string.Empty;
    public DateTime CreditDate { get; set; }
    public string Type { get; set; } = "Full";
    public decimal Subtotal { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal TotalAmount { get; set; }
    public decimal RefundedAmount { get; set; }
    public decimal RemainingRefundableAmount { get; set; }
    public string Status { get; set; } = "Draft";
    public string Reason { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public string Currency { get; set; } = "INR";

    // Linked Invoice summary
    public decimal InvoiceTotalAmount { get; set; }
    public decimal InvoicePaidAmount { get; set; }
    public decimal InvoiceCreditedAmount { get; set; }
    public decimal InvoiceBalanceAmount { get; set; }
    public string InvoiceStatus { get; set; } = string.Empty;

    // Audit / Actors
    public string CreatedBy { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; }
    public string? ApprovedBy { get; set; }
    public DateTime? ApprovedAtUtc { get; set; }
    public string? RejectionReason { get; set; }
    public string? RejectedBy { get; set; }
    public DateTime? RejectedAtUtc { get; set; }
    public string? IssuedBy { get; set; }
    public DateTime? IssuedAtUtc { get; set; }
    public string? CancelledBy { get; set; }
    public DateTime? CancelledAtUtc { get; set; }
    public string? CancellationReason { get; set; }

    public List<CreditNoteItemDto> Items { get; set; } = new();
    public List<CreditNoteRefundDto> Refunds { get; set; } = new();
}

public class CreditNoteItemDto
{
    public int Id { get; set; }
    public int? InvoiceItemId { get; set; }
    public int? ProductId { get; set; }
    public string Description { get; set; } = string.Empty;
    public decimal Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal DiscountAmount { get; set; }
    public string? TaxType { get; set; }
    public decimal? TaxRate { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal TotalAmount { get; set; }
    public string? HSNSAC { get; set; }
}

public class CreditNoteRefundDto
{
    public int Id { get; set; }
    public string RefundNumber { get; set; } = string.Empty;
    public DateTime RefundDate { get; set; }
    public decimal RefundAmount { get; set; }
    public string PaymentMethod { get; set; } = string.Empty;
    public string? ReferenceNumber { get; set; }
    public string? Notes { get; set; }
    public string ProcessedBy { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; }
}

public class InvoiceCreditableSummaryDto
{
    public int InvoiceId { get; set; }
    public string InvoiceNumber { get; set; } = string.Empty;
    public int CustomerId { get; set; }
    public string CustomerName { get; set; } = string.Empty;
    public string Currency { get; set; } = "INR";
    public DateTime InvoiceDate { get; set; }
    public string InvoiceStatus { get; set; } = string.Empty;
    public decimal TotalAmount { get; set; }
    public decimal PaidAmount { get; set; }
    public decimal CreditedAmount { get; set; }
    public decimal BalanceAmount { get; set; }
    public decimal RemainingCreditableAmount { get; set; }
    public bool IsEligibleForCredit { get; set; }
    public string? IneligibilityReason { get; set; }
    public List<InvoiceCreditableLineItemDto> Items { get; set; } = new();
}

public class InvoiceCreditableLineItemDto
{
    public int InvoiceItemId { get; set; }
    public int? ProductId { get; set; }
    public string Description { get; set; } = string.Empty;
    public decimal OriginalQuantity { get; set; }
    public decimal PreviouslyCreditedQuantity { get; set; }
    public decimal RemainingEligibleQuantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal DiscountAmount { get; set; }
    public string? TaxType { get; set; }
    public decimal? TaxRate { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal TotalAmount { get; set; }
    public decimal PreviouslyCreditedAmount { get; set; }
    public decimal RemainingEligibleAmount { get; set; }
    public string? HSNSAC { get; set; }
}
