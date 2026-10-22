using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Notification;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers;

[Authorize(Roles = "TenantAdmin,SuperAdmin,Admin,User")]
[ApiController]
[Route("api/v1/notification-templates")]
[Consumes("application/json")]
public class NotificationTemplatesController : ControllerBase
{
    private readonly INotificationTemplateService _templateService;

    public NotificationTemplatesController(INotificationTemplateService templateService)
    {
        _templateService = templateService;
    }

    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<List<NotificationTemplateDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetTemplates([FromQuery] string? eventType, [FromQuery] bool? isActive)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _templateService.GetAllTemplatesAsync(tenantId.Value, eventType, isActive);
        return Ok(result);
    }

    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<NotificationTemplateDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetTemplateById(int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _templateService.GetTemplateByIdAsync(id, tenantId.Value);
        return result.Success ? Ok(result) : NotFound(result);
    }

    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<NotificationTemplateDto>), StatusCodes.Status201Created)]
    public async Task<IActionResult> CreateTemplate([FromBody] CreateNotificationTemplateRequest request)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _templateService.CreateTemplateAsync(request, tenantId.Value, User.Identity?.Name);
        return result.Success ? StatusCode(StatusCodes.Status201Created, result) : BadRequest(result);
    }

    [HttpPut("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<NotificationTemplateDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdateTemplate(int id, [FromBody] UpdateNotificationTemplateRequest request)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _templateService.UpdateTemplateAsync(id, request, tenantId.Value, User.Identity?.Name);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpDelete("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status200OK)]
    public async Task<IActionResult> DeleteTemplate(int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _templateService.DeleteTemplateAsync(id, tenantId.Value);
        return result.Success ? Ok(result) : NotFound(result);
    }

    [HttpPost("seed-defaults")]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status200OK)]
    public async Task<IActionResult> SeedDefaults()
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _templateService.SeedDefaultsAsync(tenantId.Value, User.Identity?.Name);
        return Ok(result);
    }

    [HttpGet("variables/{eventType}")]
    [ProducesResponseType(typeof(ApiResponse<List<NotificationVariableDefinitionDto>>), StatusCodes.Status200OK)]
    public IActionResult GetVariables(string eventType)
    {
        var result = _templateService.GetVariablesForEvent(eventType);
        return Ok(result);
    }

    [HttpPost("preview")]
    [ProducesResponseType(typeof(ApiResponse<NotificationPreviewResponse>), StatusCodes.Status200OK)]
    public IActionResult PreviewTemplate([FromBody] NotificationPreviewRequest request)
    {
        var result = _templateService.PreviewTemplate(request);
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
