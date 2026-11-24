using System.ComponentModel.DataAnnotations;

namespace Billing.Contracts.Administration;

public class RoleDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int? TenantId { get; set; }
    public bool IsSystemRole { get; set; }
    public List<string> Permissions { get; set; } = new();
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
}

public class CreateRoleRequest
{
    [Required(ErrorMessage = "Role name is required.")]
    [StringLength(50, MinimumLength = 2, ErrorMessage = "Role name must be between 2 and 50 characters.")]
    [RegularExpression(@"^[\p{L}\p{M}0-9\s\-_]+$", ErrorMessage = "Role name can only contain letters, numbers, spaces, hyphens, and underscores.")]
    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;
    public int? TenantId { get; set; }
    public List<string> Permissions { get; set; } = new();
}

public class UpdateRoleRequest
{
    [Required(ErrorMessage = "Role name is required.")]
    [StringLength(50, MinimumLength = 2, ErrorMessage = "Role name must be between 2 and 50 characters.")]
    [RegularExpression(@"^[\p{L}\p{M}0-9\s\-_]+$", ErrorMessage = "Role name can only contain letters, numbers, spaces, hyphens, and underscores.")]
    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;
    public List<string> Permissions { get; set; } = new();
}

public class AssignRolePermissionsRequest
{
    public List<string> Permissions { get; set; } = new();
}

public class PermissionDto
{
    public int Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Module { get; set; } = string.Empty;
    public string? Description { get; set; }
}
