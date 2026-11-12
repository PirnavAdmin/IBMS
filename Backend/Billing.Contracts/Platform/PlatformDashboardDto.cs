namespace Billing.Contracts.Platform;

public class PlatformDashboardDto
{
    public int TotalTenants { get; set; }
    public int ActiveTenants { get; set; }
    public int SuspendedTenants { get; set; }
    public int InactiveTenants { get; set; }
    public int TotalPlatformUsers { get; set; }
    public int ActivePlatformUsers { get; set; }
    public int PendingUserApprovals { get; set; }
    public List<PlatformTenantSummaryDto> RecentTenants { get; set; } = new();
    public List<PlatformAuditEventSummaryDto> RecentAdminEvents { get; set; } = new();
    public Dictionary<string, string> TenantStatusDefinitions { get; set; } = new();
}

public class PlatformAuditEventSummaryDto
{
    public long Id { get; set; }
    public DateTime Timestamp { get; set; }
    public string Actor { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string EntityName { get; set; } = string.Empty;
    public string EntityId { get; set; } = string.Empty;
    public int TenantId { get; set; }
    public string? TenantCode { get; set; }
    public string Status { get; set; } = "Success";
    public string? Changes { get; set; }
}
