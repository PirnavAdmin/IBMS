namespace Billing.Application.Interfaces;

public interface IWebhookSecurityService
{
    string GenerateSecretKey();
    string GenerateClientId();
    string GenerateClientSecret();
    string ComputeHmacSha256(string secretKey, string payload, long timestamp);
    bool VerifySignature(string secretKey, string payload, long timestamp, string signature);
    string HashSecret(string rawSecret);
    bool VerifyHashedSecret(string rawSecret, string hash);
    string MaskSecret(string secret);
}
