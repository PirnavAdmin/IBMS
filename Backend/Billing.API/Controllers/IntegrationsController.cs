using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Webhook;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers;

[Authorize(Roles = "TenantAdmin,SuperAdmin,User")]
[ApiController]
[Route("api/v1/integrations")]
[Consumes("application/json")]
public class IntegrationsController : ControllerBase
{
    private readonly IIntegrationApplicationService _integrationService;

    public IntegrationsController(IIntegrationApplicationService integrationService)
    {
        _integrationService = integrationService;
    }

    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<PagedResult<IntegrationApplicationDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetApplications([FromQuery] IntegrationQueryParameters query)
    {
        var tenantId = GetTenantId();
        var result = await _integrationService.GetApplicationsAsync(query, tenantId);
        return Ok(result);
    }

    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<IntegrationApplicationDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<IntegrationApplicationDto>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetApplicationById(int id)
    {
        var tenantId = GetTenantId();
        var result = await _integrationService.GetApplicationByIdAsync(id, tenantId);
        return result.Success ? Ok(result) : NotFound(result);
    }

    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<RegisterIntegrationApplicationResponse>), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ApiResponse<RegisterIntegrationApplicationResponse>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> RegisterApplication([FromBody] RegisterIntegrationApplicationRequest request)
    {
        var tenantId = GetTenantId();
        var result = await _integrationService.RegisterApplicationAsync(request, tenantId);
        return result.Success
            ? CreatedAtAction(nameof(GetApplicationById), new { id = result.Data!.Id }, result)
            : BadRequest(result);
    }

    [HttpPut("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<IntegrationApplicationDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<IntegrationApplicationDto>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<IntegrationApplicationDto>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UpdateApplication(int id, [FromBody] UpdateIntegrationApplicationRequest request)
    {
        var tenantId = GetTenantId();
        var result = await _integrationService.UpdateApplicationAsync(id, request, tenantId);
        if (!result.Success && result.Message.Contains("not found", StringComparison.OrdinalIgnoreCase))
            return NotFound(result);

        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPatch("{id:int}/feature-flags")]
    [ProducesResponseType(typeof(ApiResponse<IntegrationApplicationDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<IntegrationApplicationDto>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<IntegrationApplicationDto>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UpdateFeatureFlags(int id, [FromBody] UpdateFeatureFlagsRequest request)
    {
        var tenantId = GetTenantId();
        var result = await _integrationService.UpdateFeatureFlagsAsync(id, request, tenantId);
        if (!result.Success && result.Message.Contains("not found", StringComparison.OrdinalIgnoreCase))
            return NotFound(result);

        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPatch("{id:int}/toggle-status")]
    [ProducesResponseType(typeof(ApiResponse<IntegrationApplicationDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<IntegrationApplicationDto>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ToggleStatus(int id)
    {
        var tenantId = GetTenantId();
        var result = await _integrationService.ToggleStatusAsync(id, tenantId);
        return result.Success ? Ok(result) : NotFound(result);
    }

    [HttpDelete("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteApplication(int id)
    {
        var tenantId = GetTenantId();
        var result = await _integrationService.DeleteApplicationAsync(id, tenantId);
        return result.Success ? Ok(result) : NotFound(result);
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
