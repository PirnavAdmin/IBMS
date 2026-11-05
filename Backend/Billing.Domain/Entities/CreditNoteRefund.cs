using System.ComponentModel.DataAnnotations.Schema;

namespace Billing.Domain.Entities;

public class CreditNoteRefund
{
    public int Id { get; set; }

    public int TenantId { get; set; } = 1;

    public int CreditNoteId { get; set; }
    public CreditNote? CreditNote { get; set; }

    public string RefundNumber { get; set; } = string.Empty;

    public DateTime RefundDate { get; set; } = DateTime.UtcNow;

    public decimal RefundAmount { get; set; }

    public string PaymentMethod { get; set; } = "Bank Transfer";

    public string? ReferenceNumber { get; set; }

    public string? Notes { get; set; }

    public string ProcessedBy { get; set; } = "System";

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    [NotMapped]
    public string Status { get; set; } = RefundStatuses.Completed;

    [NotMapped]
    public string? FailureReason { get; set; }

    public static class RefundStatuses
    {
        public const string Pending = "Pending";
        public const string Completed = "Completed";
        public const string Failed = "Failed";
        public const string ManualVerification = "ManualVerification";
    }
}
