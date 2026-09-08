namespace Billing.Contracts;

public class UserClaimsDto
{
    public int UserId { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Username { get; set; } = string.Empty;

    public string Email { get; set; } = string.Empty;

    public string? TenantId { get; set; }
    public string? TenantCode { get; set; }
    public string? TenantName { get; set; }
    public string Role { get; set; } = string.Empty;

    public string ApplicationId { get; set; } = string.Empty;

    public List<string> Roles { get; set; } = new();

    public List<string> Permissions { get; set; } = new();

    public Guid? SessionId { get; set; }
}
