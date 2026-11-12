using System.Security.Claims;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Administration;
using Billing.Contracts.Platform;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers.Platform;

/// <summary>
/// Platform User and Role Management APIs for Super Administrators.
/// </summary>
[ApiController]
[Route("api/v1/platform/users")]
[Authorize(Policy = "SuperAdminPolicy")]
[Produces("application/json")]
public class PlatformUsersController : ControllerBase
{
    private readonly IPlatformAdministrationService _platformService;
    private readonly IRoleAdministrationService _roleService;
    private readonly IEmailService? _emailService;

    public PlatformUsersController(
        IPlatformAdministrationService platformService,
        IRoleAdministrationService roleService,
        IEmailService? emailService = null)
    {
        _platformService = platformService;
        _roleService = roleService;
        _emailService = emailService;
    }

    /// <summary>
    /// Retrieves a paginated directory of platform administrators and cross-tenant users.
    /// </summary>
    /// <param name="search">Search query matching name, username, or email.</param>
    /// <param name="status">Filter by user status (Active, Inactive, Suspended).</param>
    /// <param name="role">Filter by assigned role.</param>
    /// <param name="tenantId">Filter by tenant scope (null for platform administrators).</param>
    /// <param name="identityType">Filter by identity provider type (Platform, Host, Federated).</param>
    /// <param name="page">Page index (1-based).</param>
    /// <param name="pageSize">Page size.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Paginated platform user directory.</returns>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<PagedResult<PlatformUserDto>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetPlatformUsers(
        [FromQuery] string? search = null,
        [FromQuery] string? status = null,
        [FromQuery] string? role = null,
        [FromQuery] int? tenantId = null,
        [FromQuery] string? identityType = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        var users = await _platformService.GetPlatformUsersAsync(
            search, status, role, tenantId, identityType, page, pageSize, cancellationToken);

