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

    public string TenantId { get; set; } = "tenant-default";

    public string ApplicationId { get; set; } = "IBMS";

    public string RolesJson { get; set; } = "[\"User\"]";

    public string PermissionsJson { get; set; } = "[\"billing.view\",\"billing.create\"]";

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAtUtc { get; set; }

    [NotMapped]
    public List<string> Roles
    {
        get
        {
            if (string.IsNullOrWhiteSpace(RolesJson))
                return new List<string>();

            try
            {
                return JsonSerializer.Deserialize<List<string>>(RolesJson) ?? new List<string>();
            }
            catch
            {
                return new List<string>();
            }
        }
        set => RolesJson = JsonSerializer.Serialize(value ?? new List<string>());
    }

    [NotMapped]
    public List<string> Permissions
    {
        get
        {
            if (string.IsNullOrWhiteSpace(PermissionsJson))
                return new List<string>();

            try
            {
                return JsonSerializer.Deserialize<List<string>>(PermissionsJson) ?? new List<string>();
            }
            catch
            {
                return new List<string>();
            }
        }
        set => PermissionsJson = JsonSerializer.Serialize(value ?? new List<string>());
    }

    public ICollection<UserSession> Sessions { get; set; } = new List<UserSession>();
}