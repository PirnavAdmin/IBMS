using System.Security.Claims;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Discount;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Billing.API.Controllers;

/// <summary>
/// Controller for Tenant Discount Configuration, Role Permissions, and Standalone Max Validation.
/// </summary>
[Authorize]
[ApiController]
[Route("api/v1/settings/discounts")]
[Consumes("application/json")]
[Produces("application/json")]
public class DiscountSettingsController : ControllerBase
{
    private readonly IDiscountSettingService _discountSettingService;
    private readonly ILogger<DiscountSettingsController> _logger;

    public DiscountSettingsController(
        IDiscountSettingService discountSettingService,
        ILogger<DiscountSettingsController> logger)
    {
        _discountSettingService = discountSettingService;
        _logger = logger;
    }

    /// <summary>
    /// GET /api/v1/settings/discounts - Retrieve tenant organization-level discount configuration and role permissions.
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<DiscountConfigurationDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<DiscountConfigurationDto>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> GetDiscountConfiguration()
    {
        var tenantId = GetTenantId();
        var result = await _discountSettingService.GetDiscountConfigurationAsync(tenantId);
        if (!result.Success)
            return BadRequest(result);

        return Ok(result);
    }

    /// <summary>
    /// PUT /api/v1/settings/discounts - Update tenant organization-level discount configuration.
    /// </summary>
    [HttpPut]
    [Authorize(Roles = "TenantAdmin,SuperAdmin,Admin,Manager")]
    [ProducesResponseType(typeof(ApiResponse<DiscountConfigurationDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<DiscountConfigurationDto>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<DiscountConfigurationDto>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> UpdateDiscountConfiguration([FromBody] UpdateDiscountConfigurationRequest request)
    {
        var tenantId = GetTenantId();
        var userName = GetUserName();

        var result = await _discountSettingService.UpdateDiscountConfigurationAsync(request, tenantId, userName);
        if (!result.Success)
        {
            if (string.Equals(result.ErrorCode, "CONCURRENCY_CONFLICT", StringComparison.OrdinalIgnoreCase))
                return StatusCode(StatusCodes.Status409Conflict, result);

            return BadRequest(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// GET /api/v1/settings/discounts/roles - Retrieve configured discount role permissions.
    /// </summary>
    [HttpGet("roles")]
    [ProducesResponseType(typeof(ApiResponse<List<DiscountRolePermissionDto>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<List<DiscountRolePermissionDto>>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> GetRolePermissions()
    {
        var tenantId = GetTenantId();
        var result = await _discountSettingService.GetRolePermissionsAsync(tenantId);
        if (!result.Success)
            return BadRequest(result);

        return Ok(result);
    }

    /// <summary>
    /// PUT /api/v1/settings/discounts/roles - Update configured discount role permissions.
    /// </summary>
    [HttpPut("roles")]
    [Authorize(Roles = "TenantAdmin,SuperAdmin,Admin,Manager")]
    [ProducesResponseType(typeof(ApiResponse<List<DiscountRolePermissionDto>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<List<DiscountRolePermissionDto>>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> UpdateRolePermissions([FromBody] UpdateDiscountRolePermissionsRequest request)
    {
        var tenantId = GetTenantId();
        var userName = GetUserName();

        var result = await _discountSettingService.UpdateRolePermissionsAsync(request, tenantId, userName);
        if (!result.Success)
            return BadRequest(result);

        return Ok(result);
    }

    /// <summary>
    /// POST /api/v1/settings/discounts/validate-max - Standalone endpoint to validate if a discount exceeds role/org limits.
    /// </summary>
    [HttpPost("validate-max")]
    [ProducesResponseType(typeof(ApiResponse<ValidateDiscountResultDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<ValidateDiscountResultDto>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> ValidateMaxDiscount([FromBody] ValidateDiscountRequest request)
    {
        var tenantId = GetTenantId();
        var userRole = GetUserRole();

        var result = await _discountSettingService.ValidateMaxDiscountAsync(request, tenantId, userRole);
        if (!result.Success)
            return BadRequest(result);

        return Ok(result);
    }

    private int GetTenantId()
    {
        var claim = User.FindFirst("TenantId")?.Value ?? User.FindFirst("tenant_id")?.Value;
        if (int.TryParse(claim, out var tId) && tId > 0)
            return tId;

        if (Request.Headers.TryGetValue("X-Tenant-Id", out var hVal) && int.TryParse(hVal, out var hId) && hId > 0)
            return hId;

        return 1;
    }

    private string GetUserRole()
    {
        return User.FindFirst(ClaimTypes.Role)?.Value
               ?? User.FindFirst("role")?.Value
               ?? User.FindFirst("Roles")?.Value
               ?? "Cashier";
    }

    private string GetUserName()
    {
        return User.FindFirst(ClaimTypes.Name)?.Value
               ?? User.FindFirst("name")?.Value
               ?? User.FindFirst(ClaimTypes.Email)?.Value
               ?? "Authorized User";
    }
}
