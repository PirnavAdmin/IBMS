using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Settings;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers;

[Authorize]
[ApiController]
[Route("api/v1/settings/country")]
[Consumes("application/json")]
public class CountrySettingsController : ControllerBase
{
    private readonly ICountrySettingService _countrySettingService;

    public CountrySettingsController(ICountrySettingService countrySettingService)
    {
        _countrySettingService = countrySettingService;
    }

    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<CountrySettingsResponseDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetCountrySettings()
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _countrySettingService.GetSettingsAsync(tenantId.Value);
        return Ok(result);
    }

    [HttpPut]
    [Authorize(Roles = "TenantAdmin,SuperAdmin,Admin,BillingManager,User")]
    [ProducesResponseType(typeof(ApiResponse<CountrySettingsResponseDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> UpdateCountrySettings([FromBody] UpdateCountrySettingsRequest request)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        if (request == null)
        {
            return BadRequest(ApiResponse<CountrySettingsResponseDto>.Fail("Request body cannot be null."));
        }

        var result = await _countrySettingService.UpdateSettingsAsync(tenantId.Value, request);
        if (!result.Success)
        {
            return BadRequest(result);
        }

        return Ok(result);
    }

    private int? GetTenantId()
    {
        if (User.IsInRole("SuperAdmin"))
        {
            if (Request?.Headers != null && Request.Headers.TryGetValue("X-Tenant-Id", out var h) && int.TryParse(h, out var hId) && hId > 0)
                return hId;

            return 1;
        }

        var claim = User.FindFirst("TenantId")?.Value ?? User.FindFirst("tenant_id")?.Value;
        if (int.TryParse(claim, out var tid) && tid > 0) return tid;

        return null;
    }
}
