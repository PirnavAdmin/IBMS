namespace Billing.Contracts.Administration;

public class UserDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public int? TenantId { get; set; }
    public string? TenantCode { get; set; }
    public string? TenantName { get; set; }
    public string ApplicationId { get; set; } = string.Empty;
    public string Status { get; set; } = "Active";
    public bool IsActive { get; set; }
    public string IdentityType { get; set; } = "Platform";
    public string? ExternalProvider { get; set; }
    public string? ExternalSubjectId { get; set; }
    public string? ExternalScopes { get; set; }
    public List<string> Roles { get; set; } = new();
    public List<string> Permissions { get; set; } = new();
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
}

public class CreateUserRequest
{
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Password { get; set; }
    public int? TenantId { get; set; } = 1;
    public string ApplicationId { get; set; } = "IBMS";
    public string IdentityType { get; set; } = "Platform"; // "Platform" or "Host"
    public string? ExternalProvider { get; set; }
    public string? ExternalSubjectId { get; set; }
    public string? ExternalScopes { get; set; }
    public List<string> Roles { get; set; } = new() { "User" };
    public List<string>? Permissions { get; set; }
    public string Status { get; set; } = "Active";
}

public class UpdateUserRequest
{
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public int? TenantId { get; set; }
    public string ApplicationId { get; set; } = "IBMS";
    public List<string>? Roles { get; set; }
    public List<string>? Permissions { get; set; }
    public string? Status { get; set; }
}

public class UpdateUserStatusRequest
{
    public string Status { get; set; } = "Active"; // "Active" or "Inactive"
}

public class AssignUserRolesRequest
{
    public List<string> Roles { get; set; } = new();
}

public class AssignTenantAppRequest
{
    public int? TenantId { get; set; }
    public string ApplicationId { get; set; } = "IBMS";
}

public class HostIdentityMappingRequest
{
    public string Email { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string ExternalProvider { get; set; } = string.Empty; // e.g. "AzureAD", "Google", "HostPortal"
    public string ExternalSubjectId { get; set; } = string.Empty;
    public string? ExternalScopes { get; set; }
    public int? TenantId { get; set; } = 1;
    public string ApplicationId { get; set; } = "IBMS";
    public List<string> Roles { get; set; } = new() { "User" };
}

public class UserQueryParameters
{
    public string? Search { get; set; }
    public string? Status { get; set; }
    public string? Role { get; set; }
    public int? TenantId { get; set; }
    public string? IdentityType { get; set; }
    public int PageNumber { get; set; } = 1;
    public int PageSize { get; set; } = 10;
}
