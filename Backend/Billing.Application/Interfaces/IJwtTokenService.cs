using System.Security.Claims;
using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IJwtTokenService
{
    /// <summary>
    /// Generates a signed JWT access token containing required claims:
    /// UserId, TenantId, ApplicationId, Roles, Permissions, SessionId, Name, Email, Jti, Iat, Exp.
    /// </summary>
    (string AccessToken, DateTime ExpiresAtUtc) GenerateAccessToken(User user, Guid sessionId);

    /// <summary>
    /// Generates a cryptographically random refresh token.
    /// </summary>
    string GenerateRefreshToken();

    /// <summary>
    /// Computes the SHA-256 hash of a refresh token for secure database storage.
    /// </summary>
    string HashRefreshToken(string refreshToken);

    /// <summary>
    /// Validates the JWT signature, issuer, audience, and expiration.
    /// </summary>
    bool ValidateToken(string token, out ClaimsPrincipal? principal, out string? failureReason);

    /// <summary>
    /// Extracts the session ID claim from a token without requiring it to be unexpired.
    /// </summary>
    Guid? GetSessionIdFromPrincipalOrToken(ClaimsPrincipal? principal, string? token = null);
}
