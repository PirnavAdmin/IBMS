using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Export;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers;

[Authorize(Roles = "TenantAdmin,SuperAdmin,User")]
[ApiController]
[Route("api/v1/export-jobs")]
[Route("api/export-jobs")]
public class ExportJobsController : ControllerBase
{
    private readonly IExportJobService _exportJobService;

    public ExportJobsController(IExportJobService exportJobService)
    {
        _exportJobService = exportJobService;
    }

    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<ExportJobDto>), StatusCodes.Status202Accepted)]
    [ProducesResponseType(typeof(ApiResponse<ExportJobDto>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> QueueExportJob([FromBody] CreateExportJobRequest request)
    {
        var tenantId = GetTenantId();
        var userName = User.Identity?.Name ?? "User";

        var result = await _exportJobService.QueueExportJobAsync(request, tenantId, userName);
        if (!result.Success)
        {
            return BadRequest(result);
        }

        return AcceptedAtAction(nameof(GetExportJobById), new { id = result.Data?.Id }, result);
    }

    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<ExportJobDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<ExportJobDto>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetExportJobById(int id)
    {
        var tenantId = GetTenantId();
        var result = await _exportJobService.GetExportJobAsync(id, tenantId);
        return result.Success ? Ok(result) : NotFound(result);
    }

    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<PagedResult<ExportJobDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetExportJobs([FromQuery] ExportJobFilterRequest filter)
    {
        var tenantId = GetTenantId();
        var result = await _exportJobService.GetExportJobsAsync(tenantId, filter);
        return Ok(result);
    }

    [HttpGet("{id:int}/download")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DownloadExportFile(int id)
    {
        var tenantId = GetTenantId();
        var result = await _exportJobService.DownloadExportFileAsync(id, tenantId);

        if (!result.Success)
        {
            if (result.Message.Contains("not found", StringComparison.OrdinalIgnoreCase))
            {
                return NotFound(ApiResponse<object>.Fail(result.Message));
            }
            return BadRequest(ApiResponse<object>.Fail(result.Message));
        }

        var (content, fileName, contentType) = result.Data;
        return File(content, contentType, fileName);
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
