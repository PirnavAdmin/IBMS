using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json;

namespace Billing.Domain.Entities;

public class User
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Username { get; set; } = string.Empty;

    public string Email { get; set; } = string.Empty;

    public string PasswordHash { get; set; } = string.Empty;

    public int? TenantId { get; set; }
    public Tenant? Tenant { get; set; }

    public string ApplicationId { get; set; } = "IBMS";

    public string RolesString { get; set; } = "User";

    public string PermissionsString { get; set; } = "billing.view,billing.create";

    public string Status { get; set; } = "Active";

    [NotMapped]
    public bool IsActive
    {
        get => string.Equals(Status, "Active", StringComparison.OrdinalIgnoreCase);
        set => Status = value ? "Active" : "Inactive";
    }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAtUtc { get; set; }

    [NotMapped]
    public List<string> Roles
    {
        get
        {
            if (string.IsNullOrWhiteSpace(RolesString))
                return new List<string>();

            return RolesString.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
        }
        set => RolesString = value != null && value.Any() ? string.Join(",", value) : string.Empty;
    }

    [NotMapped]
    public List<string> Permissions
    {
        get
        {
            if (string.IsNullOrWhiteSpace(PermissionsString))
                return new List<string>();

            return PermissionsString.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
        }
        set => PermissionsString = value != null && value.Any() ? string.Join(",", value) : string.Empty;
    }

    [NotMapped]
    public string RolesJson
    {
        get => RolesString;
        set => RolesString = value;
    }

    [NotMapped]
    public string PermissionsJson
    {
        get => PermissionsString;
        set => PermissionsString = value;
    }

    public ICollection<UserSession> Sessions { get; set; } = new List<UserSession>();
}