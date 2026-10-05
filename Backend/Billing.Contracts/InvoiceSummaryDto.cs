namespace Billing.Contracts;

public class InvoiceSummaryDto
{
    public string Currency { get; set; } = "INR";
    public decimal TotalInvoiced { get; set; }
    public decimal TotalPaid { get; set; }
    public decimal TotalOutstanding { get; set; }
    public decimal OverdueAmount { get; set; }
    public int OverdueCount { get; set; }
    public int DraftCount { get; set; }
    public decimal DraftAmount { get; set; }
}
