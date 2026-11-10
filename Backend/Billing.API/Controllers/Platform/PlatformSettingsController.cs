using System.Security.Claims;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Platform;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers.Platform;

/// <summary>
/// Platform Settings APIs for Super Administrators.
/// </summary>
[ApiController]
[Route("api/v1/platform/settings")]
[Authorize(Policy = "SuperAdminPolicy")]
[Produces("application/json")]
public class PlatformSettingsController : ControllerBase
{
    private readonly IPlatformAdministrationService _platformService;

    public PlatformSettingsController(IPlatformAdministrationService platformService)
    {
        _platformService = platformService;
    }

    /// <summary>
    /// Retrieves current platform-wide operational and security configuration.
    /// </summary>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Platform settings.</returns>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<PlatformSettingsDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetPlatformSettings(CancellationToken cancellationToken)
    {
        var settings = await _platformService.GetPlatformSettingsAsync(cancellationToken);
        return Ok(ApiResponse<PlatformSettingsDto>.Ok(settings, "Platform settings retrieved successfully."));
    }

    /// <summary>
    /// Updates platform-wide operational and security configuration with audit logging.
    /// </summary>
    /// <param name="request">Updated platform settings.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Updated platform settings.</returns>
    [HttpPut]
    [ProducesResponseType(typeof(ApiResponse<PlatformSettingsDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> UpdatePlatformSettings(
        [FromBody] UpdatePlatformSettingsRequest request,
        CancellationToken cancellationToken)
    {
        var currentUserName = GetCurrentUserName();
        var (success, message, updatedSettings, errorCode) = await _platformService.UpdatePlatformSettingsAsync(
            request, currentUserName, cancellationToken);

        if (!success)
        {
            if (errorCode == "CONCURRENCY_CONFLICT" || errorCode?.Contains("CONFLICT") == true)
            {
                return Conflict(ApiResponse<object>.Fail(message, errors: null, errorCode: errorCode));
            }
            return BadRequest(ApiResponse<object>.Fail(message, errors: null, errorCode: errorCode ?? "SETTINGS_UPDATE_FAILED"));
        }

        return Ok(ApiResponse<PlatformSettingsDto>.Ok(updatedSettings!, message));
    }

    private string GetCurrentUserName()
    {
        return User?.FindFirst(ClaimTypes.Name)?.Value
               ?? User?.FindFirst(ClaimTypes.NameIdentifier)?.Value
               ?? User?.Identity?.Name
               ?? "SuperAdmin";
    }
}
