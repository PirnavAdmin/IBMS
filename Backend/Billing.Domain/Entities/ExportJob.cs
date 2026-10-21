namespace Billing.Domain.Entities;

public class ExportJob
{
    public int Id { get; set; }

    public int TenantId { get; set; } = 1;
    public Tenant? Tenant { get; set; }

    public string JobType { get; set; } = "Invoice"; // Invoice, Payment, Customer, AuditLog

    public string ExportFormat { get; set; } = "CSV"; // CSV, JSON

    public string Status { get; set; } = "Pending"; // Pending, Processing, Completed, Failed

    public string? FilterParametersJson { get; set; }

    public string? StoragePath { get; set; }

    public string? FileName { get; set; }

    public long? FileSizeBytes { get; set; }

    public string ContentType { get; set; } = "text/csv";

    public int TotalRecords { get; set; } = 0;

    public int ProcessedRecords { get; set; } = 0;

    public string? ErrorMessage { get; set; }

    public string RequestedBy { get; set; } = "System";

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? StartedAtUtc { get; set; }

    public DateTime? CompletedAtUtc { get; set; }
}
