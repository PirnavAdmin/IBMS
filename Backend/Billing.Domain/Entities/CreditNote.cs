namespace Billing.Domain.Entities;

public class CreditNote
{
    public int Id { get; set; }

    public int TenantId { get; set; } = 1;
    public Tenant? Tenant { get; set; }

    public string CreditNoteNumber { get; set; } = string.Empty;

    public int InvoiceId { get; set; }
    public Invoice? Invoice { get; set; }

    public int CustomerId { get; set; }
    public Customer? Customer { get; set; }

    public DateTime CreditDate { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Type of credit: "Full" or "Partial"
    /// </summary>
    public string Type { get; set; } = "Full";

    public decimal Subtotal { get; set; }

    public decimal TaxAmount { get; set; }

    public decimal TotalAmount { get; set; }

    public decimal RefundedAmount { get; set; }

    public decimal RemainingRefundableAmount { get; set; }

    /// <summary>
    /// Lifecycle Status: Draft, PendingApproval, Approved, Issued, PartiallyRefunded, Refunded, Cancelled, Rejected
    /// </summary>
    public string Status { get; set; } = "Draft";

    public string Reason { get; set; } = string.Empty;

    public string? Notes { get; set; }

    public string CreatedBy { get; set; } = "System";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

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

    public DateTime? UpdatedAtUtc { get; set; }

    public DateTime RowVersion { get; set; } = DateTime.UtcNow;

    public ICollection<CreditNoteItem> Items { get; set; } = new List<CreditNoteItem>();

    public ICollection<CreditNoteRefund> Refunds { get; set; } = new List<CreditNoteRefund>();

    public bool CanEdit() => string.Equals(Status, "Draft", StringComparison.OrdinalIgnoreCase);

    public bool CanSubmit() => string.Equals(Status, "Draft", StringComparison.OrdinalIgnoreCase);

    public bool CanApproveOrReject() => string.Equals(Status, "PendingApproval", StringComparison.OrdinalIgnoreCase);

    public bool CanIssue() => string.Equals(Status, "Approved", StringComparison.OrdinalIgnoreCase);

    public bool CanCancel() => string.Equals(Status, "Draft", StringComparison.OrdinalIgnoreCase) ||
                               string.Equals(Status, "PendingApproval", StringComparison.OrdinalIgnoreCase) ||
                               string.Equals(Status, "Approved", StringComparison.OrdinalIgnoreCase);

    public bool CanRefund() => string.Equals(Status, "Issued", StringComparison.OrdinalIgnoreCase) ||
                               string.Equals(Status, "PartiallyRefunded", StringComparison.OrdinalIgnoreCase);

    public void RecalculateRefundableBalance()
    {
        var total = Math.Max(0m, Math.Round(TotalAmount, 2, MidpointRounding.AwayFromZero));
        var refunded = Math.Max(0m, Math.Round(RefundedAmount, 2, MidpointRounding.AwayFromZero));
        RemainingRefundableAmount = Math.Max(0m, Math.Round(total - refunded, 2, MidpointRounding.AwayFromZero));

        if (string.Equals(Status, "Issued", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(Status, "PartiallyRefunded", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(Status, "Refunded", StringComparison.OrdinalIgnoreCase))
        {
            if (RemainingRefundableAmount == 0m && total > 0m)
            {
                Status = "Refunded";
            }
            else if (refunded > 0m && RemainingRefundableAmount > 0m)
            {
                Status = "PartiallyRefunded";
            }
            else
            {
                Status = "Issued";
            }
        }

        UpdatedAtUtc = DateTime.UtcNow;
        RowVersion = DateTime.UtcNow;
    }
}
