using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Notification;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers;

[Authorize(Roles = "TenantAdmin,SuperAdmin,User")]
[ApiController]
[Route("api/v1/notifications")]
[Consumes("application/json")]
public class NotificationsController : ControllerBase
{
    private readonly INotificationService _notificationService;

    public NotificationsController(INotificationService notificationService)
    {
        _notificationService = notificationService;
    }

    [HttpGet("history")]
    [ProducesResponseType(typeof(ApiResponse<PagedResult<NotificationLogDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetHistory([FromQuery] NotificationLogQueryParameters parameters)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _notificationService.GetNotificationHistoryAsync(tenantId.Value, parameters);
        return Ok(result);
    }

    [HttpPost("{id:int}/retry")]
    [ProducesResponseType(typeof(ApiResponse<NotificationLogDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Retry(int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _notificationService.RetryNotificationAsync(id, tenantId.Value, User.Identity?.Name);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPost("send-invoice/{invoiceId:int}")]
    [ProducesResponseType(typeof(ApiResponse<NotificationLogDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> SendInvoice(int invoiceId)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _notificationService.SendInvoiceNotificationAsync(invoiceId, tenantId.Value, "InvoiceSent", User.Identity?.Name);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPost("send-payment/{paymentId:int}")]
    [ProducesResponseType(typeof(ApiResponse<NotificationLogDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> SendPaymentReceipt(int paymentId)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _notificationService.SendPaymentNotificationAsync(paymentId, tenantId.Value, "PaymentReceived", User.Identity?.Name);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPost("send-quotation/{quotationId:int}")]
    [ProducesResponseType(typeof(ApiResponse<NotificationLogDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> SendQuotation(int quotationId)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _notificationService.SendQuotationNotificationAsync(quotationId, tenantId.Value, User.Identity?.Name);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPost("send-credit-note/{creditNoteId:int}")]
    [ProducesResponseType(typeof(ApiResponse<NotificationLogDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> SendCreditNote(int creditNoteId)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _notificationService.SendCreditNoteNotificationAsync(creditNoteId, tenantId.Value, User.Identity?.Name);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPost("process-overdue")]
    [ProducesResponseType(typeof(ApiResponse<int>), StatusCodes.Status200OK)]
    public async Task<IActionResult> ProcessOverdue()
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _notificationService.ProcessOverdueInvoicesAsync(tenantId.Value, User.Identity?.Name);
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
