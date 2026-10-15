using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Webhook;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers;

[Authorize(Roles = "TenantAdmin,SuperAdmin,User")]
[ApiController]
[Route("api/v1/webhooks")]
[Consumes("application/json")]
public class WebhooksController : ControllerBase
{
    private readonly IWebhookService _webhookService;
    private readonly IWebhookDeliveryService _deliveryService;

    public WebhooksController(
        IWebhookService webhookService,
        IWebhookDeliveryService deliveryService)
    {
        _webhookService = webhookService;
        _deliveryService = deliveryService;
    }

    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<PagedResult<WebhookDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetWebhooks([FromQuery] WebhookQueryParameters query)
    {
        var tenantId = GetTenantId();
        var result = await _webhookService.GetWebhooksAsync(query, tenantId);
        return Ok(result);
    }

    [HttpGet("events")]
    [ProducesResponseType(typeof(ApiResponse<List<WebhookEventDefinitionDto>>), StatusCodes.Status200OK)]
    public IActionResult GetAvailableEvents()
    {
        var events = _webhookService.GetAvailableEvents();
        return Ok(ApiResponse<List<WebhookEventDefinitionDto>>.Ok(events, "Available webhook events retrieved successfully."));
    }

    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<WebhookDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<WebhookDto>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetWebhookById(int id)
    {
        var tenantId = GetTenantId();
        var result = await _webhookService.GetWebhookByIdAsync(id, tenantId);
        return result.Success ? Ok(result) : NotFound(result);
    }

    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<WebhookDto>), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ApiResponse<WebhookDto>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> CreateWebhook([FromBody] CreateWebhookRequest request)
    {
        var tenantId = GetTenantId();
        var result = await _webhookService.CreateWebhookAsync(request, tenantId);
        return result.Success
            ? CreatedAtAction(nameof(GetWebhookById), new { id = result.Data!.Id }, result)
            : BadRequest(result);
    }

    [HttpPut("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<WebhookDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<WebhookDto>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<WebhookDto>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UpdateWebhook(int id, [FromBody] UpdateWebhookRequest request)
    {
        var tenantId = GetTenantId();
        var result = await _webhookService.UpdateWebhookAsync(id, request, tenantId);
        if (!result.Success && result.Message.Contains("not found", StringComparison.OrdinalIgnoreCase))
            return NotFound(result);

        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpDelete("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteWebhook(int id)
    {
        var tenantId = GetTenantId();
        var result = await _webhookService.DeleteWebhookAsync(id, tenantId);
        return result.Success ? Ok(result) : NotFound(result);
    }

    [HttpPatch("{id:int}/toggle-status")]
    [ProducesResponseType(typeof(ApiResponse<WebhookDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<WebhookDto>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ToggleStatus(int id)
    {
        var tenantId = GetTenantId();
        var result = await _webhookService.ToggleStatusAsync(id, tenantId);
        return result.Success ? Ok(result) : NotFound(result);
    }

    [HttpPost("{id:int}/rotate-secret")]
    [ProducesResponseType(typeof(ApiResponse<RotateSecretResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<RotateSecretResponse>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> RotateSecret(int id)
    {
        var tenantId = GetTenantId();
        var result = await _webhookService.RotateSecretAsync(id, tenantId);
        return result.Success ? Ok(result) : NotFound(result);
    }

    [HttpPost("{id:int}/ping")]
    [ProducesResponseType(typeof(ApiResponse<WebhookPingResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<WebhookPingResponse>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> PingWebhook(int id)
    {
        var tenantId = GetTenantId();
        var result = await _webhookService.PingAsync(id, tenantId);
        return result.Success ? Ok(result) : NotFound(result);
    }

    // -------------------------------------------------------------
    // Delivery History Endpoints
    // -------------------------------------------------------------

    [HttpGet("deliveries")]
    [ProducesResponseType(typeof(ApiResponse<PagedResult<WebhookDeliveryDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetDeliveries([FromQuery] WebhookDeliveryQueryParameters query)
    {
        var tenantId = GetTenantId();
        var result = await _deliveryService.GetDeliveriesAsync(query, tenantId);
        return Ok(result);
    }

    [HttpGet("{id:int}/deliveries")]
    [ProducesResponseType(typeof(ApiResponse<PagedResult<WebhookDeliveryDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetDeliveriesForWebhook(int id, [FromQuery] WebhookDeliveryQueryParameters query)
    {
        var tenantId = GetTenantId();
        query.WebhookId = id;
        var result = await _deliveryService.GetDeliveriesAsync(query, tenantId);
        return Ok(result);
    }

    [HttpGet("deliveries/{deliveryId:int}")]
    [ProducesResponseType(typeof(ApiResponse<WebhookDeliveryDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<WebhookDeliveryDto>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetDeliveryById(int deliveryId)
    {
        var tenantId = GetTenantId();
        var result = await _deliveryService.GetDeliveryByIdAsync(deliveryId, tenantId);
        return result.Success ? Ok(result) : NotFound(result);
    }

    [HttpPost("deliveries/{deliveryId:int}/replay")]
    [ProducesResponseType(typeof(ApiResponse<ReplayDeliveryResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<ReplayDeliveryResponse>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<ReplayDeliveryResponse>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ReplayDelivery(int deliveryId)
    {
        var tenantId = GetTenantId();
        var result = await _deliveryService.ReplayDeliveryAsync(deliveryId, tenantId);
        if (!result.Success && result.Message.Contains("not found", StringComparison.OrdinalIgnoreCase))
            return NotFound(result);

        return result.Success ? Ok(result) : BadRequest(result);
    }

    private int GetTenantId()
    {
        var claim = User.FindFirst("TenantId")?.Value ?? User.FindFirst("tenant_id")?.Value;
        if (int.TryParse(claim, out var tid) && tid > 0) return tid;

        if (Request?.Headers != null && Request.Headers.TryGetValue("X-Tenant-Id", out var h) && int.TryParse(h, out var hId) && hId > 0)
            return hId;

        return 1;
    }
}
