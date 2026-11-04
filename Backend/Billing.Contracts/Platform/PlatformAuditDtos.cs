namespace Billing.Contracts.Platform;

public class PlatformAuditLogDto
{
    public long Id { get; set; }
    public DateTime Timestamp { get; set; }
    public string? ActorUserId { get; set; }
    public string ActorUserName { get; set; } = string.Empty;
    public string? ActorRole { get; set; }
    public string Action { get; set; } = string.Empty;
    public string EntityType { get; set; } = string.Empty;
    public string EntityId { get; set; } = string.Empty;
    public int TenantId { get; set; }
    public string? TenantCode { get; set; }
    public string? TenantName { get; set; }
    public string ResultStatus { get; set; } = "Success";
    public string? CorrelationId { get; set; }
    public string? Changes { get; set; }
    public string? OldValues { get; set; }
    public string? NewValues { get; set; }
}

public class PlatformAuditFilterRequest
{
    public int? TenantId { get; set; }
    public string? Actor { get; set; }
    public string? Action { get; set; }
    public string? EntityName { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public int PageNumber { get; set; } = 1;
    public int PageSize { get; set; } = 20;
}
