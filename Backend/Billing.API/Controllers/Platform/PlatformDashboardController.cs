using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Platform;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers.Platform;

/// <summary>
/// Authoritative Platform Dashboard API for Super Administrators.
/// </summary>
[ApiController]
[Route("api/v1/platform/dashboard")]
[Authorize(Policy = "SuperAdminPolicy")]
[Produces("application/json")]
public class PlatformDashboardController : ControllerBase
{
    private readonly IPlatformAdministrationService _platformService;

    public PlatformDashboardController(IPlatformAdministrationService platformService)
    {
        _platformService = platformService;
    }

    /// <summary>
    /// Retrieves authoritative platform overview metrics and recent events without cross-currency financial pollution.
    /// </summary>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Authoritative platform summary metrics.</returns>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<PlatformDashboardDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetDashboardSummary(CancellationToken cancellationToken)
    {
        var summary = await _platformService.GetDashboardSummaryAsync(cancellationToken);
        return Ok(ApiResponse<PlatformDashboardDto>.Ok(summary, "Platform dashboard summary retrieved successfully."));
    }
}
