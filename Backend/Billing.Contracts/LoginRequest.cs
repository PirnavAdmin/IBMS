namespace Billing.Contracts;

public class LoginRequest
{
    /// <summary>
    /// User email or username.
    /// </summary>
    public string Email { get; set; } = string.Empty;

    /// <summary>
    /// Optional explicit username if different from email.
    /// </summary>
    public string? Username { get; set; }

    public string Password { get; set; } = string.Empty;
}