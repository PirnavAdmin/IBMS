namespace Billing.Application.Interfaces;

/// <summary>
/// Encrypts and decrypts sensitive integration credentials, webhook secrets, and tokens at rest
/// using versioned key identifiers to support zero-downtime key rotation across API and Worker hosts.
/// </summary>
public interface ISecretEncryptionService
{
    string ActiveKeyId { get; }

    string? Protect(string? plainText);

    string? Unprotect(string? storedValue);

    bool NeedsReencryption(string? storedValue);

    bool IsEncrypted(string? storedValue);
}