        return Ok(ApiResponse<PagedResult<PlatformUserDto>>.Ok(users, "Platform users retrieved successfully."));
    }

    /// <summary>
    /// Creates or invites an approved platform administrator or scoped user account.
    /// </summary>
    /// <param name="request">User creation parameters.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Created platform user details.</returns>
    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<PlatformUserDto>), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> CreatePlatformUser(
        [FromBody] CreatePlatformUserRequest request,
        CancellationToken cancellationToken)
    {
        var currentUserName = GetCurrentUserName();
        var (success, message, createdUser, errorCode) = await _platformService.CreatePlatformUserAsync(
            request, currentUserName, cancellationToken);

        if (!success)
        {
            return BadRequest(ApiResponse<object>.Fail(message, errors: null, errorCode: errorCode ?? "USER_CREATION_FAILED"));
        }

        return StatusCode(StatusCodes.Status201Created, ApiResponse<PlatformUserDto>.Ok(createdUser!, message));
    }

    /// <summary>
    /// Updates user active status with last-SuperAdmin lockout prevention.
    /// </summary>
    /// <param name="id">User identifier.</param>
    /// <param name="request">Status update payload.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Status change outcome.</returns>
    [HttpPatch("{id:int}/status")]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> UpdateUserStatus(
        int id,
        [FromBody] UpdateUserStatusRequest request,
        CancellationToken cancellationToken)
    {
        var currentUserName = GetCurrentUserName();
        var (success, message, errorCode) = await _platformService.UpdateUserStatusAsync(
            id, request.Status, null, currentUserName, cancellationToken);

        if (!success)
        {
            if (errorCode == "NOT_FOUND")
            {
                return NotFound(ApiResponse<object>.Fail(message, errors: null, errorCode: errorCode));
            }
            return BadRequest(ApiResponse<object>.Fail(message, errors: null, errorCode: errorCode ?? "STATUS_UPDATE_FAILED"));
        }

        return Ok(ApiResponse<object>.Ok(new { userId = id, status = request.Status }, message));
    }

    /// <summary>
    /// Assigns or reassigns roles to a user with last-SuperAdmin privilege revocation protection.
    /// </summary>
    /// <param name="id">User identifier.</param>
    /// <param name="request">Target roles list.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Updated user details.</returns>
    [HttpPost("{id:int}/roles")]
    [ProducesResponseType(typeof(ApiResponse<PlatformUserDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> AssignUserRoles(
        int id,
        [FromBody] AssignUserRolesRequest request,
        CancellationToken cancellationToken)
    {
        var currentUserName = GetCurrentUserName();
        var (success, message, updatedUser, errorCode) = await _platformService.AssignUserRolesAsync(
            id, request.Roles, currentUserName, cancellationToken);

        if (!success)
        {
            if (errorCode == "NOT_FOUND")
            {
                return NotFound(ApiResponse<object>.Fail(message, errors: null, errorCode: errorCode));
            }
            return BadRequest(ApiResponse<object>.Fail(message, errors: null, errorCode: errorCode ?? "ROLE_ASSIGNMENT_FAILED"));
        }

        return Ok(ApiResponse<PlatformUserDto>.Ok(updatedUser!, message));
    }

    /// <summary>
    /// Assigns or transfers user tenant association and application context.
    /// </summary>
    /// <param name="id">User identifier.</param>
    /// <param name="request">Tenant assignment payload.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Updated user details.</returns>
    [HttpPut("{id:int}/assignment")]
    [ProducesResponseType(typeof(ApiResponse<PlatformUserDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> AssignTenant(
        int id,
        [FromBody] AssignTenantAdminRequest request,
        CancellationToken cancellationToken)
    {
        var currentUserName = GetCurrentUserName();
        var (success, message, updatedUser, errorCode) = await _platformService.AssignTenantAndAppAsync(
            id, request.TenantId, request.ApplicationId, currentUserName, cancellationToken);

        if (!success)
        {
            if (errorCode == "NOT_FOUND")
            {
                return NotFound(ApiResponse<object>.Fail(message, errors: null, errorCode: errorCode));
            }
            return BadRequest(ApiResponse<object>.Fail(message, errors: null, errorCode: errorCode ?? "ASSIGNMENT_FAILED"));
        }

        return Ok(ApiResponse<PlatformUserDto>.Ok(updatedUser!, message));
    }

    /// <summary>
    /// Approves a self-registered user account and grants SuperAdmin login permission.
    /// </summary>
    [HttpPost("{id:int}/approve")]
    [ProducesResponseType(typeof(ApiResponse<PlatformUserDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> ApproveUserRegistration(
        int id,
        [FromBody] ApproveUserRegistrationRequest? request = null,
        CancellationToken cancellationToken = default)
    {
        var currentUserName = GetCurrentUserName();
        var (success, message, updatedUser, errorCode) = await _platformService.ApproveUserRegistrationAsync(
            id, request, currentUserName, cancellationToken);

        if (!success)
        {
            if (errorCode == "NOT_FOUND")
            {
                return NotFound(ApiResponse<object>.Fail(message, errors: null, errorCode: errorCode));
            }
            return BadRequest(ApiResponse<object>.Fail(message, errors: null, errorCode: errorCode ?? "APPROVAL_FAILED"));
        }

        if (_emailService != null && updatedUser != null && !string.IsNullOrWhiteSpace(updatedUser.Email))
        {
            try
            {
                var rolesLabel = updatedUser.Roles.Any() ? string.Join(", ", updatedUser.Roles) : "Customer";
                await _emailService.SendEmailAsync(
                    updatedUser.Email,
                    "IBMS Account Approved — You Can Now Sign In",
                    $"<div style=\"font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:22px;border:1px solid #dccab7;border-radius:10px;background:#FFFDF9;\"><h2 style=\"color:#35231C;margin-top:0;\">Account Access Approved</h2><p style=\"color:#574840;\">Hi {System.Net.WebUtility.HtmlEncode(updatedUser.Name)}, a SuperAdmin has approved your IBMS account with role(s): <strong>{System.Net.WebUtility.HtmlEncode(rolesLabel)}</strong>.</p><p style=\"color:#35231C;font-weight:600;\">You can now sign in using your registered email and password.</p></div>"
                );
            }
            catch
            {
                // Non-blocking approval notification email.
            }
        }

        return Ok(ApiResponse<PlatformUserDto>.Ok(updatedUser!, message));
    }

    /// <summary>
    /// Rejects a self-registered user account request so login remains blocked.
    /// </summary>
    [HttpPost("{id:int}/reject")]
    [ProducesResponseType(typeof(ApiResponse<PlatformUserDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> RejectUserRegistration(
        int id,
        [FromBody] RejectUserRegistrationRequest? request = null,
        CancellationToken cancellationToken = default)
    {
        var currentUserName = GetCurrentUserName();
        var (success, message, updatedUser, errorCode) = await _platformService.RejectUserRegistrationAsync(
            id, request?.Reason, currentUserName, cancellationToken);

        if (!success)
        {
            if (errorCode == "NOT_FOUND")
            {
                return NotFound(ApiResponse<object>.Fail(message, errors: null, errorCode: errorCode));
            }
            return BadRequest(ApiResponse<object>.Fail(message, errors: null, errorCode: errorCode ?? "REJECTION_FAILED"));
        }

        return Ok(ApiResponse<PlatformUserDto>.Ok(updatedUser!, message));
    }

    /// <summary>
    /// Retrieves all available platform and tenant roles.
    /// </summary>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>List of roles.</returns>
    [HttpGet("/api/v1/platform/roles")]
    [ProducesResponseType(typeof(ApiResponse<List<RoleDto>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetPlatformRoles(CancellationToken cancellationToken)
    {
        var roles = await _roleService.GetRolesAsync(null);
        return Ok(ApiResponse<List<RoleDto>>.Ok(roles, "Platform roles retrieved successfully."));
    }

    private string GetCurrentUserName()
    {
        return User.FindFirst(ClaimTypes.Name)?.Value
               ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value
               ?? User.Identity?.Name
               ?? "SuperAdmin";
    }
}
