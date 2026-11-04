using System.Security.Claims;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Platform;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers.Platform;

/// <summary>
/// Tenant Management APIs for Super Administrators.
/// </summary>
[ApiController]
[Route("api/v1/platform/tenants")]
[Authorize(Policy = "SuperAdminPolicy")]
[Produces("application/json")]
public class PlatformTenantsController : ControllerBase
{
    private readonly IPlatformAdministrationService _platformService;

    public PlatformTenantsController(IPlatformAdministrationService platformService)
    {
        _platformService = platformService;
    }

    /// <summary>
    /// Retrieves a paginated list of tenants with optional search and status filtering.
    /// </summary>
    /// <param name="search">Search term matching tenant name or code.</param>
    /// <param name="status">Filter by tenant status (Active, Suspended, Inactive).</param>
    /// <param name="page">Page index (1-based).</param>
    /// <param name="pageSize">Page size.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Paginated tenant list.</returns>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<PagedResult<PlatformTenantDto>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetTenants(
        [FromQuery] string? search = null,
        [FromQuery] string? status = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        var result = await _platformService.GetTenantsAsync(search, status, page, pageSize, cancellationToken);
        return Ok(ApiResponse<PagedResult<PlatformTenantDto>>.Ok(result, "Tenants retrieved successfully."));
    }

    /// <summary>
    /// Retrieves detailed configuration and metadata for a specific tenant.
    /// </summary>
    /// <param name="id">Tenant identifier.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Detailed tenant information.</returns>
    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<PlatformTenantDetailDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetTenantById(int id, CancellationToken cancellationToken)
    {
        var tenant = await _platformService.GetTenantByIdAsync(id, cancellationToken);
        if (tenant == null)
        {
            return NotFound(ApiResponse<PlatformTenantDetailDto>.Fail($"Tenant with ID {id} was not found.", errors: null, errorCode: "NOT_FOUND"));
        }

        return Ok(ApiResponse<PlatformTenantDetailDto>.Ok(tenant, "Tenant details retrieved successfully."));
    }

    /// <summary>
    /// Provisions a new tenant with server-side identity and transactional default master blueprint.
    /// </summary>
    /// <param name="request">Tenant creation parameters.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Created tenant details.</returns>
    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<PlatformTenantDetailDto>), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> CreateTenant([FromBody] CreateTenantRequest request, CancellationToken cancellationToken)
    {
        var currentUserName = GetCurrentUserName();
        var (success, message, createdTenant, errorCode) = await _platformService.CreateTenantAsync(request, currentUserName, cancellationToken);

        if (!success)
        {
            if (errorCode == "DUPLICATE_CODE" || errorCode == "CONFLICT")
            {
                return Conflict(ApiResponse<object>.Fail(message, errors: null, errorCode: errorCode));
            }
            return BadRequest(ApiResponse<object>.Fail(message, errors: null, errorCode: errorCode ?? "VALIDATION_FAILED"));
        }

        return StatusCode(StatusCodes.Status201Created, ApiResponse<PlatformTenantDetailDto>.Ok(createdTenant!, message));
    }

    /// <summary>
    /// Updates permitted tenant details with concurrency conflict protection.
    /// </summary>
    /// <param name="id">Tenant identifier.</param>
    /// <param name="request">Update parameters including expected UpdatedAtUtc.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Updated tenant details.</returns>
    [HttpPut("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<PlatformTenantDetailDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> UpdateTenant(int id, [FromBody] UpdateTenantRequest request, CancellationToken cancellationToken)
    {
        var currentUserName = GetCurrentUserName();
        var (success, message, updatedTenant, errorCode) = await _platformService.UpdateTenantAsync(id, request, currentUserName, cancellationToken);

        if (!success)
        {
            if (errorCode == "NOT_FOUND")
            {
                return NotFound(ApiResponse<object>.Fail(message, errors: null, errorCode: errorCode));
            }
            if (errorCode == "CONCURRENCY_CONFLICT")
            {
                return Conflict(ApiResponse<object>.Fail(message, errors: null, errorCode: errorCode));
            }
            return BadRequest(ApiResponse<object>.Fail(message, errors: null, errorCode: errorCode ?? "UPDATE_FAILED"));
        }

        return Ok(ApiResponse<PlatformTenantDetailDto>.Ok(updatedTenant!, message));
    }

    /// <summary>
    /// Transitions tenant status (Active, Suspended, Inactive) with mandatory audit reason and session termination cascade.
    /// </summary>
    /// <param name="id">Tenant identifier.</param>
    /// <param name="request">Target status and transition reason.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Updated tenant summary.</returns>
    [HttpPatch("{id:int}/status")]
    [ProducesResponseType(typeof(ApiResponse<PlatformTenantDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> UpdateTenantStatus(int id, [FromBody] UpdateTenantStatusRequest request, CancellationToken cancellationToken)
    {
        var currentUserName = GetCurrentUserName();
        var (success, message, updatedTenant, errorCode) = await _platformService.UpdateTenantStatusAsync(id, request, currentUserName, cancellationToken);

        if (!success)
        {
            if (errorCode == "NOT_FOUND")
            {
                return NotFound(ApiResponse<object>.Fail(message, errors: null, errorCode: errorCode));
            }
            return BadRequest(ApiResponse<object>.Fail(message, errors: null, errorCode: errorCode ?? "STATUS_TRANSITION_FAILED"));
        }

        return Ok(ApiResponse<PlatformTenantDto>.Ok(updatedTenant!, message));
    }

    /// <summary>
    /// Retrieves all assigned Tenant Administrators for a given tenant.
    /// </summary>
    /// <param name="id">Tenant identifier.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>List of tenant administrators.</returns>
    [HttpGet("{id:int}/admins")]
    [ProducesResponseType(typeof(ApiResponse<List<TenantAdminUserDto>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetTenantAdmins(int id, CancellationToken cancellationToken)
    {
        var tenant = await _platformService.GetTenantByIdAsync(id, cancellationToken);
        if (tenant == null)
        {
            return NotFound(ApiResponse<object>.Fail($"Tenant with ID {id} was not found.", errors: null, errorCode: "NOT_FOUND"));
        }

        var admins = await _platformService.GetTenantAdminsAsync(id, cancellationToken);
        return Ok(ApiResponse<List<TenantAdminUserDto>>.Ok(admins, "Tenant administrators retrieved successfully."));
    }

    private string GetCurrentUserName()
    {
        return User.FindFirst(ClaimTypes.Name)?.Value
               ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value
               ?? User.Identity?.Name
               ?? "SuperAdmin";
    }
}
