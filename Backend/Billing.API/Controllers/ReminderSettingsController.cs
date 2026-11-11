using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Settings;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers;

[Authorize]
[ApiController]
[Route("api/v1/settings/reminders")]
[Consumes("application/json")]
[Produces("application/json")]
public class ReminderSettingsController : ControllerBase
{
    private readonly IReminderSettingService _reminderSettingService;

    public ReminderSettingsController(IReminderSettingService reminderSettingService)
    {
        _reminderSettingService = reminderSettingService;
    }

    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<ReminderSettingsDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetReminderSettings(CancellationToken cancellationToken)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _reminderSettingService.GetSettingsAsync(tenantId.Value, cancellationToken);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPut]
    [Authorize(Roles = "TenantAdmin,SuperAdmin,Admin,BillingManager,User")]
    [ProducesResponseType(typeof(ApiResponse<ReminderSettingsDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> UpdateReminderSettings(
        [FromBody] UpdateReminderSettingsRequest request,
        CancellationToken cancellationToken)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        if (request == null)
            return BadRequest(ApiResponse<ReminderSettingsDto>.Fail("Request body cannot be null."));

        var result = await _reminderSettingService.UpdateSettingsAsync(
            tenantId.Value,
            request,
            User?.Identity?.Name,
            cancellationToken);

        return result.Success ? Ok(result) : BadRequest(result);
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
