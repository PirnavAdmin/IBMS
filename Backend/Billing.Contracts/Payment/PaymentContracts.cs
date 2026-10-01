using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace Billing.Contracts.Payment;

public class CreatePaymentAllocationRequest
{
    [Required(ErrorMessage = "InvoiceId is required for allocation.")]
    [Range(1, int.MaxValue, ErrorMessage = "Valid InvoiceId is required.")]
    public int InvoiceId { get; set; }

    [Required(ErrorMessage = "AllocatedAmount is required.")]
    [Range(0.01, 1000000000, ErrorMessage = "AllocatedAmount must be greater than zero.")]
    public decimal AllocatedAmount { get; set; }

    [JsonIgnore]
    public decimal Amount
    {
        get => AllocatedAmount;
        set => AllocatedAmount = value;
    }
}

public class CreatePaymentRequest
{
    public int? InvoiceId { get; set; }

    public int? CustomerId { get; set; }

    public int? BranchId { get; set; }

    [StringLength(64, ErrorMessage = "PaymentNumber cannot exceed 64 characters.")]
    public string? PaymentNumber { get; set; }

    [Required(ErrorMessage = "PaymentDate is required.")]
    public DateTime? PaymentDate { get; set; } = DateTime.UtcNow;

    [Required(ErrorMessage = "Payment Amount is required.")]
    [Range(0.01, 1000000000, ErrorMessage = "Payment Amount must be greater than zero.")]
    public decimal Amount { get; set; }

    [StringLength(10, ErrorMessage = "Currency code cannot exceed 10 characters.")]
    public string? Currency { get; set; } = "INR";

    [Required(ErrorMessage = "Payment Method is required.")]
    [StringLength(32, ErrorMessage = "Payment Method cannot exceed 32 characters.")]
    public string Method { get; set; } = string.Empty;

    [StringLength(64, ErrorMessage = "CustomMethodName cannot exceed 64 characters.")]
    public string? CustomMethodName { get; set; }

    [StringLength(128, ErrorMessage = "Reference cannot exceed 128 characters.")]
    public string? Reference { get; set; }

    [StringLength(128, ErrorMessage = "BankName cannot exceed 128 characters.")]
    public string? BankName { get; set; }

    [StringLength(128, ErrorMessage = "AccountLabel cannot exceed 128 characters.")]
    public string? AccountLabel { get; set; }

    public DateTime? TransferDate { get; set; }

    [StringLength(256, ErrorMessage = "UpiPayerMetadata cannot exceed 256 characters.")]
    public string? UpiPayerMetadata { get; set; }

    [StringLength(64, ErrorMessage = "ChequeNumber cannot exceed 64 characters.")]
    public string? ChequeNumber { get; set; }

    public DateTime? ChequeDate { get; set; }

    [StringLength(32, ErrorMessage = "ClearingStatus cannot exceed 32 characters.")]
    public string? ClearingStatus { get; set; }

    [StringLength(64, ErrorMessage = "ProviderName cannot exceed 64 characters.")]
    public string? ProviderName { get; set; }

    [StringLength(128, ErrorMessage = "ProviderTransactionId cannot exceed 128 characters.")]
    public string? ProviderTransactionId { get; set; }

    [StringLength(32, ErrorMessage = "CallbackStatus cannot exceed 32 characters.")]
    public string? CallbackStatus { get; set; }

    public Dictionary<string, string>? MethodDetails { get; set; }

    [StringLength(1000, ErrorMessage = "Notes cannot exceed 1000 characters.")]
    public string? Notes { get; set; }

    [StringLength(128, ErrorMessage = "IdempotencyKey cannot exceed 128 characters.")]
    public string? IdempotencyKey { get; set; }

    public List<CreatePaymentAllocationRequest>? Allocations { get; set; }

    // Trap properties to detect and reject sensitive authentication/card/UPI secrets at validation time (never persisted)
    [JsonPropertyName("cardNumber")]
    public string? ForbiddenCardNumber { get; set; }

    [JsonIgnore]
    public string? CardNumber
    {
        get => ForbiddenCardNumber;
        set => ForbiddenCardNumber = value;
    }

    [JsonPropertyName("cvv")]
    public string? ForbiddenCvv { get; set; }

