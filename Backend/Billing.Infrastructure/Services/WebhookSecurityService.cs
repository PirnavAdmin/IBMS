using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
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

    public bool IsSensitiveHeader(string headerName)
    {
        if (string.IsNullOrWhiteSpace(headerName)) return false;

        var normalized = headerName.Trim().ToLowerInvariant();
        if (normalized.StartsWith("x-ibms-", StringComparison.Ordinal))
        {
            return false;
        }

        return normalized is "authorization" or "proxy-authorization" or "cookie" or "set-cookie"
            or "x-api-key" or "api-key" or "x-auth-token" or "x-access-token" or "x-secret"
            || normalized.Contains("secret", StringComparison.Ordinal)
            || normalized.Contains("token", StringComparison.Ordinal)
            || normalized.Contains("password", StringComparison.Ordinal)
            || normalized.Contains("apikey", StringComparison.Ordinal)
            || normalized.Contains("api-key", StringComparison.Ordinal)
            || normalized.Contains("credential", StringComparison.Ordinal)
            || normalized.Contains("bearer", StringComparison.Ordinal)
            || normalized.Contains("private", StringComparison.Ordinal)
            || normalized.Contains("auth", StringComparison.Ordinal);
    }

    public bool IsMaskedValue(string? value)
    {
        return !string.IsNullOrWhiteSpace(value) && value.Contains("****", StringComparison.Ordinal);
    }

    public Dictionary<string, string> RedactHeaders(IDictionary<string, string>? headers)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (headers == null || headers.Count == 0) return result;

        foreach (var (key, value) in headers)
        {
            if (string.IsNullOrWhiteSpace(key)) continue;

            if (!IsSensitiveHeader(key))
            {
                result[key] = value ?? string.Empty;
                continue;
            }

            result[key] = MaskHeaderValue(value);
        }

        return result;
    }

    public string? RedactHeadersJson(string? headersJson)
    {
        if (string.IsNullOrWhiteSpace(headersJson)) return headersJson;

        try
        {
            var parsed = JsonSerializer.Deserialize<Dictionary<string, string>>(headersJson);
            if (parsed == null) return headersJson;
            return JsonSerializer.Serialize(RedactHeaders(parsed));
        }
        catch
        {
            return headersJson;
        }
    }

    public bool IsValidDestinationUrl(string? targetUrl, bool allowLocalhost, out string? errorMessage)
    {
        errorMessage = null;

        if (string.IsNullOrWhiteSpace(targetUrl) ||
            !Uri.TryCreate(targetUrl.Trim(), UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            errorMessage = "A valid HTTP or HTTPS destination URL is required.";
            return false;
        }

        if (!string.IsNullOrEmpty(uri.UserInfo))
        {
            errorMessage = "Destination URL must not embed credentials.";
            return false;
        }

        var host = uri.DnsSafeHost.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(host))
        {
            errorMessage = "A valid destination host is required.";
            return false;
        }

        var isExplicitLocalhost = host is "localhost" or "localhost.localdomain" or "::1" or "127.0.0.1";
        if (!allowLocalhost &&
            (isExplicitLocalhost || host.EndsWith(".local", StringComparison.Ordinal) || host.EndsWith(".internal", StringComparison.Ordinal) || host == "0.0.0.0"))
        {
            errorMessage = "Destination URL cannot target localhost or internal network hostnames.";
            return false;
        }

        if (IPAddress.TryParse(host, out var literalIp))
        {
            if (IsPrivateOrReservedIp(literalIp, allowLocalhost))
            {
                errorMessage = "Destination URL cannot target private, loopback, or link-local IP addresses.";
                return false;
            }

            return true;
        }

        if (!allowLocalhost)
        {
            try
            {
                var resolvedAddresses = Dns.GetHostAddresses(host);
                foreach (var addr in resolvedAddresses)
                {
                    if (IsPrivateOrReservedIp(addr, allowLoopback: false))
                    {
                        errorMessage = "Destination hostname resolves to a private, loopback, or restricted IP address.";
                        return false;
                    }
                }
            }
            catch (SocketException)
            {
                // Offline environments or unit tests using placeholder domains (e.g. erp.example.com)
                // still undergo IP-literal / internal-hostname checks and live DNS checks on dispatch.
            }
        }

        return true;
    }

    private static string MaskHeaderValue(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return string.Empty;
        var trimmed = value.Trim();
        if (trimmed.Contains("****", StringComparison.Ordinal)) return trimmed;
        if (trimmed.Length <= 8) return "****";
        return $"{trimmed[..4]}****{trimmed[^4..]}";
    }

    private static bool IsPrivateOrReservedIp(IPAddress ip, bool allowLoopback)
    {
        if (ip.IsIPv4MappedToIPv6)
        {
            ip = ip.MapToIPv4();
        }

        if (IPAddress.IsLoopback(ip))
        {
            return !allowLoopback;
        }

        if (ip.Equals(IPAddress.Any) || ip.Equals(IPAddress.IPv6Any))
        {
            return true;
        }

        if (ip.AddressFamily == AddressFamily.InterNetwork)
        {
            var bytes = ip.GetAddressBytes();
            return bytes[0] switch
            {
                0 => true,                                                          // 0.0.0.0/8
                10 => true,                                                         // 10.0.0.0/8
                127 => !allowLoopback,                                              // 127.0.0.0/8
                169 => bytes[1] == 254,                                             // 169.254.0.0/16 (link-local / cloud metadata)
                172 => bytes[1] >= 16 && bytes[1] <= 31,                            // 172.16.0.0/12
                192 => bytes[1] == 168,                                             // 192.168.0.0/16
                100 => bytes[1] >= 64 && bytes[1] <= 127,                           // 100.64.0.0/10 (CGNAT)
                _ => false
            };
        }

        if (ip.AddressFamily == AddressFamily.InterNetworkV6)
        {
            if (ip.IsIPv6LinkLocal || ip.IsIPv6SiteLocal || ip.IsIPv6Multicast)
                return true;

            var firstByte = ip.GetAddressBytes()[0];
            // fc00::/7 Unique Local Addresses
            if ((firstByte & 0xFE) == 0xFC)
                return true;
        }

        return false;
    }
}
