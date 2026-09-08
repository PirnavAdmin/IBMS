namespace Billing.Contracts;

public class LoginRequest
{
    /// <summary>
    /// User email or username.
    /// </summary>
    public string Email { get; set; } = string.Empty;

    public string Password { get; set; } = string.Empty;
}