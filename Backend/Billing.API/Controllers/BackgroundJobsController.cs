using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.BackgroundJobs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers;

[Authorize(Roles = "TenantAdmin,SuperAdmin")]
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
        var statuses = _coordinator.GetAllJobStatuses();
        return Ok(ApiResponse<List<BackgroundJobStatusDto>>.Ok(statuses, "Background job statuses retrieved successfully."));
    }

    [HttpPost("run/{jobName}")]
    [ProducesResponseType(typeof(ApiResponse<JobExecutionResultDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<JobExecutionResultDto>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> RunJob(string jobName, [FromBody] RunJobRequest? request = null)
    {
        var tenantId = request?.TenantId ?? GetTenantId();
        var result = await _coordinator.RunJobByNameAsync(jobName, tenantId);

        if (!result.Success)
        {
            return BadRequest(ApiResponse<JobExecutionResultDto>.Fail(result.Message ?? "Job execution failed."));
        }

        return Ok(ApiResponse<JobExecutionResultDto>.Ok(result, $"Job '{jobName}' executed successfully."));
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
