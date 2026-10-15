namespace Billing.Contracts.Export;

public class ExportJobDto
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public string JobType { get; set; } = string.Empty;
    public string ExportFormat { get; set; } = "CSV";
    public string Status { get; set; } = "Pending";
    public string? FilterParametersJson { get; set; }
    public string? StoragePath { get; set; }
    public string? FileName { get; set; }
    public long? FileSizeBytes { get; set; }
    public string ContentType { get; set; } = "text/csv";
    public int TotalRecords { get; set; }
    public int ProcessedRecords { get; set; }
    public string? ErrorMessage { get; set; }
    public string RequestedBy { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? StartedAtUtc { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
    public string? DownloadUrl { get; set; }
}

public class CreateExportJobRequest
{
    public string JobType { get; set; } = "Invoice"; // Invoice, Payment, Customer, AuditLog
    public string ExportFormat { get; set; } = "CSV"; // CSV, JSON
    public string? FilterParametersJson { get; set; }
}

public class ExportJobFilterRequest
{
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;
    public string? JobType { get; set; }
    public string? Status { get; set; }
}
