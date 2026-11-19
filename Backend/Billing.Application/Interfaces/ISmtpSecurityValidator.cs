namespace Billing.Application.Interfaces;

/// <summary>
/// Security validator protecting against Server-Side Request Forgery (SSRF), internal port scanning,
/// and sensitive data leakage via SMTP configuration and test dispatch.
/// </summary>
public interface ISmtpSecurityValidator
{
    /// <summary>
    /// Validates an SMTP host and port against SSRF, internal RFC1918/link-local IP addresses,
    /// loopback addresses, and prohibited system ports.
    /// </summary>
    bool ValidateSmtpDestination(string? host, int port, out string? errorMessage, bool allowLocalhost = false);

    /// <summary>
    /// Strips sensitive host details, file paths, credentials, and internal stack traces
    /// from exception messages before persisting or returning to clients.
    /// </summary>
    string SanitizeErrorMessage(string? rawMessage);
}
