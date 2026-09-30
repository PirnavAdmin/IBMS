using Billing.Domain.Enums;

namespace Billing.Domain.Entities;

public class Payment
{
    public int Id { get; set; }

    public int TenantId { get; set; } = 1;
    public Tenant? Tenant { get; set; }

    public int? BranchId { get; set; }

    public string PaymentNumber { get; set; } = string.Empty;

    public int CustomerId { get; set; }
    public Customer? Customer { get; set; }

    public DateTime PaymentDate { get; set; } = DateTime.UtcNow;

    public decimal Amount { get; set; }

    public decimal AllocatedAmount { get; set; }

    public string Currency { get; set; } = "INR";

    public PaymentMethod Method { get; set; } = PaymentMethod.Cash;

    public string? CustomMethodName { get; set; }

    public string? Reference { get; set; }

    public string? BankName { get; set; }

    public string? AccountLabel { get; set; }

    public DateTime? TransferDate { get; set; }

    public string? UpiPayerMetadata { get; set; }

    public string? ChequeNumber { get; set; }

    public DateTime? ChequeDate { get; set; }

    public string? ClearingStatus { get; set; }

    public string? ProviderName { get; set; }

    public string? ProviderTransactionId { get; set; }

    public string? CallbackStatus { get; set; }

    public string? MethodDetailsJson { get; set; }

    public PaymentStatus Status { get; set; } = PaymentStatus.Completed;

    public string? Notes { get; set; }

    public string IdempotencyKey { get; set; } = string.Empty;

    public string? RequestPayloadHash { get; set; }

    public string CreatedBy { get; set; } = "system";

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAtUtc { get; set; }

    public DateTime? ReversedAtUtc { get; set; }

    public string? ReversedBy { get; set; }

    public string? ReversalReason { get; set; }

    public DateTime RowVersion { get; set; } = DateTime.UtcNow;

    public ICollection<InvoicePaymentAllocation> Allocations { get; set; } = new List<InvoicePaymentAllocation>();

    public bool IsReversible =>
        Status == PaymentStatus.Completed &&
        !ReversedAtUtc.HasValue &&
        AllocatedAmount > 0m;
}
