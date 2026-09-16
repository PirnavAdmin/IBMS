using System.Security.Claims;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers;

/// <summary>
/// Controller for managing product categories, status activation/deactivation, and catalog grouping. (IBMSBE-014)
/// </summary>
[Authorize]
[ApiController]
[Route("api/v1/categories")]
[Consumes("application/json")]
public class CategoriesController : ControllerBase
{
    private readonly ICategoryService _categoryService;
    private readonly ILogger<CategoriesController> _logger;

    public CategoriesController(
        ICategoryService categoryService,
        ILogger<CategoriesController> logger)
    {
        _categoryService = categoryService;
        _logger = logger;
    }

    /// <summary>
    /// Retrieve a list of product categories with search, status filtering, and optional pagination. (IBMSBE-014)
    /// </summary>
    /// <param name="search">Search text across category name and description</param>
    /// <param name="status">Filter by status: Active, Inactive, or All</param>
    /// <param name="isActive">Boolean flag to filter active or inactive categories</param>
    /// <param name="pageNumber">Page number for pagination (optional, default: 1)</param>
    /// <param name="pageSize">Number of items per page (optional, default: 10, max: 100)</param>
    /// <param name="sortBy">Sort field: name, status, createdAt</param>
    /// <param name="sortOrder">Sort direction: asc or desc (default: asc)</param>
    /// <param name="paged">If true, returns a paginated result; otherwise returns full list</param>
    [Authorize(Roles = "TenantAdmin,SuperAdmin,User,Customer")]
    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetCategories(
        [FromQuery] string? search = null,
        [FromQuery] string? status = null,
        [FromQuery] bool? isActive = null,
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 10,
        [FromQuery] string? sortBy = "name",
        [FromQuery] string? sortOrder = "asc",
        [FromQuery] bool paged = false)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue && !User.IsInRole("SuperAdmin"))
        {
            return Forbid();
        }

        if (paged)
        {
            var pagedResult = await _categoryService.GetPagedCategoriesAsync(
                tenantId,
                search,
                status,
                isActive,
                pageNumber,
                pageSize,
                sortBy,
                sortOrder);
            return Ok(pagedResult);
        }

        var listResult = await _categoryService.GetAllCategoriesAsync(
            tenantId,
            search,
            status,
            isActive);
        return Ok(listResult);
    }

    /// <summary>
    /// Retrieve product category details and associated product count by category ID. (IBMSBE-014)
    /// </summary>
    /// <param name="id">The unique identifier of the category</param>
    [Authorize(Roles = "TenantAdmin,SuperAdmin,User,Customer")]
    [HttpGet("{id:int}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetCategoryById([FromRoute] int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue && !User.IsInRole("SuperAdmin"))
        {
            return Forbid();
        }

        var result = await _categoryService.GetCategoryByIdAsync(id, tenantId);
        if (!result.Success)
        {
            return NotFound(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// Create a new product category scoped to current tenant with duplicate name validation. (IBMSBE-014)
    /// </summary>
    /// <param name="request">Category creation details including name and optional description</param>
    [Authorize(Roles = "TenantAdmin,SuperAdmin")]
    [HttpPost]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> CreateCategory([FromBody] CreateCategoryRequest request)
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

        var result = await _categoryService.CreateCategoryAsync(request, tenantId.Value);
        if (!result.Success)
        {
            return BadRequest(result);
        }

        return CreatedAtAction(
            nameof(GetCategoryById),
            new { id = result.Data!.Id },
            result);
    }

    /// <summary>
    /// Update existing product category information with duplicate name prevention. (IBMSBE-014)
    /// </summary>
    /// <param name="id">Category ID to update</param>
    /// <param name="request">Updated category fields</param>
    [Authorize(Roles = "TenantAdmin,SuperAdmin")]
    [HttpPut("{id:int}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UpdateCategory([FromRoute] int id, [FromBody] UpdateCategoryRequest request)
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

        var result = await _categoryService.UpdateCategoryAsync(id, request, tenantId.Value);
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
    /// Activate a product category. (IBMSBE-014)
    /// </summary>
    /// <param name="id">Category ID to activate</param>
    [Authorize(Roles = "TenantAdmin,SuperAdmin")]
    [HttpPatch("{id:int}/activate")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ActivateCategory([FromRoute] int id)
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

        var result = await _categoryService.ActivateCategoryAsync(id, tenantId.Value);
        if (!result.Success)
        {
            return NotFound(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// Deactivate a product category safely without deleting associated products. (IBMSBE-014)
    /// </summary>
    /// <param name="id">Category ID to deactivate</param>
    [Authorize(Roles = "TenantAdmin,SuperAdmin")]
    [HttpPatch("{id:int}/deactivate")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeactivateCategory([FromRoute] int id)
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

        var result = await _categoryService.DeactivateCategoryAsync(id, tenantId.Value);
        if (!result.Success)
        {
            return NotFound(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// Update product category active status with boolean query parameter. (IBMSBE-014)
    /// </summary>
    /// <param name="id">Category ID to update</param>
    /// <param name="isActive">Set true for Active, false for Inactive</param>
    [Authorize(Roles = "TenantAdmin,SuperAdmin")]
    [HttpPatch("{id:int}/status")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UpdateCategoryStatus([FromRoute] int id, [FromQuery] bool isActive)
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

        var result = await _categoryService.UpdateCategoryStatusAsync(id, isActive, tenantId.Value);
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

            return null; // Cross-tenant access for SuperAdmin
        }

        return null;
    }
}
