namespace Billing.Domain.Entities;

public class Invoice
{
    public int Id { get; set; }

    public int TenantId { get; set; } = 1;
    public Tenant? Tenant { get; set; }

    public string InvoiceNumber { get; set; } = string.Empty;

    public int CustomerId { get; set; }
    public Customer? Customer { get; set; }

    public DateTime InvoiceDate { get; set; } = DateTime.UtcNow;

    public DateTime? DueDate { get; set; }

    public string? Reference { get; set; }

    public string Status { get; set; } = "Draft";

    public decimal Subtotal { get; set; }

    public decimal DiscountAmount { get; set; }

    public decimal TaxAmount { get; set; }

    public decimal ChargesAmount { get; set; }

    public decimal TotalAmount { get; set; }

    public decimal PaidAmount { get; set; }

    public decimal BalanceAmount { get; set; }

    public string? Notes { get; set; }

    public string? TermsAndConditions { get; set; }

    public int? QuotationId { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAtUtc { get; set; }

    public DateTime RowVersion { get; set; } = DateTime.UtcNow;

    public ICollection<InvoiceItem> Items { get; set; } = new List<InvoiceItem>();

    public ICollection<InvoicePaymentAllocation> PaymentAllocations { get; set; } = new List<InvoicePaymentAllocation>();

    public string GetCurrency()
    {
        return !string.IsNullOrWhiteSpace(Customer?.Currency)
            ? Customer!.Currency.Trim().ToUpperInvariant()
            : "INR";
    }

    public decimal GetEffectiveBalance()
    {
        var effectivePaid = Math.Max(0m, Math.Round(PaidAmount, 2, MidpointRounding.AwayFromZero));
        var total = Math.Max(0m, Math.Round(TotalAmount, 2, MidpointRounding.AwayFromZero));
        var calculatedBalance = Math.Max(0m, Math.Round(total - effectivePaid, 2, MidpointRounding.AwayFromZero));
        return calculatedBalance;
    }

    public bool IsEligibleForPayment(out string? reason)
    {
        var normStatus = (Status ?? string.Empty).Trim();

        if (string.Equals(normStatus, "Draft", StringComparison.OrdinalIgnoreCase))
        {
            reason = $"Invoice '{InvoiceNumber}' is in Draft status and must be issued before recording payments.";
            return false;
        }

        if (string.Equals(normStatus, "Cancelled", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(normStatus, "Canceled", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(normStatus, "Void", StringComparison.OrdinalIgnoreCase))
        {
            reason = $"Invoice '{InvoiceNumber}' is {normStatus} and cannot accept payments.";
            return false;
        }

        if (string.Equals(normStatus, "Paid", StringComparison.OrdinalIgnoreCase))
        {
            reason = $"Invoice '{InvoiceNumber}' is already fully Paid.";
            return false;
        }

        if (TotalAmount <= 0m)
        {
            reason = $"Invoice '{InvoiceNumber}' has a non-positive total amount ({TotalAmount:F2}) and is not eligible for payment.";
            return false;
        }

        if (GetEffectiveBalance() <= 0m)
        {
            reason = $"Invoice '{InvoiceNumber}' has zero remaining outstanding balance.";
            return false;
        }

        reason = null;
        return true;
    }

    /// <summary>
    /// Authoritative invoice balance and status calculation shared across Invoice Management (Module 9) and Payment Management (Module 11).
    /// Formula: BalanceAmount = Invoice TotalAmount - Effective Allocated PaidAmount.
    /// </summary>
    public void RecalculateBalanceAndStatus(decimal? effectivePaidTotal = null)
    {
        var total = Math.Max(0m, Math.Round(TotalAmount, 2, MidpointRounding.AwayFromZero));
        var paid = effectivePaidTotal.HasValue
            ? Math.Max(0m, Math.Round(effectivePaidTotal.Value, 2, MidpointRounding.AwayFromZero))
            : Math.Max(0m, Math.Round(PaidAmount, 2, MidpointRounding.AwayFromZero));

        PaidAmount = paid;
        BalanceAmount = Math.Max(0m, Math.Round(total - paid, 2, MidpointRounding.AwayFromZero));

        var normStatus = (Status ?? string.Empty).Trim();
        if (string.Equals(normStatus, "Cancelled", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(normStatus, "Canceled", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(normStatus, "Void", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        if (total > 0m && BalanceAmount == 0m)
        {
            Status = "Paid";
        }
        else if (PaidAmount > 0m && BalanceAmount > 0m)
        {
            Status = "Partially Paid";
        }
        else
        {
            if (DueDate.HasValue && DueDate.Value.Date < DateTime.UtcNow.Date)
            {
                Status = "Overdue";
            }
            else if (!string.Equals(normStatus, "Draft", StringComparison.OrdinalIgnoreCase))
            {
                Status = "Issued";
            }
        }

        UpdatedAtUtc = DateTime.UtcNow;
        RowVersion = DateTime.UtcNow;
    }
}
