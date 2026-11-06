using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Export;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers;

[Authorize(Roles = "TenantAdmin,SuperAdmin,Admin,BillingManager,Accountant,User")]
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
    public async Task<IActionResult> QueueExportJob([FromBody] CreateExportJobRequest? request = null, CancellationToken cancellationToken = default)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue)
        {
            return Forbid();
        }

        if (IsAuditLogJobType(request?.JobType) && !CanAccessAuditLogs())
        {
            return Forbid();
        }

        var userName = User.Identity?.Name
            ?? User.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value
            ?? User.FindFirst("name")?.Value
            ?? User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value
            ?? User.FindFirst("email")?.Value
            ?? "User";

        var result = await _exportJobService.QueueExportJobAsync(request ?? new CreateExportJobRequest(), tenantId.Value, userName, cancellationToken);
        if (!result.Success)
        {
            return BadRequest(result);
        }

        return AcceptedAtAction(nameof(GetExportJobById), new { id = result.Data?.Id }, result);
    }

    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<ExportJobDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<ExportJobDto>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetExportJobById(int id, CancellationToken cancellationToken = default)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue)
        {
            return Forbid();
        }

        var result = await _exportJobService.GetExportJobAsync(id, tenantId.Value, cancellationToken);
        if (!result.Success)
        {
            return NotFound(result);
        }

        if (IsAuditLogJobType(result.Data?.JobType) && !CanAccessAuditLogs())
        {
            return Forbid();
        }

        return Ok(result);
    }

    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<PagedResult<ExportJobDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetExportJobs([FromQuery] ExportJobFilterRequest? filter = null, CancellationToken cancellationToken = default)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue)
        {
            return Forbid();
        }

        var canAccessAudit = CanAccessAuditLogs();
        if (IsAuditLogJobType(filter?.JobType) && !canAccessAudit)
        {
            return Forbid();
        }

        var effectiveFilter = filter ?? new ExportJobFilterRequest();
        effectiveFilter.ExcludeAuditLogs = !canAccessAudit;

        var result = await _exportJobService.GetExportJobsAsync(tenantId.Value, effectiveFilter, cancellationToken);
        return Ok(result);
    }

    [HttpGet("{id:int}/download")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DownloadExportFile(int id, CancellationToken cancellationToken = default)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue)
        {
            return Forbid();
        }

        var jobInfo = await _exportJobService.GetExportJobAsync(id, tenantId.Value, cancellationToken);
        if (jobInfo.Success && IsAuditLogJobType(jobInfo.Data?.JobType) && !CanAccessAuditLogs())
        {
            return Forbid();
        }

        var result = await _exportJobService.DownloadExportFileAsync(id, tenantId.Value, cancellationToken);

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

    private static bool IsAuditLogJobType(string? jobType)
    {
        if (string.IsNullOrWhiteSpace(jobType)) return false;
        var normalized = jobType.Trim().Replace(" ", "").Replace("-", "").Replace("_", "").ToLowerInvariant();
        return normalized is "auditlog" or "auditlogs";
    }

    private bool CanAccessAuditLogs()
    {
        if (User.IsInRole("SuperAdmin") || User.IsInRole("TenantAdmin") || User.IsInRole("Admin") || User.IsInRole("Accountant"))
        {
            return true;
        }

        var perms = User.FindAll("permissions")
            .Concat(User.FindAll("permission"))
            .SelectMany(c => (c.Value ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));

        return perms.Any(p =>
            string.Equals(p, "audit.view", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(p, "audit.export", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(p, "all", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(p, "*", StringComparison.OrdinalIgnoreCase));
    }

    private int? GetTenantId()
    {
        if (User.IsInRole("SuperAdmin"))
        {
            if (Request?.Headers != null && Request.Headers.TryGetValue("X-Tenant-Id", out var h) && int.TryParse(h, out var hId) && hId > 0)
                return hId;

            var superClaim = User.FindFirst("TenantId")?.Value ?? User.FindFirst("tenant_id")?.Value;
            if (int.TryParse(superClaim, out var stid) && stid > 0) return stid;

            return 1;
        }

        var claim = User.FindFirst("TenantId")?.Value ?? User.FindFirst("tenant_id")?.Value;
        if (int.TryParse(claim, out var tid) && tid > 0) return tid;

        return null;
    }
}
