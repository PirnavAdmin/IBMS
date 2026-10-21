namespace Billing.Contracts;

public class InvoiceFilterRequest
{
    public string? SearchTerm { get; set; }
    public int? CustomerId { get; set; }
    public string? Status { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    
    // P1 Advanced Filters
    public string? Currency { get; set; }
    public string? PaymentState { get; set; } // Paid, Partially Paid, Unpaid, Outstanding, Overdue
    public decimal? MinOutstandingAmount { get; set; }
    public decimal? MaxOutstandingAmount { get; set; }
    public decimal? MinTotalAmount { get; set; }
    public decimal? MaxTotalAmount { get; set; }
    
    // P1 Sorting
    public string? SortBy { get; set; } // e.g. "InvoiceDate", "InvoiceNumber", "TotalAmount", "BalanceAmount"
    public string? SortOrder { get; set; } // "asc" or "desc"

    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;
}
