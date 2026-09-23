using System.Security.Claims;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Quotation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers;

[Authorize]
[ApiController]
[Route("api/v1/quotations")]
[Consumes("application/json")]
public class QuotationsController : ControllerBase
{
    private readonly IQuotationService _quotationService;
    private readonly ILogger<QuotationsController> _logger;

    public QuotationsController(
        IQuotationService quotationService,
        ILogger<QuotationsController> logger)
    {
        _quotationService = quotationService;
        _logger = logger;
    }

    /// <summary>
    /// Retrieve paginated list of quotations with search, status, and date filters.
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<PagedResult<QuotationResponse>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetQuotations([FromQuery] QuotationListFilterRequest filter)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue)
        {
            return Forbid();
        }

        var result = await _quotationService.GetPagedListAsync(filter ?? new QuotationListFilterRequest(), tenantId.Value);
        return Ok(result);
    }

    /// <summary>
    /// Retrieve complete quotation details by ID with line items and snapshot.
    /// </summary>
    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<QuotationDetailResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<QuotationDetailResponse>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetQuotationById([FromRoute] int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue)
        {
            return Forbid();
        }

        var result = await _quotationService.GetByIdAsync(id, tenantId.Value);
        if (!result.Success)
        {
            return NotFound(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// Create a new draft quotation.
    /// </summary>
    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<QuotationDetailResponse>), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ApiResponse<QuotationDetailResponse>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> CreateDraftQuotation([FromBody] CreateQuotationRequest request)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue)
        {
            return Forbid();
        }

        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var result = await _quotationService.CreateDraftAsync(request, tenantId.Value, userId);

        if (!result.Success)
        {
            return BadRequest(result);
        }

        return CreatedAtAction(
            nameof(GetQuotationById),
            new { id = result.Data!.Id },
            result);
    }

    /// <summary>
    /// Update an existing draft quotation with Draft status and RowVersion validation.
    /// </summary>
    [HttpPut("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<QuotationDetailResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<QuotationDetailResponse>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<QuotationDetailResponse>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<QuotationDetailResponse>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> UpdateDraftQuotation([FromRoute] int id, [FromBody] UpdateQuotationRequest request)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue)
        {
            return Forbid();
        }

        var result = await _quotationService.UpdateDraftAsync(id, request, tenantId.Value);

        if (!result.Success)
        {
            if (string.Equals(result.ErrorCode, "CONCURRENCY_CONFLICT", StringComparison.OrdinalIgnoreCase))
            {
                return Conflict(result);
            }

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

            return 1;
        }

        return null;
    }
}