    [JsonIgnore]
    public string? Cvv
    {
        get => ForbiddenCvv;
        set => ForbiddenCvv = value;
    }

    [JsonPropertyName("pin")]
    public string? ForbiddenPin { get; set; }

    [JsonIgnore]
    public string? Pin
    {
        get => ForbiddenPin;
        set => ForbiddenPin = value;
    }

    [JsonPropertyName("upiPin")]
    public string? ForbiddenUpiPin { get; set; }

    [JsonIgnore]
    public string? UpiPin
    {
        get => ForbiddenUpiPin;
        set => ForbiddenUpiPin = value;
    }

    [JsonPropertyName("otp")]
    public string? ForbiddenOtp { get; set; }

    [JsonIgnore]
    public string? Otp
    {
        get => ForbiddenOtp;
        set => ForbiddenOtp = value;
    }

    [JsonPropertyName("gatewaySecret")]
    public string? ForbiddenGatewaySecret { get; set; }

    [JsonIgnore]
    public string? GatewaySecret
    {
        get => ForbiddenGatewaySecret;
        set => ForbiddenGatewaySecret = value;
    }
}

public class ReversePaymentRequest
{
    [Required(ErrorMessage = "Reversal reason is mandatory.")]
    [StringLength(500, MinimumLength = 3, ErrorMessage = "Reversal reason must be between 3 and 500 characters.")]
    public string Reason { get; set; } = string.Empty;

    [StringLength(128, ErrorMessage = "IdempotencyKey cannot exceed 128 characters.")]
    public string? IdempotencyKey { get; set; }
}

public class UpdatePaymentStatusRequest
{
    [Required(ErrorMessage = "Target status is required.")]
    [StringLength(32, ErrorMessage = "Status cannot exceed 32 characters.")]
    public string Status { get; set; } = string.Empty;

    [StringLength(32, ErrorMessage = "ClearingStatus cannot exceed 32 characters.")]
    public string? ClearingStatus { get; set; }

    [StringLength(32, ErrorMessage = "CallbackStatus cannot exceed 32 characters.")]
    public string? CallbackStatus { get; set; }

    [StringLength(64, ErrorMessage = "ProviderName cannot exceed 64 characters.")]
    public string? ProviderName { get; set; }

    [StringLength(128, ErrorMessage = "ProviderTransactionId cannot exceed 128 characters.")]
    public string? ProviderTransactionId { get; set; }

    [StringLength(500, ErrorMessage = "Reason cannot exceed 500 characters.")]
    public string? Reason { get; set; }

    [StringLength(1000, ErrorMessage = "Notes cannot exceed 1000 characters.")]
    public string? Notes { get; set; }
}

public class PaymentListFilterRequest
{
    public string? Search { get; set; }
    public string? Status { get; set; }
    public string? Method { get; set; }
    public int? CustomerId { get; set; }
    public int? InvoiceId { get; set; }
    public int? BranchId { get; set; }
    public DateTime? FromDate { get; set; }
    public DateTime? ToDate { get; set; }
    public string? SortBy { get; set; } = "paymentDate";
    public string? SortOrder { get; set; } = "desc";
    public int PageNumber { get; set; } = 1;
    public int PageSize { get; set; } = 10;

    [JsonIgnore]
    public int Page
    {
        get => PageNumber;
        set => PageNumber = value;
    }
}

public class PaymentAllocationDto
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public int PaymentId { get; set; }
    public int InvoiceId { get; set; }
    public string InvoiceNumber { get; set; } = string.Empty;
    public int CustomerId { get; set; }
    public string CustomerName { get; set; } = string.Empty;
    public DateTime? InvoiceDate { get; set; }
    public DateTime? InvoiceDueDate { get; set; }
    public decimal InvoiceTotal { get; set; }

    [JsonIgnore]
    public decimal InvoiceTotalAmount
    {
        get => InvoiceTotal;
        set => InvoiceTotal = value;
    }

    public decimal InvoicePaidAmount { get; set; }
    public decimal InvoiceBalanceAmount { get; set; }
    public string InvoiceStatus { get; set; } = string.Empty;
    public decimal AllocatedAmount { get; set; }
    public bool IsReversed { get; set; }
    public DateTime? ReversedAtUtc { get; set; }
    public string? ReversedBy { get; set; }
    public string? ReversalReason { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}

