using System.Security.Claims;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers;

[Authorize]
[ApiController]
[Route("api/v1/products")]
[Consumes("application/json")]
public class ProductsController : ControllerBase
{
    private readonly IProductService _productService;
    private readonly ILogger<ProductsController> _logger;

    public ProductsController(
        IProductService productService,
        ILogger<ProductsController> logger)
    {
        _productService = productService;
        _logger = logger;
    }

    /// <summary>
    /// Create a new product or service record scoped to current tenant. (IBMSBE-001)
    /// </summary>
    [Authorize(Roles = "TenantAdmin,SuperAdmin")]
    [HttpPost]
    [ProducesResponseType(StatusCodes.Status201Created)]
    public async Task<IActionResult> CreateProduct([FromBody] CreateProductRequest request)
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

        var result = await _productService.CreateProductAsync(request, tenantId.Value);

        if (!result.Success)
        {
            return BadRequest(result);
        }

        return CreatedAtAction(
            nameof(GetProductById),
            new { id = result.Data!.Id },
            result);
    }

    /// <summary>
    /// Retrieve a paginated list of products with search, filtering, and sorting. (IBMSBE-002)
    /// </summary>
    [Authorize(Roles = "TenantAdmin,SuperAdmin,User,Customer")]
    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetProducts(
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 10,
        [FromQuery] string? search = null,
        [FromQuery] string? category = null,
        [FromQuery] int? categoryId = null,
        [FromQuery] string? status = null,
        [FromQuery] bool? isActive = null,
        [FromQuery] string? type = null,
        [FromQuery] string? sortBy = "createdAt",
        [FromQuery] string? sortOrder = "desc")
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue && !User.IsInRole("SuperAdmin"))
        {
            return Forbid();
        }

        // Handle explicit query parameter overrides
        bool? resolvedIsActive = isActive;
        if (!resolvedIsActive.HasValue && Request.Query.TryGetValue("isActive", out var isActiveQueryVal) &&
            bool.TryParse(isActiveQueryVal, out var parsedActive))
        {
            resolvedIsActive = parsedActive;
        }

        var query = new ProductQueryParameters
        {
            PageNumber = pageNumber,
            PageSize = pageSize,
            Search = string.IsNullOrWhiteSpace(search) ? null : search.Trim(),
            Category = string.IsNullOrWhiteSpace(category) ? null : category.Trim(),
            CategoryId = categoryId,
            Status = string.IsNullOrWhiteSpace(status) ? null : status.Trim(),
            IsActive = resolvedIsActive,
            Type = string.IsNullOrWhiteSpace(type) ? null : type.Trim(),
            SortBy = string.IsNullOrWhiteSpace(sortBy) ? "createdAt" : sortBy.Trim(),
            SortOrder = string.IsNullOrWhiteSpace(sortOrder) ? "desc" : sortOrder.Trim()
        };

        var result = await _productService.GetProductsAsync(query, tenantId);
        return Ok(result);
    }

    /// <summary>
    /// Retrieve product details and specifications by product ID. (IBMSBE-003)
    /// </summary>
    [Authorize(Roles = "TenantAdmin,SuperAdmin,User,Customer")]
    [HttpGet("{id:int}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetProductById([FromRoute] int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue && !User.IsInRole("SuperAdmin"))
        {
            return Forbid();
        }

        var result = await _productService.GetProductByIdAsync(id, tenantId);

        if (!result.Success)
        {
            return NotFound(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// Update existing product information. (IBMSBE-004)
    /// </summary>
    [Authorize(Roles = "TenantAdmin,SuperAdmin")]
    [HttpPut("{id:int}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdateProduct([FromRoute] int id, [FromBody] UpdateProductRequest request)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue && !User.IsInRole("SuperAdmin"))
        {
            return Forbid();
        }

        var result = await _productService.UpdateProductAsync(id, request, tenantId);

        if (!result.Success)
        {
            if (result.Message.Contains("not found", StringComparison.OrdinalIgnoreCase))
            {
                return NotFound(result);
            }
            return BadRequest(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// Deactivate product record safely without physical deletion to protect historical invoice integrity. (IBMSBE-012)
    /// </summary>
    [Authorize(Roles = "TenantAdmin,SuperAdmin")]
    [HttpPatch("{id:int}/deactivate")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> DeactivateProduct([FromRoute] int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue && !User.IsInRole("SuperAdmin"))
        {
            return Forbid();
        }

        var result = await _productService.DeactivateProductAsync(id, tenantId);
        if (!result.Success)
        {
            return NotFound(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// Deactivate product record to preserve financial and historical invoice records. (IBMSBE-012)
    /// </summary>
    [Authorize(Roles = "TenantAdmin,SuperAdmin")]
    [HttpDelete("{id:int}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> DeleteProduct([FromRoute] int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue && !User.IsInRole("SuperAdmin"))
        {
            return Forbid();
        }

        var result = await _productService.DeactivateProductAsync(id, tenantId);
        if (!result.Success)
        {
            return NotFound(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// Validate that product is active and eligible for invoice line item selection. (IBMSBE-011)
    /// </summary>
    [Authorize(Roles = "TenantAdmin,SuperAdmin,User")]
    [HttpGet("{id:int}/validate-invoice")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> ValidateProductForInvoice([FromRoute] int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue)
        {
            if (User.IsInRole("SuperAdmin"))
            {
                return BadRequest(new { success = false, message = "Target tenant ID must be specified via X-Tenant-Id header for SuperAdmin." });
            }
            return Forbid();
        }

        var result = await _productService.ValidateProductForInvoicingAsync(id, tenantId.Value);
        if (!result.Success)
        {
            if (result.Message.Contains("not found", StringComparison.OrdinalIgnoreCase))
            {
                return NotFound(result);
            }
            return BadRequest(result);
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

            return 1; // Default to tenant 1 (Default Organization) for SuperAdmin if not explicitly specified
        }

        return null;
    }
}
