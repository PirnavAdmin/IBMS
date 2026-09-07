namespace Billing.Contracts;

public class RefreshTokenResponse
{
    public bool Success { get; set; }

    public string Message { get; set; } = string.Empty;

    public string? AccessToken { get; set; }

    public string? Token
    {
        get => AccessToken;
        set => AccessToken = value;
    }

    public string? RefreshToken { get; set; }

    public int ExpiresIn { get; set; }
}
