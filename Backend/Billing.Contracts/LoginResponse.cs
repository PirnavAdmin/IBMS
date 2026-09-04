namespace Billing.Contracts;

public class LoginResponse
{
    public bool Success { get; set; }

    public string Message { get; set; } = string.Empty;

    public string? Token { get; set; }

    public List<string>? Errors { get; set; }
}