using System.Security.Cryptography;
using Billing.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Billing.Infrastructure.Services;

/// <summary>
/// Local disk implementation of IDocumentStorageService.
/// Suitable for development, on-premise environments, and containerized local storage mounts.
/// </summary>
public class LocalStorageService : IDocumentStorageService
{
    private readonly string _baseStoragePath;
    private readonly ILogger<LocalStorageService> _logger;

    public LocalStorageService(IConfiguration configuration, ILogger<LocalStorageService> logger)
    {
        _logger = logger;
        var configPath = configuration["DocumentStorage:LocalStoragePath"];
        _baseStoragePath = string.IsNullOrWhiteSpace(configPath)
            ? Path.Combine(AppContext.BaseDirectory, "App_Data", "DocumentStorage")
            : configPath;

        if (!Directory.Exists(_baseStoragePath))
        {
            Directory.CreateDirectory(_baseStoragePath);
        }
    }

    public async Task<string> SaveDocumentAsync(byte[] content, string fileName, string contentType, int tenantId, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(content);
        if (string.IsNullOrWhiteSpace(fileName))
        {
            throw new ArgumentException("File name must be specified.", nameof(fileName));
        }

        var tenantFolder = Path.Combine(_baseStoragePath, $"tenant_{tenantId}");
        if (!Directory.Exists(tenantFolder))
        {
            Directory.CreateDirectory(tenantFolder);
        }

        var uniquePrefix = Guid.NewGuid().ToString("N")[..8];
        var sanitizedFileName = Path.GetFileName(fileName);
        var finalFileName = $"{uniquePrefix}_{sanitizedFileName}";
        var fullPath = Path.Combine(tenantFolder, finalFileName);

        await File.WriteAllBytesAsync(fullPath, content, ct);

        // Calculate Checksum for validation
        using var sha = SHA256.Create();
        var hash = Convert.ToHexString(sha.ComputeHash(content));

        _logger.LogInformation("Stored document {FileName} ({SizeBytes} bytes, SHA256: {Hash}) for tenant {TenantId} at {Path}",
            finalFileName, content.Length, hash, tenantId, fullPath);

        // Return relative path: tenant_{tenantId}/{finalFileName}
        return Path.Combine($"tenant_{tenantId}", finalFileName).Replace('\\', '/');
    }

    public async Task<byte[]> GetDocumentAsync(string storagePath, int tenantId, CancellationToken ct = default)
    {
        var fullPath = ResolveFullPath(storagePath, tenantId);
        if (!File.Exists(fullPath))
        {
            throw new FileNotFoundException($"Document was not found at storage path: {storagePath}");
        }

        return await File.ReadAllBytesAsync(fullPath, ct);
    }

    public Task<bool> ExistsAsync(string storagePath, int tenantId, CancellationToken ct = default)
    {
        var fullPath = ResolveFullPath(storagePath, tenantId);
        return Task.FromResult(File.Exists(fullPath));
    }

    public Task DeleteDocumentAsync(string storagePath, int tenantId, CancellationToken ct = default)
    {
        var fullPath = ResolveFullPath(storagePath, tenantId);
        if (File.Exists(fullPath))
        {
            File.Delete(fullPath);
            _logger.LogInformation("Deleted document from storage path {Path} for tenant {TenantId}", fullPath, tenantId);
        }

        return Task.CompletedTask;
    }

    private string ResolveFullPath(string relativePath, int tenantId)
    {
        var normalized = relativePath.Replace('/', Path.DirectorySeparatorChar).TrimStart(Path.DirectorySeparatorChar);
        var fullPath = Path.GetFullPath(Path.Combine(_baseStoragePath, normalized));

        // Security check: Path traversal prevention
        if (!fullPath.StartsWith(Path.GetFullPath(_baseStoragePath), StringComparison.OrdinalIgnoreCase))
        {
            throw new UnauthorizedAccessException("Illegal path traversal detected in document storage request.");
        }

        return fullPath;
    }
}
