using System.ComponentModel.DataAnnotations;

namespace Billing.Contracts.Platform;

public class PlatformUserDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public int? TenantId { get; set; }
    public string? TenantCode { get; set; }
    public string? TenantName { get; set; }
    public string ApplicationId { get; set; } = "IBMS";
    public string Status { get; set; } = "Active";
    public bool IsActive { get; set; }
    public string IdentityType { get; set; } = "Platform";
    public List<string> Roles { get; set; } = new();
    public List<string> Permissions { get; set; } = new();
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
}

public class CreatePlatformUserRequest
{
    [Required(ErrorMessage = "User name is required.")]
    [StringLength(256, MinimumLength = 2, ErrorMessage = "Name must be between 2 and 256 characters.")]
    public string Name { get; set; } = string.Empty;

    [Required(ErrorMessage = "Email is required.")]
    [EmailAddress(ErrorMessage = "Invalid email format.")]
    [StringLength(256)]
    public string Email { get; set; } = string.Empty;

    [Required(ErrorMessage = "Password is required for platform users.")]
    [MinLength(8, ErrorMessage = "Password must be at least 8 characters long.")]
    public string Password { get; set; } = string.Empty;

    public List<string> Roles { get; set; } = new() { "SuperAdmin" };

    public int? TenantId { get; set; }

    public string IdentityType { get; set; } = "Platform";

    public string ApplicationId { get; set; } = "IBMS";
}

public class AssignTenantAdminRequest
{
    [Required(ErrorMessage = "User ID is required.")]
    public int UserId { get; set; }

    [Required(ErrorMessage = "Tenant ID is required.")]
    public int TenantId { get; set; }

    public string ApplicationId { get; set; } = "IBMS";
}

public class ApproveUserRegistrationRequest
{
    public int? TenantId { get; set; }

    public List<string>? Roles { get; set; }

    [StringLength(500)]
    public string? Note { get; set; }
}

public class RejectUserRegistrationRequest
{
    [StringLength(500)]
    public string? Reason { get; set; }
}
