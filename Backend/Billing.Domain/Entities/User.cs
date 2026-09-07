namespace Billing.Domain.Entities;

public class User
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Email { get; set; } = string.Empty;

    public string PasswordHash { get; set; } = string.Empty;

    public int TenantId { get; set; }

    public int ApplicationId { get; set; }

    public string Role { get; set; } = "User";

    public string Permissions { get; set; } = string.Empty;

    public ICollection<UserSession> Sessions { get; set; } = new List<UserSession>();
}