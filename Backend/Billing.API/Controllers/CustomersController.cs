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
    /// Create a new customer record scoped to current tenant.
    /// </summary>
    [Authorize(Roles = "TenantAdmin,SuperAdmin")]
    [HttpPost]
    [ProducesResponseType(StatusCodes.Status200OK)]
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
            GetUserName(),
            request);

        return CreatedAtAction(
            nameof(GetCustomerById),
            new { id = result.Data!.Id },
            result);
    }

    /// <summary>
    /// Retrieve a paginated list of customers with search, filtering, and sorting.
    /// </summary>
    /// <param name="pageNumber">Page number for pagination (Default: 1)</param>
    /// <param name="pageSize">Number of records per page (Default: 10, Max: 100)</param>
    /// <param name="status">Filter by status: Active, Inactive, or All</param>
    /// <param name="search">Search text across customer code, name, email, phone, company, or tax ID</param>
    /// <param name="customerType">Filter by customer type: Business or Individual</param>
    /// <param name="taxId">Filter directly by Tax / GST / VAT ID</param>
    /// <param name="sortBy">Sort field: createdAt, name, email, companyName, code, updatedAt</param>
    /// <param name="sortOrder">Sort direction: asc or desc (Default: desc)</param>
    [Authorize(Roles = "TenantAdmin,SuperAdmin")]
    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetCustomers(
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 10,
        [FromQuery] CustomerStatus status = CustomerStatus.Active,
        [FromQuery] string? search = null,
        [FromQuery] string? customerType = null,
        [FromQuery] string? taxId = null,
        [FromQuery] string? outstanding = null,
        [FromQuery] string? sortBy = "createdAt",
        [FromQuery] string? sortOrder = "desc")
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue && !User.IsInRole("SuperAdmin"))
        {
            return Forbid();
        }

        bool? resolvedIsActive = null;

        // 1. If frontend explicitly passed isActive query parameter (e.g. ?isActive=false or ?isActive=true)
        if (Request.Query.TryGetValue("isActive", out var isActiveVal) &&
            bool.TryParse(isActiveVal, out var parsedIsActive))
        {
            resolvedIsActive = parsedIsActive;
        }
        // 2. If status was explicitly passed in query string (from Frontend or Swagger)
        else if (Request.Query.TryGetValue("status", out var statusQueryVal))
        {
            var s = statusQueryVal.ToString().Trim();
            if (string.Equals(s, "inactive", StringComparison.OrdinalIgnoreCase))
                resolvedIsActive = false;
            else if (string.Equals(s, "active", StringComparison.OrdinalIgnoreCase))
                resolvedIsActive = true;
            else if (string.Equals(s, "all", StringComparison.OrdinalIgnoreCase) || string.IsNullOrWhiteSpace(s))
                resolvedIsActive = null;
            else
                resolvedIsActive = status switch
                {
                    CustomerStatus.Active => true,
                    CustomerStatus.Inactive => false,
                    _ => null
                };
        }
        // 3. Fallback to status parameter (e.g. Swagger default)
        else
        {
            // If neither 'status' nor 'isActive' was in query string (frontend default request on "All Statuses"), return all
            resolvedIsActive = null;
        }

        var effectiveSearch = !string.IsNullOrWhiteSpace(search)
            ? search.Trim()
            : (Request.Query.TryGetValue("search", out var searchVal) ? searchVal.ToString().Trim() : null);

        var effectiveCustomerType = !string.IsNullOrWhiteSpace(customerType)
            ? customerType.Trim()
            : (Request.Query.TryGetValue("customerType", out var cTypeVal) ? cTypeVal.ToString().Trim() : null);

        var effectiveTaxId = !string.IsNullOrWhiteSpace(taxId)
            ? taxId.Trim()
            : (Request.Query.TryGetValue("taxId", out var taxIdVal) ? taxIdVal.ToString().Trim() : null);

        var effectiveOutstanding = !string.IsNullOrWhiteSpace(outstanding)
            ? outstanding.Trim()
            : (Request.Query.TryGetValue("outstanding", out var outstandingVal) ? outstandingVal.ToString().Trim() : null);

        var effectiveSortBy = !string.IsNullOrWhiteSpace(sortBy)
            ? sortBy.Trim()
            : (Request.Query.TryGetValue("sortBy", out var sortByVal) ? sortByVal.ToString().Trim() : "createdAt");

        var effectiveSortOrder = !string.IsNullOrWhiteSpace(sortOrder)
            ? sortOrder.Trim()
            : (Request.Query.TryGetValue("sortOrder", out var sortOrderVal) ? sortOrderVal.ToString().Trim() : "desc");

        var query = new CustomerQueryParameters
        {
            PageNumber = pageNumber,
            PageSize = pageSize,
            Search = string.IsNullOrWhiteSpace(effectiveSearch) ? null : effectiveSearch,
            CustomerType = string.IsNullOrWhiteSpace(effectiveCustomerType) ? null : effectiveCustomerType,
            TaxId = string.IsNullOrWhiteSpace(effectiveTaxId) ? null : effectiveTaxId,
            Outstanding = string.IsNullOrWhiteSpace(effectiveOutstanding) ? null : effectiveOutstanding,
            IsActive = resolvedIsActive,
            SortBy = effectiveSortBy,
            SortOrder = effectiveSortOrder
        };

        var result = await _customerService.GetCustomersAsync(query, tenantId);
        return Ok(result);
    }

    /// <summary>
    /// Retrieve customer details and profile by customer ID.
    /// </summary>
    [HttpGet("{id:int}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
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
    /// Update existing customer profile information.
    /// </summary>
    [Authorize(Roles = "TenantAdmin,SuperAdmin")]
    [HttpPut("{id:int}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
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
                GetUserName(),
                "Customer deactivated via profile update");
        }
        else
        {
            await _auditService.RecordCustomerUpdatedAsync(
                resolvedTenantId,
                id,
                result.Data?.Name ?? "Customer",
                GetUserName(),
                request);
        }

        return Ok(result);
    }

    /// <summary>
    /// Deactivate customer record without physical deletion.
    /// </summary>
    [Authorize(Roles = "TenantAdmin,SuperAdmin")]
    [HttpPatch("{id:int}/deactivate")]
    [ProducesResponseType(StatusCodes.Status200OK)]
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
            GetUserName(),
            "Deactivated via customer management");

        return Ok(result);
    }

    /// <summary>
    /// Deactivate customer record to preserve business and transaction history.
    /// </summary>
    [Authorize(Roles = "TenantAdmin,SuperAdmin")]
    [HttpDelete("{id:int}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
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
            GetUserName(),
            "Deactivated via physical deletion prevention");

        result.Message = "Customer deactivated successfully. Historical records have been preserved.";
        return Ok(result);
    }

    /// <summary>
    /// Retrieve customer audit trail history displaying user, action, timestamp, and changes.
    /// </summary>
    [HttpGet("{id:int}/audit")]
    [ProducesResponseType(StatusCodes.Status200OK)]
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
    /// Retrieve customer details with supporting information (profile, billing/shipping addresses, financial summary).
    /// </summary>
    [HttpGet("{id:int}/details")]
    [ProducesResponseType(StatusCodes.Status200OK)]
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

    private string GetUserName() => User.FindFirst(ClaimTypes.Name)?.Value ?? User.FindFirst("name")?.Value ?? "Authorized User";
}

