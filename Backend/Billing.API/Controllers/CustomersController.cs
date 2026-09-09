using System.Security.Claims;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers;

[Authorize(Roles = "TenantAdmin,SuperAdmin,Customer")]
[ApiController]
[Route("api/v1/customers")]
[Consumes("application/json")]
[Produces("application/json")]
public class CustomersController : ControllerBase
{
    private readonly ICustomerService _customerService;
    private readonly IAuditService _auditService;
    private readonly ILogger<CustomersController> _logger;

    public CustomersController(
        ICustomerService customerService,
        IAuditService auditService,
        ILogger<CustomersController> logger)
    {
        _customerService = customerService;
        _auditService = auditService;
        _logger = logger;
    }

    /// <summary>
    /// IBMSBE-001: POST /api/v1/customers
    /// Create a new customer record scoped to current tenant.
    /// </summary>
    [Authorize(Roles = "TenantAdmin,SuperAdmin")]
    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<CustomerDto>), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ApiResponse<CustomerDto>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> CreateCustomer([FromBody] CreateCustomerRequest request)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue)
        {
            if (User.IsInRole("SuperAdmin"))
            {
                return BadRequest(new { success = false, message = "Target tenant ID must be specified via X-Tenant-Id header or query parameter for SuperAdmin." });
            }
            return Forbid();
        }

        var result = await _customerService.CreateCustomerAsync(request, tenantId.Value);

        if (!result.Success)
        {
            return BadRequest(result);
        }

        // Record CREATE audit event (IBMSBE-Audit-02)
        await _auditService.RecordCustomerCreatedAsync(
            tenantId.Value,
            result.Data!.Id,
            result.Data.Name,
            GetUserId(),
            GetUserName(),
            request,
            GetClientIpAddress());

        return CreatedAtAction(
            nameof(GetCustomerById),
            new { id = result.Data!.Id },
            result);
    }

    /// <summary>
    /// IBMSBE-002: GET /api/v1/customers
    /// Retrieve a paginated list of customers with search, sorting, and status filtering.
    /// </summary>
    [Authorize(Roles = "TenantAdmin,SuperAdmin")]
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<PagedResult<CustomerDto>>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetCustomers([FromQuery] CustomerQueryParameters query)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue && !User.IsInRole("SuperAdmin"))
        {
            return Forbid();
        }

        var result = await _customerService.GetCustomersAsync(query, tenantId);
        return Ok(result);
    }

    /// <summary>
    /// IBMSBE-003: GET /api/v1/customers/{id}
    /// Retrieve customer details and profile by customer ID.
    /// </summary>
    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<CustomerDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<CustomerDto>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetCustomerById([FromRoute] int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue && !User.IsInRole("SuperAdmin"))
        {
            return Forbid();
        }

        var result = await _customerService.GetCustomerByIdAsync(id, tenantId);

        if (!result.Success)
        {
            return NotFound(result);
        }

        if (User.IsInRole("Customer") && !IsAuthorizedCustomer(result.Data?.Email))
        {
            return NotFound(ApiResponse<CustomerDto>.Fail("Customer not found", $"Customer with ID {id} was not found."));
        }

        return Ok(result);
    }

    /// <summary>
    /// IBMSBE-004: PUT /api/v1/customers/{id}
    /// Update existing customer profile information.
    /// </summary>
    [Authorize(Roles = "TenantAdmin,SuperAdmin")]
    [HttpPut("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<CustomerDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<CustomerDto>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<CustomerDto>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<CustomerDto>), StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> UpdateCustomer([FromRoute] int id, [FromBody] UpdateCustomerRequest request)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue && !User.IsInRole("SuperAdmin"))
        {
            return Forbid();
        }

        var result = await _customerService.UpdateCustomerAsync(id, request, tenantId);

        if (!result.Success)
        {
            if (string.Equals(result.Message, "Customer not found", StringComparison.OrdinalIgnoreCase))
            {
                return NotFound(result);
            }

            if (string.Equals(result.Message, "Concurrency conflict", StringComparison.OrdinalIgnoreCase))
            {
                return StatusCode(StatusCodes.Status409Conflict, result);
            }

            return BadRequest(result);
        }

        // Record UPDATE or DEACTIVATE audit event (IBMSBE-Audit-02)
        var resolvedTenantId = tenantId ?? 1;
        if (request.IsActive == false)
        {
            await _auditService.RecordCustomerDeactivatedAsync(
                resolvedTenantId,
                id,
                result.Data?.Name ?? "Customer",
                GetUserId(),
                GetUserName(),
                "Customer deactivated via profile update",
                GetClientIpAddress());
        }
        else
        {
            await _auditService.RecordCustomerUpdatedAsync(
                resolvedTenantId,
                id,
                result.Data?.Name ?? "Customer",
                GetUserId(),
                GetUserName(),
                request,
                GetClientIpAddress());
        }

        return Ok(result);
    }

    /// <summary>
    /// IBMSBE-011 / IBMSBE-Audit-02: PATCH /api/v1/customers/{id}/deactivate
    /// Deactivate customer record without physical deletion.
    /// </summary>
    [Authorize(Roles = "TenantAdmin,SuperAdmin")]
    [HttpPatch("{id:int}/deactivate")]
    [ProducesResponseType(typeof(ApiResponse<CustomerDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<CustomerDto>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> DeactivateCustomer([FromRoute] int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue && !User.IsInRole("SuperAdmin"))
        {
            return Forbid();
        }

        var result = await _customerService.DeactivateCustomerAsync(id, tenantId);

        if (!result.Success)
        {
            return NotFound(result);
        }

        // Record DEACTIVATE audit event (IBMSBE-Audit-02)
        await _auditService.RecordCustomerDeactivatedAsync(
            tenantId ?? 1,
            id,
            result.Data?.Name ?? "Customer",
            GetUserId(),
            GetUserName(),
            "Deactivated via customer management",
            GetClientIpAddress());

        return Ok(result);
    }

    /// <summary>
    /// IBMSBE-013 / IBMSBE-Audit-02: DELETE /api/v1/customers/{id}
    /// History Protection: Physical deletion is prohibited; deactivates customer to preserve business history.
    /// </summary>
    [Authorize(Roles = "TenantAdmin,SuperAdmin")]
    [HttpDelete("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<CustomerDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<CustomerDto>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> DeleteCustomer([FromRoute] int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue && !User.IsInRole("SuperAdmin"))
        {
            return Forbid();
        }

        var result = await _customerService.DeactivateCustomerAsync(id, tenantId);

        if (!result.Success)
        {
            return NotFound(result);
        }

        // Record DEACTIVATE audit event (IBMSBE-Audit-02)
        await _auditService.RecordCustomerDeactivatedAsync(
            tenantId ?? 1,
            id,
            result.Data?.Name ?? "Customer",
            GetUserId(),
            GetUserName(),
            "Deactivated via physical deletion prevention",
            GetClientIpAddress());

        result.Message = "Customer deactivated successfully. Historical records have been preserved.";
        return Ok(result);
    }

    /// <summary>
    /// GET /api/v1/customers/{id}/audit: Retrieve customer audit trail history.
    /// Powers the Frontend Audit Tab (IBMSFE-013) displaying user, action, timestamp, and changes.
    /// </summary>
    [HttpGet("{id:int}/audit")]
    [ProducesResponseType(typeof(ApiResponse<List<AuditLog>>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetCustomerAuditHistory([FromRoute] int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue && !User.IsInRole("SuperAdmin"))
        {
            return Forbid();
        }

        var resolvedTenantId = tenantId ?? 1;
        var auditLogs = await _auditService.GetCustomerAuditHistoryAsync(resolvedTenantId, id);
        return Ok(ApiResponse<List<AuditLog>>.Ok(auditLogs, "Customer audit history retrieved successfully."));
    }

    /// <summary>
    /// IBMSBE-012: GET /api/v1/customers/{id}/details
    /// Retrieve customer details with supporting information (profile, billing/shipping addresses, financial summary).
    /// </summary>
    [HttpGet("{id:int}/details")]
    [ProducesResponseType(typeof(ApiResponse<CustomerDetailsDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<CustomerDetailsDto>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetCustomerDetails([FromRoute] int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue && !User.IsInRole("SuperAdmin"))
        {
            return Forbid();
        }

        var result = await _customerService.GetCustomerDetailsAsync(id, tenantId);

        if (!result.Success)
        {
            return NotFound(result);
        }

        if (User.IsInRole("Customer") && !IsAuthorizedCustomer(result.Data?.Customer?.Email))
        {
            return NotFound(ApiResponse<CustomerDetailsDto>.Fail("Customer not found", $"Customer with ID {id} was not found."));
        }

        return Ok(result);
    }

    private int? GetTenantId()
    {
        var tenantClaim = User.FindFirst("TenantId")?.Value
                          ?? User.FindFirst("tenant_id")?.Value;

        if (int.TryParse(tenantClaim, out var tenantId) && tenantId > 0)
        {
            return tenantId;
        }

        if (User.IsInRole("SuperAdmin"))
        {
            if (Request.Headers.TryGetValue("X-Tenant-Id", out var headerVal) &&
                int.TryParse(headerVal, out var headerTenantId) && headerTenantId > 0)
            {
                return headerTenantId;
            }

            if (Request.Query.TryGetValue("tenantId", out var queryVal) &&
                int.TryParse(queryVal, out var queryTenantId) && queryTenantId > 0)
            {
                return queryTenantId;
            }

            return null; // Cross-tenant access for SuperAdmin
        }

        return null;
    }

    private bool IsAuthorizedCustomer(string? customerEmail)
    {
        if (string.IsNullOrWhiteSpace(customerEmail)) return false;

        var userEmail = User.FindFirst(ClaimTypes.Email)?.Value
                        ?? User.FindFirst("email")?.Value;

        return string.Equals(customerEmail.Trim(), userEmail?.Trim(), StringComparison.OrdinalIgnoreCase);
    }

    private string GetUserId() => User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value ?? "system";
    private string GetUserName() => User.FindFirst(ClaimTypes.Name)?.Value ?? User.FindFirst("name")?.Value ?? "Authorized User";
    private string? GetClientIpAddress() => HttpContext.Connection.RemoteIpAddress?.ToString();
}

