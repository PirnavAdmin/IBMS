using System.Security.Cryptography;
using System.Text;
using Billing.Application.Interfaces;

namespace Billing.Infrastructure.Services;

public class WebhookSecurityService : IWebhookSecurityService
{
    public string GenerateSecretKey()
    {
        var bytes = new byte[32];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(bytes);
        return "whsec_" + Convert.ToHexString(bytes).ToLowerInvariant();
    }

    public string GenerateClientId()
    {
        var bytes = new byte[16];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(bytes);
        return "app_" + Convert.ToHexString(bytes).ToLowerInvariant();
    }

    public string GenerateClientSecret()
    {
        var bytes = new byte[32];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(bytes);
        return "whapp_sec_" + Convert.ToHexString(bytes).ToLowerInvariant();
    }

    public string ComputeHmacSha256(string secretKey, string payload, long timestamp)
    {
        var message = $"{timestamp}.{payload}";
        var keyBytes = Encoding.UTF8.GetBytes(secretKey);
        var messageBytes = Encoding.UTF8.GetBytes(message);

        using var hmac = new HMACSHA256(keyBytes);
        var hashBytes = hmac.ComputeHash(messageBytes);
        return Convert.ToHexString(hashBytes).ToLowerInvariant();
    }

    public bool VerifySignature(string secretKey, string payload, long timestamp, string signature)
    {
        if (string.IsNullOrWhiteSpace(secretKey) || string.IsNullOrWhiteSpace(signature))
            return false;

        var expectedSignature = ComputeHmacSha256(secretKey, payload, timestamp);
        var expectedBytes = Encoding.UTF8.GetBytes(expectedSignature);
        var providedBytes = Encoding.UTF8.GetBytes(signature.Trim());

        if (expectedBytes.Length != providedBytes.Length)
            return false;

        return CryptographicOperations.FixedTimeEquals(expectedBytes, providedBytes);
    }

    public string HashSecret(string rawSecret)
    {
        return BCrypt.Net.BCrypt.HashPassword(rawSecret);
    }

    public bool VerifyHashedSecret(string rawSecret, string hash)
    {
        try
        {
            return BCrypt.Net.BCrypt.Verify(rawSecret, hash);
        }
        catch
        {
            return false;
        }
    }

    public string MaskSecret(string secret)
    {
        if (string.IsNullOrWhiteSpace(secret))
            return string.Empty;

        if (secret.Length <= 8)
            return "whsec_****";

        return $"{secret.Substring(0, 6)}****{secret.Substring(secret.Length - 4)}";
    }
}
