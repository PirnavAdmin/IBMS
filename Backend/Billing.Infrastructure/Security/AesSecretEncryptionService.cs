using System.Security.Cryptography;
using System.Text;
using Billing.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace Billing.Infrastructure.Security;

/// <summary>
/// Shared AES-256-GCM secret protection across API and Worker hosts.
/// Format: enc:v2:&lt;keyId&gt;:&lt;base64(12-byte nonce + 16-byte tag + ciphertext)&gt;.
/// Also decrypts legacy enc:v1:&lt;base64&gt; values produced prior to versioned key rotation.
/// </summary>
public sealed class AesSecretEncryptionService : ISecretEncryptionService
{
    private const string V2Prefix = "enc:v2:";
    private const string V1Prefix = "enc:v1:";
    private const string DevFallbackSeed = "IBMS-Default-Gateway-Key-Dev-Only";

    private readonly string _activeKeyId;
    private readonly Dictionary<string, byte[]> _keys = new(StringComparer.Ordinal);
    private readonly byte[] _legacyV1Key;

    public string ActiveKeyId => _activeKeyId;

    public AesSecretEncryptionService(IConfiguration? configuration = null)
    {
        var section = configuration?.GetSection("Security:SecretEncryption");
        _activeKeyId = string.IsNullOrWhiteSpace(section?["ActiveKeyId"])
            ? "k1"
            : section!["ActiveKeyId"]!.Trim();

        var configuredKeys = section?.GetSection("Keys");
        if (configuredKeys != null)
        {
            foreach (var child in configuredKeys.GetChildren())
            {
                if (!string.IsNullOrWhiteSpace(child.Value))
                {
                    _keys[child.Key.Trim()] = DeriveKeyBytes(child.Key.Trim(), child.Value.Trim());
                }
            }
        }

        // Legacy fallback seed used in PaymentGatewaySettings / single-host dev environments
        var legacySeed = configuration?["PaymentGateway:EncryptionKey"]
            ?? configuration?["JwtSettings:SecretKey"]
            ?? configuration?["Jwt:Key"]
            ?? DevFallbackSeed;

        _legacyV1Key = SHA256.HashData(Encoding.UTF8.GetBytes($"IBMS.PaymentGatewaySecret.v1:{legacySeed}"));

        if (!_keys.ContainsKey(_activeKeyId))
        {
            _keys[_activeKeyId] = DeriveKeyBytes(_activeKeyId, legacySeed);
        }
    }

    /// <summary>
    /// Ensures Production hosts explicitly configure a shared Security:SecretEncryption key
    /// so API and Worker processes never silently diverge onto different fallback keys.
    /// </summary>
    public static void ValidateHostConfiguration(IConfiguration configuration, IHostEnvironment environment)
    {
        var activeId = configuration["Security:SecretEncryption:ActiveKeyId"];
        var activeSecret = !string.IsNullOrWhiteSpace(activeId)
            ? configuration[$"Security:SecretEncryption:Keys:{activeId.Trim()}"]
            : null;

        if (environment.IsProduction() && (string.IsNullOrWhiteSpace(activeId) || string.IsNullOrWhiteSpace(activeSecret) || activeSecret.Trim().Length < 16))
        {
            throw new InvalidOperationException(
                "Production hosts require Security:SecretEncryption:ActiveKeyId and Security:SecretEncryption:Keys:<ActiveKeyId> (minimum 16 characters) to be identically configured on API and Worker.");
        }
    }

    public bool IsEncrypted(string? storedValue)
    {
        return !string.IsNullOrWhiteSpace(storedValue) &&
               (storedValue.StartsWith(V2Prefix, StringComparison.Ordinal) ||
                storedValue.StartsWith(V1Prefix, StringComparison.Ordinal));
    }

    public bool NeedsReencryption(string? storedValue)
    {
        if (string.IsNullOrWhiteSpace(storedValue)) return false;
        if (!storedValue.StartsWith(V2Prefix, StringComparison.Ordinal)) return true;

        var remainder = storedValue.Substring(V2Prefix.Length);
        var sepIdx = remainder.IndexOf(':');
        if (sepIdx <= 0) return true;

        var keyId = remainder[..sepIdx];
        return !string.Equals(keyId, _activeKeyId, StringComparison.Ordinal);
    }

    public string? Protect(string? plainText)
    {
        if (string.IsNullOrWhiteSpace(plainText)) return null;

        // Avoid double-encrypting already protected values under the active key
        if (!NeedsReencryption(plainText) && plainText.StartsWith(V2Prefix, StringComparison.Ordinal))
        {
            return plainText;
        }

        var rawPlain = Unprotect(plainText) ?? plainText;
        var plainBytes = Encoding.UTF8.GetBytes(rawPlain);
        var nonce = RandomNumberGenerator.GetBytes(12);
        var tag = new byte[16];
        var cipher = new byte[plainBytes.Length];

        using var aes = new AesGcm(_keys[_activeKeyId], 16);
        aes.Encrypt(nonce, plainBytes, cipher, tag);

        var combined = new byte[nonce.Length + tag.Length + cipher.Length];
        Buffer.BlockCopy(nonce, 0, combined, 0, nonce.Length);
        Buffer.BlockCopy(tag, 0, combined, nonce.Length, tag.Length);
        Buffer.BlockCopy(cipher, 0, combined, nonce.Length + tag.Length, cipher.Length);

        return $"{V2Prefix}{_activeKeyId}:{Convert.ToBase64String(combined)}";
    }

    public string? Unprotect(string? storedValue)
    {
        if (string.IsNullOrWhiteSpace(storedValue)) return null;

        if (storedValue.StartsWith(V2Prefix, StringComparison.Ordinal))
        {
            var remainder = storedValue.Substring(V2Prefix.Length);
            var sepIdx = remainder.IndexOf(':');
            if (sepIdx <= 0 || sepIdx >= remainder.Length - 1) return null;

            var keyId = remainder[..sepIdx];
            var payloadBase64 = remainder[(sepIdx + 1)..];
            if (!_keys.TryGetValue(keyId, out var keyBytes)) return null;

            return DecryptAesGcm(payloadBase64, keyBytes);
        }

        if (storedValue.StartsWith(V1Prefix, StringComparison.Ordinal))
        {
            var payloadBase64 = storedValue.Substring(V1Prefix.Length);
            return DecryptAesGcm(payloadBase64, _legacyV1Key);
        }

        // Plaintext legacy value (pre-encryption migration)
        return storedValue;
    }

    private static string? DecryptAesGcm(string base64Payload, byte[] keyBytes)
    {
        try
        {
            var combined = Convert.FromBase64String(base64Payload);
            if (combined.Length < 29) return null;

            var nonce = combined[..12];
            var tag = combined[12..28];
            var cipher = combined[28..];
            var plain = new byte[cipher.Length];

            using var aes = new AesGcm(keyBytes, 16);
            aes.Decrypt(nonce, cipher, tag, plain);
            return Encoding.UTF8.GetString(plain);
        }
        catch
        {
            return null;
        }
    }

    private static byte[] DeriveKeyBytes(string keyId, string rawSecret)
    {
        return SHA256.HashData(Encoding.UTF8.GetBytes($"IBMS.SecretEncryption.v2:{keyId}:{rawSecret}"));
    }
}
