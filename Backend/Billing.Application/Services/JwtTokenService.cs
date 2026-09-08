using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Billing.Application.Common;
using Billing.Application.Interfaces;
using Billing.Domain.Entities;
using Microsoft.IdentityModel.Tokens;

namespace Billing.Application.Services;

public class JwtTokenService : IJwtTokenService
{
    private readonly JwtSettings _jwtSettings;
    private readonly JwtSecurityTokenHandler _tokenHandler;

    public JwtTokenService(JwtSettings jwtSettings)
    {
        _jwtSettings = jwtSettings;
        _tokenHandler = new JwtSecurityTokenHandler();
    }

    public (string AccessToken, DateTime ExpiresAtUtc) GenerateAccessToken(User user, Guid sessionId)
    {
        var expiresAtUtc = DateTime.UtcNow.AddMinutes(_jwtSettings.AccessTokenExpirationMinutes);
        var key = Encoding.UTF8.GetBytes(_jwtSettings.SecretKey);
        var signingCredentials = new SigningCredentials(
            new SymmetricSecurityKey(key),
            SecurityAlgorithms.HmacSha256Signature
        );

        var claims = new List<Claim>
        {
            // Subject & User ID
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new("UserId", user.Id.ToString()),

            // Profile info
            new(JwtRegisteredClaimNames.Email, user.Email),
            new(ClaimTypes.Email, user.Email),
            new(JwtRegisteredClaimNames.Name, user.Name),
            new(ClaimTypes.Name, user.Name),
            new("username", string.IsNullOrWhiteSpace(user.Username) ? user.Email : user.Username),

            // Multi-tenancy & Application claims
            new("TenantId", user.TenantId?.ToString() ?? ""),
            new("tenant_id", user.TenantId?.ToString() ?? ""),
            new("tenant_code", user.Tenant?.TenantCode ?? ""),
            new("tenant_name", user.Tenant?.Name ?? ""),
            new("ApplicationId", string.IsNullOrWhiteSpace(user.ApplicationId) ? _jwtSettings.ApplicationId : user.ApplicationId),
            new("app_id", string.IsNullOrWhiteSpace(user.ApplicationId) ? _jwtSettings.ApplicationId : user.ApplicationId),

            // Session tracking claims
            new("sessionId", sessionId.ToString()),
            new(ClaimTypes.Sid, sessionId.ToString()),
            new("sid", sessionId.ToString()),

            // Standard JWT claims
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new(JwtRegisteredClaimNames.Iat, DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64)
        };

        // Roles claims
        var roles = user.Roles;
        if (!roles.Any())
        {
            roles = new List<string> { "Customer" };
        }

        foreach (var role in roles)
        {
            claims.Add(new Claim(ClaimTypes.Role, role));
            claims.Add(new Claim("role", role));
            claims.Add(new Claim("Roles", role));
        }

        // Permissions claims
        var permissions = user.Permissions;
        if (!permissions.Any())
        {
            permissions = new List<string> { "billing.view" };
        }

        foreach (var permission in permissions)
        {
            claims.Add(new Claim("Permissions", permission));
            claims.Add(new Claim("permission", permission));
        }

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = expiresAtUtc,
            Issuer = _jwtSettings.Issuer,
            Audience = _jwtSettings.Audience,
            SigningCredentials = signingCredentials
        };

        var token = _tokenHandler.CreateToken(tokenDescriptor);
        var tokenString = _tokenHandler.WriteToken(token);

        return (tokenString, expiresAtUtc);
    }

    public string GenerateRefreshToken()
    {
        var randomBytes = new byte[64];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(randomBytes);
        return Convert.ToBase64String(randomBytes)
            .Replace("+", "-")
            .Replace("/", "_")
            .TrimEnd('=');
    }

    public string HashRefreshToken(string refreshToken)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
            return string.Empty;

        var bytes = Encoding.UTF8.GetBytes(refreshToken.Trim());
        var hash = SHA256.HashData(bytes);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    public bool ValidateToken(string token, out ClaimsPrincipal? principal, out string? failureReason)
    {
        principal = null;
        failureReason = null;

        if (string.IsNullOrWhiteSpace(token))
        {
            failureReason = "Token is missing";
            return false;
        }

        var key = Encoding.UTF8.GetBytes(_jwtSettings.SecretKey);
        var validationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(key),
            ValidateIssuer = true,
            ValidIssuer = _jwtSettings.Issuer,
            ValidateAudience = true,
            ValidAudience = _jwtSettings.Audience,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero
        };

        try
        {
            principal = _tokenHandler.ValidateToken(token, validationParameters, out var validatedToken);
            if (validatedToken is not JwtSecurityToken jwtSecurityToken ||
                !jwtSecurityToken.Header.Alg.Equals(SecurityAlgorithms.HmacSha256, StringComparison.InvariantCultureIgnoreCase))
            {
                failureReason = "Invalid token algorithm or structure";
                principal = null;
                return false;
            }

            return true;
        }
        catch (SecurityTokenExpiredException)
        {
            failureReason = "Token has expired";
            return false;
        }
        catch (SecurityTokenInvalidSignatureException)
        {
            failureReason = "Invalid token signature / token has been tampered with";
            return false;
        }
        catch (SecurityTokenInvalidIssuerException)
        {
            failureReason = "Invalid token issuer";
            return false;
        }
        catch (SecurityTokenInvalidAudienceException)
        {
            failureReason = "Invalid token audience";
            return false;
        }
        catch (Exception ex)
        {
            failureReason = $"Token validation failed: {ex.Message}";
            return false;
        }
    }

    public Guid? GetSessionIdFromPrincipalOrToken(ClaimsPrincipal? principal, string? token = null)
    {
        if (principal != null)
        {
            var sidClaim = principal.FindFirst("sessionId") ??
                           principal.FindFirst(ClaimTypes.Sid) ??
                           principal.FindFirst("sid");

            if (sidClaim != null && Guid.TryParse(sidClaim.Value, out var guid))
            {
                return guid;
            }
        }

        if (!string.IsNullOrWhiteSpace(token))
        {
            try
            {
                var jwt = _tokenHandler.ReadJwtToken(token);
                var sidClaim = jwt.Claims.FirstOrDefault(c => c.Type is "sessionId" or "sid" or ClaimTypes.Sid);
                if (sidClaim != null && Guid.TryParse(sidClaim.Value, out var guid))
                {
                    return guid;
                }
            }
            catch
            {
                // Ignored
            }
        }

        return null;
    }
}
