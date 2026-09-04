namespace Billing.Contracts;

public class LoginResponse
{
    public bool Success { get; set; }

    public string Message { get; set; } = string.Empty;

    /// <summary>
    /// JWT Access Token (alias for Token)
    /// </summary>
    public string? AccessToken { get; set; }

    /// <summary>
    /// Backward-compatible alias for AccessToken
    /// </summary>
    public string? Token
    {
        get => AccessToken;
        set => AccessToken = value;
    }

    public string? RefreshToken { get; set; }

    public string TokenType { get; set; } = "Bearer";

    public DateTime? ExpiresAtUtc { get; set; }

    public DateTime? RefreshTokenExpiresAtUtc { get; set; }

    public UserClaimsDto? User { get; set; }

    public List<string>? Errors { get; set; }
}