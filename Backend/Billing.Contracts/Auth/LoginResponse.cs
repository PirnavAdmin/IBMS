namespace Billing.Contracts;

public class LoginResponse
{
    public bool Success { get; set; }

    public string Message { get; set; } = string.Empty;

    public string? AccessToken { get; set; }

    public string? RefreshToken { get; set; }

    public string TokenType { get; set; } = "Bearer";

    public DateTime? ExpiresAtUtc { get; set; }

    public DateTime? RefreshTokenExpiresAtUtc { get; set; }

    public UserClaimsDto? User { get; set; }

    public List<string>? Errors { get; set; }
}