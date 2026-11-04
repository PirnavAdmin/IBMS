using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Platform;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers.Platform;

/// <summary>
/// Platform Audit Trail APIs for Super Administrators.
/// </summary>
[ApiController]
[Route("api/v1/platform/audit")]
[Authorize(Policy = "SuperAdminPolicy")]
[Produces("application/json")]
public class PlatformAuditController : ControllerBase
{
    private readonly IPlatformAdministrationService _platformService;

    public PlatformAuditController(IPlatformAdministrationService platformService)
    {
        _platformService = platformService;
    }

    /// <summary>
    /// Retrieves paginated platform-wide audit log entries with secret sanitization and multi-criteria filtering.
    /// </summary>
    /// <param name="filter">Audit log query filters (TenantId, ActorUserId, Action, EntityType, Date range, Pagination).</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Paginated sanitized audit records.</returns>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<PagedResult<PlatformAuditLogDto>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetPlatformAuditLogs(
        [FromQuery] PlatformAuditFilterRequest filter,
        CancellationToken cancellationToken)
    {
        var result = await _platformService.GetPlatformAuditLogsAsync(filter, cancellationToken);
        return Ok(ApiResponse<PagedResult<PlatformAuditLogDto>>.Ok(result, "Platform audit logs retrieved successfully."));
    }
}
