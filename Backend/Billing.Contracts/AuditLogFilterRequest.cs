namespace Billing.Contracts;

public class AuditLogFilterRequest
{
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;
    
    public string? EntityName { get; set; }
    public string? UserName { get; set; }
    public string? Action { get; set; }
    
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
}
