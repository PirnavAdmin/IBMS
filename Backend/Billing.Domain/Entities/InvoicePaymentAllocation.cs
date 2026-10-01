namespace Billing.Domain.Entities;

public class InvoicePaymentAllocation
{
    public int Id { get; set; }

    public int TenantId { get; set; } = 1;
    public Tenant? Tenant { get; set; }

    public int PaymentId { get; set; }
    public Payment? Payment { get; set; }

    public int InvoiceId { get; set; }
    public Invoice? Invoice { get; set; }

    public decimal AllocatedAmount { get; set; }

    public bool IsReversed { get; set; }

    public DateTime? ReversedAtUtc { get; set; }

    public string? ReversedBy { get; set; }

    public string? ReversalReason { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
