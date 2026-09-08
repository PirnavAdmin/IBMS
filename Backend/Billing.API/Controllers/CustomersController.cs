using System.Security.Claims;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers;

[ApiController]
[Route("api/v1/customers")]
[Consumes("application/json")]
[Produces("application/json")]
public class CustomersController : ControllerBase
{
    private readonly ICustomerService _customerService;
    private readonly ILogger<CustomersController> _logger;

    public CustomersController(
        ICustomerService customerService,
        ILogger<CustomersController> logger)
    {
        _customerService = customerService;
        _logger = logger;
    }

    /// <summary>
    /// IBMSBE-001: POST /api/v1/customers
    /// Create a new customer record with validations.
    /// </summary>
    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<CustomerDto>), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ApiResponse<CustomerDto>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> CreateCustomer([FromBody] CreateCustomerRequest request)
    {
        var tenantId = GetTenantId();
        var result = await _customerService.CreateCustomerAsync(request, tenantId);

        if (!result.Success)
        {
            return BadRequest(result);
        }

        return CreatedAtAction(
            nameof(GetCustomerById),
            new { id = result.Data!.Id },
            result);
    }

    /// <summary>
    /// IBMSBE-002: GET /api/v1/customers
    /// Retrieve a paginated list of customers with search, sorting, and status filtering.
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<PagedResult<CustomerDto>>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetCustomers([FromQuery] CustomerQueryParameters query)
    {
        var tenantId = GetTenantId();
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
    public async Task<IActionResult> GetCustomerById([FromRoute] int id)
    {
        var tenantId = GetTenantId();
        var result = await _customerService.GetCustomerByIdAsync(id, tenantId);

        if (!result.Success)
        {
            return NotFound(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// IBMSBE-004: PUT /api/v1/customers/{id}
    /// Update existing customer profile information.
    /// </summary>
    [HttpPut("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<CustomerDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<CustomerDto>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<CustomerDto>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> UpdateCustomer([FromRoute] int id, [FromBody] UpdateCustomerRequest request)
    {
        var tenantId = GetTenantId();
        var result = await _customerService.UpdateCustomerAsync(id, request, tenantId);

        if (!result.Success)
        {
            if (string.Equals(result.Message, "Customer not found", StringComparison.OrdinalIgnoreCase))
            {
                return NotFound(result);
            }

            return BadRequest(result);
        }

        return Ok(result);
    }

    private int GetTenantId()
    {
        var tenantClaim = User.FindFirst("TenantId")?.Value
                          ?? User.FindFirst("tenant_id")?.Value;

        if (int.TryParse(tenantClaim, out var tenantId) && tenantId > 0)
        {
            return tenantId;
        }

        return 1; // Default tenant fallback for development/single-tenant scenarios
    }
}