public class PaymentAuditEventDto
{
    public long Id { get; set; }
    public string Action { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;

    [JsonIgnore]
    public string PerformedBy
    {
        get => UserName;
        set => UserName = value;
    }

    public DateTime Timestamp { get; set; }

    [JsonIgnore]
    public DateTime TimestampUtc
    {
        get => Timestamp;
        set => Timestamp = value;
    }

    public string? Changes { get; set; }

    [JsonIgnore]
    public string? Details
    {
        get => Changes;
        set => Changes = value;
    }
}

public class PaymentListItemDto
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public int? BranchId { get; set; }
    public string PaymentNumber { get; set; } = string.Empty;
    public DateTime PaymentDate { get; set; }
    public int CustomerId { get; set; }
    public string CustomerName { get; set; } = string.Empty;
    public string CustomerCode { get; set; } = string.Empty;
    public string? CustomerEmail { get; set; }
    public int InvoiceId { get; set; }

    [JsonIgnore]
    public int? PrimaryInvoiceId
    {
        get => InvoiceId > 0 ? InvoiceId : null;
        set => InvoiceId = value ?? 0;
    }

    public string InvoiceNumber { get; set; } = string.Empty;

    [JsonIgnore]
    public string? PrimaryInvoiceNumber
    {
        get => InvoiceNumber;
        set => InvoiceNumber = value ?? string.Empty;
    }

    public List<string> InvoiceNumbers { get; set; } = new();
    public string Method { get; set; } = string.Empty;
    public string MethodDisplay { get; set; } = string.Empty;
    public string? CustomMethodName { get; set; }
    public string? Reference { get; set; }
    public decimal Amount { get; set; }
    public decimal AllocatedAmount { get; set; }
    public string Currency { get; set; } = "INR";
    public string Status { get; set; } = string.Empty;
    public string? ClearingStatus { get; set; }
    public bool IsReversible { get; set; }
    public DateTime? ReversedAtUtc { get; set; }
    public string? ReversedBy { get; set; }
    public string? ReversalReason { get; set; }
    public string CreatedBy { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; }
    public List<PaymentAllocationDto> Allocations { get; set; } = new();
}

public class PaymentDetailDto : PaymentListItemDto
{
    public string? BranchName { get; set; }
    public string? CustomerPhone { get; set; }
    public string? BankName { get; set; }
    public string? AccountLabel { get; set; }
    public DateTime? TransferDate { get; set; }
    public string? UpiPayerMetadata { get; set; }
    public string? ChequeNumber { get; set; }
    public DateTime? ChequeDate { get; set; }
    public string? ProviderName { get; set; }
    public string? ProviderTransactionId { get; set; }
    public string? CallbackStatus { get; set; }
    public Dictionary<string, string>? MethodDetails { get; set; }
    public string? Notes { get; set; }
    public string? IdempotencyKey { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
    public string? RowVersion { get; set; }
    public List<PaymentAuditEventDto> AuditHistory { get; set; } = new();
}

public class EligibleInvoiceBalanceDto
{
    public int InvoiceId { get; set; }
    public int TenantId { get; set; }
    public string InvoiceNumber { get; set; } = string.Empty;
    public int CustomerId { get; set; }
    public string CustomerName { get; set; } = string.Empty;
    public string CustomerCode { get; set; } = string.Empty;
    public string? CustomerEmail { get; set; }
    public string Currency { get; set; } = "INR";
    public DateTime InvoiceDate { get; set; }
    public DateTime? DueDate { get; set; }
    public decimal InvoiceTotal { get; set; }

    [JsonIgnore]
    public decimal TotalAmount
    {
        get => InvoiceTotal;
        set => InvoiceTotal = value;
    }

    public decimal PreviouslyPaid { get; set; }

    [JsonIgnore]
    public decimal PaidAmount
    {
        get => PreviouslyPaid;
        set => PreviouslyPaid = value;
    }

    public decimal CurrentOutstanding { get; set; }

    [JsonIgnore]
    public decimal BalanceAmount
    {
        get => CurrentOutstanding;
        set => CurrentOutstanding = value;
    }

    public string Status { get; set; } = string.Empty;
    public bool IsEligibleForPayment { get; set; }
    public string? IneligibilityReason { get; set; }
    public string? RowVersion { get; set; }
}
