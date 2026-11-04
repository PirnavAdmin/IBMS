using System.ComponentModel.DataAnnotations;

namespace Billing.Contracts.Platform;

public class PlatformTenantDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string TenantCode { get; set; } = string.Empty;
    public string? CompanyEmail { get; set; }
    public string? Phone { get; set; }
    public string? TaxId { get; set; }
    public string? Address { get; set; }
    public string Status { get; set; } = "Active";
    public bool IsActive { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
    public int UserCount { get; set; }
    public int InvoiceCount { get; set; }
}

public class PlatformTenantDetailDto : PlatformTenantDto
{
    public int CustomerCount { get; set; }
    public List<TenantAdminUserDto> AssignedAdmins { get; set; } = new();
}

public class PlatformTenantSummaryDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string TenantCode { get; set; } = string.Empty;
    public string? CompanyEmail { get; set; }
    public string Status { get; set; } = "Active";
    public DateTime CreatedAtUtc { get; set; }
    public int UserCount { get; set; }
    public string? AdminEmail { get; set; }
}

public class TenantAdminUserDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Status { get; set; } = "Active";
    public bool IsActive { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public List<string> Roles { get; set; } = new();
}

public class CreateTenantRequest
{
    [Required(ErrorMessage = "Tenant name is required.")]
    [StringLength(256, MinimumLength = 2, ErrorMessage = "Tenant name must be between 2 and 256 characters.")]
    public string Name { get; set; } = string.Empty;

    [Required(ErrorMessage = "Tenant code is required.")]
    [RegularExpression(@"^[a-zA-Z0-9_-]{2,64}$", ErrorMessage = "Tenant code must be 2-64 characters and contain only letters, numbers, hyphens, or underscores.")]
    public string TenantCode { get; set; } = string.Empty;

    [EmailAddress(ErrorMessage = "Invalid company email format.")]
    [StringLength(256)]
    public string? CompanyEmail { get; set; }

    [Phone(ErrorMessage = "Invalid phone number format.")]
    [StringLength(64)]
    public string? Phone { get; set; }

    [StringLength(64)]
    public string? TaxId { get; set; }

    public string? Address { get; set; }

    public string? State { get; set; }

    // Optional primary administrator account provisioning
    public string? AdminName { get; set; }

    [EmailAddress(ErrorMessage = "Invalid administrator email format.")]
    public string? AdminEmail { get; set; }

    [MinLength(8, ErrorMessage = "Administrator password must be at least 8 characters long.")]
    public string? AdminPassword { get; set; }

    public string? IdempotencyKey { get; set; }
}

public class UpdateTenantRequest
{
    [Required(ErrorMessage = "Tenant name is required.")]
    [StringLength(256, MinimumLength = 2, ErrorMessage = "Tenant name must be between 2 and 256 characters.")]
    public string Name { get; set; } = string.Empty;

    [EmailAddress(ErrorMessage = "Invalid company email format.")]
    [StringLength(256)]
    public string? CompanyEmail { get; set; }

    [StringLength(64)]
    public string? Phone { get; set; }

    [StringLength(64)]
    public string? TaxId { get; set; }

    public string? Address { get; set; }

    /// <summary>
    /// Concurrency token: If provided, the update will verify against the existing UpdatedAtUtc to prevent concurrent overrides.
    /// </summary>
    public DateTime? ExpectedUpdatedAtUtc { get; set; }
}

public class UpdateTenantStatusRequest
{
    [Required(ErrorMessage = "Status is required.")]
    public string Status { get; set; } = string.Empty;

    [Required(ErrorMessage = "A reason for the status transition is required.")]
    [MinLength(5, ErrorMessage = "Status change reason must be at least 5 characters long.")]
    public string Reason { get; set; } = string.Empty;
}
