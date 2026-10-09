using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AuditController : ControllerBase
{
    private readonly IAuditService _auditService;

    public AuditController(IAuditService auditService)
    {
        _auditService = auditService;
    }

    /// <summary>
    /// Retrieves paginated and filtered audit logs for the current tenant.
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<PagedResult<AuditLog>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAuditLogs([FromQuery] AuditLogFilterRequest filter, CancellationToken cancellationToken)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _auditService.GetTenantAuditHistoryAsync(tenantId.Value, filter, cancellationToken);
        
        return Ok(ApiResponse<PagedResult<AuditLog>>.Ok(result, "Audit logs retrieved successfully"));
    }

    /// <summary>
    /// Retrieves distinct filter options (entity names, actions, and user names) for the current tenant's complete audit history.
    /// </summary>
    [HttpGet("filter-options")]
    [ProducesResponseType(typeof(ApiResponse<AuditFilterOptionsResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetFilterOptions(CancellationToken cancellationToken)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _auditService.GetTenantFilterOptionsAsync(tenantId.Value, cancellationToken);
        return Ok(ApiResponse<AuditFilterOptionsResponse>.Ok(result, "Audit filter options retrieved successfully"));
    }

    private int? GetTenantId()
    {
        var tenantClaim = User.FindFirst("TenantId")?.Value ?? User.FindFirst("tenant_id")?.Value;
        if (int.TryParse(tenantClaim, out int tenantId))
        {
            return tenantId;
        }
        return null;
    }
}
