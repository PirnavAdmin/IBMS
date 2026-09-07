namespace Billing.Contracts;

public class LoginResponse
{
    public bool Success { get; set; }

    public string Message { get; set; } = string.Empty;

    public string? AccessToken { get; set; }

    public string? RefreshToken { get; set; }

    public int ExpiresIn { get; set; }

    public List<string>? Errors { get; set; }
}