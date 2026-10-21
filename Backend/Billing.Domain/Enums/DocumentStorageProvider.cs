namespace Billing.Domain.Enums;

/// <summary>
/// Storage providers supported by the document storage abstraction layer.
/// </summary>
public enum DocumentStorageProvider
{
    Local = 1,
    AzureBlob = 2,
    S3 = 3
}
