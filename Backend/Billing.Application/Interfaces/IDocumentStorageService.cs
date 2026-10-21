namespace Billing.Application.Interfaces;

/// <summary>
/// Pluggable storage abstraction for physical invoice PDF documents and uploaded brand assets.
/// Decouples business workflows from the underlying physical storage mechanism (Local, Azure Blob, S3).
/// </summary>
public interface IDocumentStorageService
{
    /// <summary>
    /// Persists document bytes to the underlying storage provider and returns a unique relative storage path/identifier.
    /// </summary>
    Task<string> SaveDocumentAsync(byte[] content, string fileName, string contentType, int tenantId, CancellationToken ct = default);

    /// <summary>
    /// Retrieves raw document bytes from storage by relative storage path.
    /// </summary>
    Task<byte[]> GetDocumentAsync(string storagePath, int tenantId, CancellationToken ct = default);

    /// <summary>
    /// Checks whether a document exists at the specified relative storage path.
    /// </summary>
    Task<bool> ExistsAsync(string storagePath, int tenantId, CancellationToken ct = default);

    /// <summary>
    /// Removes a document from storage if retention rules permit.
    /// </summary>
    Task DeleteDocumentAsync(string storagePath, int tenantId, CancellationToken ct = default);
}
