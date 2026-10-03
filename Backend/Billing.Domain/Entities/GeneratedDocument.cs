using Billing.Domain.Enums;

namespace Billing.Domain.Entities;

/// <summary>
/// Audit and tracking record for physical PDF files produced by the server-side generation engine.
/// </summary>
public class GeneratedDocument
{
    public int Id { get; set; }

    public int TenantId { get; set; } = 1;

    public int? InvoiceId { get; set; }

    public int? InvoiceSnapshotId { get; set; }

    public string DocumentType { get; set; } = "Invoice";

    public DocumentStorageProvider StorageProvider { get; set; } = DocumentStorageProvider.Local;

    public string StoragePath { get; set; } = string.Empty;

    public string FileName { get; set; } = string.Empty;

    public long FileSizeBytes { get; set; }

    public string ContentType { get; set; } = "application/pdf";

    public string? ChecksumSha256 { get; set; }

    public string Status { get; set; } = "Generated";

    public string? ErrorMessage { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
