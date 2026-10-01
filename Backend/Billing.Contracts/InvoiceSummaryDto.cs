namespace Billing.Contracts;

public class InvoiceSummaryDto
{
    public decimal TotalInvoiced { get; set; }
    public decimal TotalPaid { get; set; }
    public decimal TotalOutstanding { get; set; }
    public int OverdueCount { get; set; }
}
