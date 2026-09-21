using System.Security.Claims;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Tax;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Billing.API.Controllers;

/// <summary>
/// Controller for Tax Engine settings, tax rate definitions, and tax calculations. (IBMSBE-001..005)
/// </summary>
[Authorize]
[ApiController]
[Route("api/v1/settings/taxes")]
[Consumes("application/json")]
[Produces("application/json")]
public class TaxSettingsController : ControllerBase
{
    private readonly ITaxSettingService _taxSettingService;
    private readonly ITaxCalculationService _taxCalculationService;
    private readonly ILogger<TaxSettingsController> _logger;

    public TaxSettingsController(
        ITaxSettingService taxSettingService,
        ITaxCalculationService taxCalculationService,
        ILogger<TaxSettingsController> logger)
    {
        _taxSettingService = taxSettingService;
        _taxCalculationService = taxCalculationService;
        _logger = logger;
    }

    /// <summary>
    /// GET /api/v1/settings/taxes - Retrieve tenant tax settings and list of configured tax rates. (IBMSBE-002)
    /// </summary>
    /// <param name="taxType">Filter by tax type: GST, CGST, SGST, IGST, VAT, Custom</param>
    /// <param name="status">Filter by status: Active, Inactive, All</param>
    /// <param name="isActive">Boolean filter for active or inactive taxes</param>
    /// <param name="applicationLevel">Filter by level: Item, Invoice, Both</param>
    [Authorize(Roles = "TenantAdmin,SuperAdmin,User,Customer")]
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<TaxSettingsDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetTaxSettings(
        [FromQuery] string? taxType = null,
        [FromQuery] string? status = null,
        [FromQuery] bool? isActive = null,
        [FromQuery] string? applicationLevel = null)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue && !User.IsInRole("SuperAdmin"))
        {
            return Forbid();
        }

        var result = await _taxSettingService.GetTaxSettingsAsync(
            tenantId ?? 1, taxType, status, isActive, applicationLevel);

        return Ok(result);
    }

    /// <summary>
    /// PUT /api/v1/settings/taxes - Update tenant tax settings and configurations. (IBMSBE-002)
    /// </summary>
    [Authorize(Roles = "TenantAdmin,SuperAdmin")]
    [HttpPut]
    [ProducesResponseType(typeof(ApiResponse<TaxSettingsDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<TaxSettingsDto>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> UpdateTaxSettings([FromBody] UpdateTaxSettingsRequest request)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue && !User.IsInRole("SuperAdmin"))
        {
            return Forbid();
        }

        var result = await _taxSettingService.UpdateTaxSettingsAsync(request, tenantId ?? 1);
        if (!result.Success)
        {
            if (result.ErrorCode == "TAX_CONFIGURATION_CONFLICT" || (result.Message != null && result.Message.Contains("conflict", StringComparison.OrdinalIgnoreCase)))
            {
                return Conflict(result);
            }
            return BadRequest(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// POST /api/v1/settings/taxes/calculate - Calculate taxes for items and invoice summary. (IBMSBE-003, IBMSBE-004)
    /// </summary>
    [Authorize(Roles = "TenantAdmin,SuperAdmin,User,Customer")]
    [HttpPost("calculate")]
    [ProducesResponseType(typeof(ApiResponse<TaxCalculationResultDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<TaxCalculationResultDto>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> CalculateTaxes([FromBody] TaxCalculationRequest request)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue && !User.IsInRole("SuperAdmin"))
        {
            return Forbid();
        }

        var result = await _taxCalculationService.CalculateTaxesAsync(request, tenantId ?? 1);
        if (!result.Success)
        {
            return BadRequest(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// GET /api/v1/settings/taxes/rates/{id} - Retrieve an individual tax rate by ID.
    /// </summary>
    [Authorize(Roles = "TenantAdmin,SuperAdmin,User")]
    [HttpGet("rates/{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<TaxRateDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<TaxRateDto>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetRateById([FromRoute] int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue && !User.IsInRole("SuperAdmin"))
        {
            return Forbid();
        }

        var result = await _taxSettingService.GetTaxRateByIdAsync(id, tenantId ?? 1);
        if (!result.Success)
        {
            return NotFound(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// POST /api/v1/settings/taxes/rates - Create a new tax rate. (IBMSBE-001)
    /// </summary>
    [Authorize(Roles = "TenantAdmin,SuperAdmin")]
    [HttpPost("rates")]
    [ProducesResponseType(typeof(ApiResponse<TaxRateDto>), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ApiResponse<TaxRateDto>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> CreateRate([FromBody] CreateTaxRateRequest request)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue && !User.IsInRole("SuperAdmin"))
        {
            return Forbid();
        }

        var result = await _taxSettingService.CreateTaxRateAsync(request, tenantId ?? 1);
        if (!result.Success)
        {
            return BadRequest(result);
        }

        return CreatedAtAction(nameof(GetRateById), new { id = result.Data!.Id }, result);
    }

    /// <summary>
    /// PUT /api/v1/settings/taxes/rates/{id} - Update an existing tax rate. (IBMSBE-001)
    /// </summary>
    [Authorize(Roles = "TenantAdmin,SuperAdmin")]
    [HttpPut("rates/{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<TaxRateDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<TaxRateDto>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<TaxRateDto>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UpdateRate([FromRoute] int id, [FromBody] UpdateTaxRateRequest request)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue && !User.IsInRole("SuperAdmin"))
        {
            return Forbid();
        }

        var result = await _taxSettingService.UpdateTaxRateAsync(id, request, tenantId ?? 1);
        if (!result.Success)
        {
            if (result.ErrorCode == "TAX_RATE_NOT_FOUND" || (result.Message != null && result.Message.Contains("not found", StringComparison.OrdinalIgnoreCase)))
                return NotFound(result);

            if (result.ErrorCode == "TAX_RATE_CODE_EXISTS" || result.ErrorCode == "TAX_CONFIGURATION_CONFLICT" ||
                (result.Message != null && (result.Message.Contains("already exists", StringComparison.OrdinalIgnoreCase) || result.Message.Contains("conflict", StringComparison.OrdinalIgnoreCase))))
            {
                return Conflict(result);
            }

            return BadRequest(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// DELETE /api/v1/settings/taxes/rates/{id} - Delete an existing tax rate.
    /// </summary>
    [Authorize(Roles = "TenantAdmin,SuperAdmin")]
    [HttpDelete("rates/{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteRate([FromRoute] int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue && !User.IsInRole("SuperAdmin"))
        {
            return Forbid();
        }

        var result = await _taxSettingService.DeleteTaxRateAsync(id, tenantId ?? 1);
        if (!result.Success)
        {
            return NotFound(result);
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
