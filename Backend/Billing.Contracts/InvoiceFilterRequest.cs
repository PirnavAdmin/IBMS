namespace Billing.Contracts;

public class InvoiceFilterRequest
{
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;
    
    public string? SearchTerm { get; set; }
    public int? CustomerId { get; set; }
    public string? Status { get; set; }
    
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
}
