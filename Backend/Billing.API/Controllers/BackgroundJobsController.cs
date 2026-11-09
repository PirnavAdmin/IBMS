using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.BackgroundJobs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers;

[Authorize]
[ApiController]
[Route("api/v1/background-jobs")]
[Route("api/background-jobs")]
public class BackgroundJobsController : ControllerBase
{
    private readonly IBackgroundJobCoordinator _coordinator;

    public BackgroundJobsController(IBackgroundJobCoordinator coordinator)
    {
        _coordinator = coordinator;
    }

    [HttpGet("status")]
    [ProducesResponseType(typeof(ApiResponse<List<BackgroundJobStatusDto>>), StatusCodes.Status200OK)]
    public IActionResult GetJobStatuses()
    {
        var tenantId = GetTenantId();
        var isSuperAdmin = User.IsInRole("SuperAdmin");
        if ((!tenantId.HasValue && !isSuperAdmin) || !CanViewBackgroundJobs())
        {
            return Forbid();
        }

        var statuses = _coordinator.GetAllJobStatuses(isSuperAdmin && !HasExplicitTenantHeader() ? null : tenantId);
        return Ok(ApiResponse<List<BackgroundJobStatusDto>>.Ok(statuses, "Background job statuses retrieved successfully."));
    }

    [HttpPost("run/{jobName}")]
    [ProducesResponseType(typeof(ApiResponse<JobExecutionResultDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<JobExecutionResultDto>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> RunJob(string jobName, [FromBody] RunJobRequest? request = null, CancellationToken cancellationToken = default)
    {
        var callerTenantId = GetTenantId();
        var isSuperAdmin = User.IsInRole("SuperAdmin");
        if ((!callerTenantId.HasValue && !isSuperAdmin) || !CanManageBackgroundJobs())
        {
            return Forbid();
        }

        if (!isSuperAdmin && request?.TenantId.HasValue == true && request.TenantId.Value != callerTenantId!.Value)
        {
            return Forbid();
        }

        var effectiveTenantId = isSuperAdmin
            ? (request?.TenantId ?? callerTenantId)
            : callerTenantId;

        var result = await _coordinator.RunJobByNameAsync(jobName, effectiveTenantId, cancellationToken);

        if (!result.Success)
        {
            return BadRequest(ApiResponse<JobExecutionResultDto>.Fail(result.Message ?? "Job execution failed."));
        }

        return Ok(ApiResponse<JobExecutionResultDto>.Ok(result, $"Job '{jobName}' executed successfully."));
    }

    private bool CanViewBackgroundJobs()
    {
        if (User.IsInRole("SuperAdmin") || User.IsInRole("TenantAdmin") || User.IsInRole("Admin"))
        {
            return true;
        }

        if (User.IsInRole("Customer") || User.IsInRole("Viewer"))
        {
            return false;
        }

        var perms = GetUserPermissions();
        return perms.Any(p =>
            string.Equals(p, "backgroundjobs.view", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(p, "backgroundjobs.manage", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(p, "all", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(p, "*", StringComparison.OrdinalIgnoreCase));
    }

    private bool CanManageBackgroundJobs()
    {
        if (User.IsInRole("SuperAdmin") || User.IsInRole("TenantAdmin") || User.IsInRole("Admin"))
        {
            return true;
        }

        if (User.IsInRole("Customer") || User.IsInRole("Viewer"))
        {
            return false;
        }

        var perms = GetUserPermissions();
        return perms.Any(p =>
            string.Equals(p, "backgroundjobs.manage", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(p, "all", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(p, "*", StringComparison.OrdinalIgnoreCase));
    }

    private List<string> GetUserPermissions()
    {
        return User.FindAll("permissions")
            .Concat(User.FindAll("permission"))
            .SelectMany(c => (c.Value ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            .ToList();
    }

    private bool HasExplicitTenantHeader()
    {
        return Request?.Headers != null &&
               Request.Headers.TryGetValue("X-Tenant-Id", out var h) &&
               int.TryParse(h, out var hId) &&
               hId > 0;
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
