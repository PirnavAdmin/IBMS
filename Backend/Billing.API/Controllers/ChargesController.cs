using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Charges;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers;

[Authorize]
[ApiController]
[Route("api/v1/settings/charges")]
[Route("api/v1/charges")]
[Consumes("application/json")]
public class ChargesController : ControllerBase
{
    private readonly IChargeSettingService _chargeSettingService;
    private readonly IChargeCalculationService _chargeCalculationService;

    public ChargesController(
        IChargeSettingService chargeSettingService,
        IChargeCalculationService chargeCalculationService)
    {
        _chargeSettingService = chargeSettingService;
        _chargeCalculationService = chargeCalculationService;
    }

    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetCharges(
        [FromQuery] bool? activeOnly = null,
        [FromQuery] string? chargeType = null)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _chargeSettingService.GetChargesAsync(tenantId.Value, activeOnly, chargeType);
        return Ok(result);
    }

    [HttpGet("{id:int}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetChargeById([FromRoute] int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _chargeSettingService.GetChargeByIdAsync(id, tenantId.Value);
        if (!result.Success) return NotFound(result);

        return Ok(result);
    }

    [Authorize(Roles = "TenantAdmin,SuperAdmin")]
    [HttpPost]
    [ProducesResponseType(StatusCodes.Status201Created)]
    public async Task<IActionResult> CreateCharge([FromBody] CreateChargeRequest request)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _chargeSettingService.CreateChargeAsync(request, tenantId.Value);
        if (!result.Success)
        {
            if (result.ErrorCode == "CHARGE_CODE_EXISTS" || (result.Message != null && result.Message.Contains("already exists")))
            {
                return Conflict(result);
            }
            return BadRequest(result);
        }

        return CreatedAtAction(nameof(GetChargeById), new { id = result.Data!.Id }, result);
    }

    [Authorize(Roles = "TenantAdmin,SuperAdmin")]
    [HttpPut("{id:int}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> UpdateCharge([FromRoute] int id, [FromBody] UpdateChargeRequest request)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _chargeSettingService.UpdateChargeAsync(id, request, tenantId.Value);
        if (!result.Success)
        {
            if (result.ErrorCode == "CONCURRENCY_CONFLICT" || (result.Message != null && result.Message.Contains("concurrency", StringComparison.OrdinalIgnoreCase)))
            {
                return Conflict(result);
            }
            if (result.Message != null && result.Message.Contains("not found", StringComparison.OrdinalIgnoreCase))
            {
                return NotFound(result);
            }
            return BadRequest(result);
        }

        return Ok(result);
    }

    [Authorize(Roles = "TenantAdmin,SuperAdmin")]
    [HttpDelete("{id:int}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> DeleteCharge([FromRoute] int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _chargeSettingService.DeleteChargeAsync(id, tenantId.Value);
        if (!result.Success) return NotFound(result);

        return Ok(result);
    }

    [HttpPost("calculate")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> CalculateCharges([FromBody] CalculateChargesRequest request)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _chargeCalculationService.CalculateChargesAsync(request, tenantId.Value);
        if (!result.Success) return BadRequest(result);

        return Ok(result);
    }

    private int? GetTenantId()
    {
        var claim = User.FindFirst("TenantId")?.Value ?? User.FindFirst("tenant_id")?.Value;
        if (int.TryParse(claim, out var tid) && tid > 0) return tid;

        if (User.IsInRole("SuperAdmin"))
        {
            if (Request.Headers.TryGetValue("X-Tenant-Id", out var h) && int.TryParse(h, out var hId) && hId > 0)
                return hId;
            return 1;
        }

        return null;
    }
}
