using System.Security.Claims;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Notification;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers;

[Authorize]
[ApiController]
[Route("api/v1/notifications/inbox")]
[Consumes("application/json")]
[Produces("application/json")]
public class NotificationInboxController : ControllerBase
{
    private readonly IInAppNotificationService _inboxService;
    private readonly ILogger<NotificationInboxController> _logger;

    public NotificationInboxController(
        IInAppNotificationService inboxService,
        ILogger<NotificationInboxController> logger)
    {
        _inboxService = inboxService;
        _logger = logger;
    }

    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<NotificationInboxPageDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<NotificationInboxPageDto>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetInbox(
        [FromQuery] NotificationInboxQueryParameters parameters,
        CancellationToken cancellationToken)
    {
        var userId = GetCurrentUserId();
        var tenantId = GetTenantId();

        if (!userId.HasValue || !tenantId.HasValue)
        {
            return StatusCode(StatusCodes.Status403Forbidden,
                ApiResponse<NotificationInboxPageDto>.Fail("Access denied to inbox for the current context.", errorCode: "FORBIDDEN"));
        }

        if (parameters.PageNumber < 1)
        {
            return BadRequest(ApiResponse<NotificationInboxPageDto>.Fail(
                "Page number must be 1 or greater.",
                errorCode: "INVALID_PAGE"));
        }

        var result = await _inboxService.GetInboxAsync(
            tenantId.Value,
            userId.Value,
            parameters,
            cancellationToken);

        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpGet("unread-count")]
    [ProducesResponseType(typeof(ApiResponse<NotificationUnreadCountDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetUnreadCount(CancellationToken cancellationToken)
    {
        var userId = GetCurrentUserId();
        var tenantId = GetTenantId();

        if (!userId.HasValue || !tenantId.HasValue)
        {
            return StatusCode(StatusCodes.Status403Forbidden,
                ApiResponse<NotificationUnreadCountDto>.Fail("Access denied to inbox for the current context.", errorCode: "FORBIDDEN"));
        }

        var result = await _inboxService.GetUnreadCountAsync(
            tenantId.Value,
            userId.Value,
            cancellationToken);

        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPatch("{id}/read")]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> MarkRead(string id, CancellationToken cancellationToken)
    {
        var userId = GetCurrentUserId();
        var tenantId = GetTenantId();

        if (!userId.HasValue || !tenantId.HasValue)
        {
            return StatusCode(StatusCodes.Status403Forbidden,
                ApiResponse<bool>.Fail("Access denied to inbox for the current context.", errorCode: "FORBIDDEN"));
        }

        if (!long.TryParse(id, out var notificationId) || notificationId <= 0)
        {
            return NotFound(ApiResponse<bool>.Fail("Notification not found.", errorCode: "NOT_FOUND"));
        }

        var result = await _inboxService.MarkAsReadAsync(
            tenantId.Value,
            userId.Value,
            notificationId,
            cancellationToken);

        if (!result.Success)
        {
            if (result.ErrorCode == "NOT_FOUND")
            {
                return NotFound(result);
            }
            return BadRequest(result);
        }

        return Ok(result);
    }

    [HttpPatch("read-all")]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> MarkAllRead(
        [FromBody] MarkAllNotificationsReadRequest request,
        CancellationToken cancellationToken)
    {
        var userId = GetCurrentUserId();
        var tenantId = GetTenantId();

        if (!userId.HasValue || !tenantId.HasValue)
        {
            return StatusCode(StatusCodes.Status403Forbidden,
                ApiResponse<bool>.Fail("Access denied to inbox for the current context.", errorCode: "FORBIDDEN"));
        }

        if (request == null || request.ThroughCreatedAtUtc == default)
        {
            return BadRequest(ApiResponse<bool>.Fail(
                "Valid throughCreatedAtUtc cutoff timestamp is required.",
                errorCode: "INVALID_CUTOFF"));
        }

        var result = await _inboxService.MarkAllAsReadAsync(
            tenantId.Value,
            userId.Value,
            request.ThroughCreatedAtUtc,
            cancellationToken);

        return result.Success ? Ok(result) : BadRequest(result);
    }

    private int? GetCurrentUserId()
    {
        var claim = User.FindFirst("UserId")?.Value ??
                    User.FindFirst(ClaimTypes.NameIdentifier)?.Value ??
                    User.FindFirst("sub")?.Value;

        if (int.TryParse(claim, out var uid) && uid > 0)
        {
            return uid;
        }

        return null;
    }

    private int? GetTenantId()
    {
        var claim = User.FindFirst("TenantId")?.Value ?? User.FindFirst("tenant_id")?.Value;
        if (int.TryParse(claim, out var tid) && tid > 0)
        {
            return tid;
        }

        // For SuperAdmin: only accept explicitly authorized tenant selection header
        if (User.IsInRole("SuperAdmin"))
        {
            if (Request.Headers.TryGetValue("X-Tenant-Id", out var h) && int.TryParse(h, out var hId) && hId > 0)
            {
                return hId;
            }
        }

        return null;
    }
}
