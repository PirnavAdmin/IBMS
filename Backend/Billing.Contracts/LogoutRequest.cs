namespace Billing.Contracts;

public class LogoutRequest
{
    /// <summary>
    /// Optional refresh token to revoke. If omitted, the session associated with the current bearer token will be revoked.
    /// </summary>
    public string? RefreshToken { get; set; }
}
