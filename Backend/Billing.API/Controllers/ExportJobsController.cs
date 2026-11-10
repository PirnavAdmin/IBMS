using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Export;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers;

[Authorize]
[ApiController]
[Route("api/v1/export-jobs")]
[Route("api/export-jobs")]
public class ExportJobsController : ControllerBase
{
    private static readonly string[] AllSupportedJobTypes =
    {
        "Invoice", "Payment", "Customer", "AuditLog", "CreditNote", "Quotation", "Product"
    };

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
        if (!tenantId.HasValue || !CanAccessExportModule())
        {
            return Forbid();
        }

        var requestedJobType = request?.JobType ?? "Invoice";
        if (!CanAccessJobType(requestedJobType))
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
        if (!tenantId.HasValue || !CanAccessExportModule())
        {
            return Forbid();
        }

        var result = await _exportJobService.GetExportJobAsync(id, tenantId.Value, cancellationToken);
        if (!result.Success)
        {
            return NotFound(result);
        }

        if (!CanAccessJobType(result.Data?.JobType))
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
        if (!tenantId.HasValue || !CanAccessExportModule())
        {
            return Forbid();
        }

        if (!string.IsNullOrWhiteSpace(filter?.JobType) && !CanAccessJobType(filter.JobType))
        {
            return Forbid();
        }

        var canAccessAudit = CanAccessAuditLogs();
        var allowedJobTypes = AllSupportedJobTypes.Where(CanAccessJobType).ToList();

        var effectiveFilter = filter ?? new ExportJobFilterRequest();
        effectiveFilter.ExcludeAuditLogs = !canAccessAudit;
        effectiveFilter.AllowedJobTypes = allowedJobTypes.Count < AllSupportedJobTypes.Length
            ? allowedJobTypes
            : null;

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
        if (!tenantId.HasValue || !CanAccessExportModule())
        {
            return Forbid();
        }

        var jobInfo = await _exportJobService.GetExportJobAsync(id, tenantId.Value, cancellationToken);
        if (jobInfo.Success && !CanAccessJobType(jobInfo.Data?.JobType))
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

    private static string? NormalizeCanonicalJobType(string? jobType)
    {
        if (string.IsNullOrWhiteSpace(jobType)) return null;
        return jobType.Trim().Replace(" ", "").Replace("-", "").Replace("_", "").ToLowerInvariant() switch
        {
            "invoice" or "invoices" => "Invoice",
            "payment" or "payments" => "Payment",
            "customer" or "customers" => "Customer",
            "auditlog" or "auditlogs" => "AuditLog",
            "creditnote" or "creditnotes" => "CreditNote",
            "quotation" or "quotations" => "Quotation",
            "product" or "products" => "Product",
            _ => null
        };
    }

    private bool CanAccessExportModule()
    {
        if (User.IsInRole("SuperAdmin") || User.IsInRole("TenantAdmin") || User.IsInRole("Admin") ||
            User.IsInRole("BillingManager") || User.IsInRole("Accountant") || User.IsInRole("User"))
        {
            return true;
        }

        if (User.IsInRole("Customer") || User.IsInRole("Viewer"))
        {
            return false;
        }

        var perms = GetUserPermissions();
        return perms.Any(p =>
            string.Equals(p, "exportjobs.view", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(p, "exportjobs.create", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(p, "reports.export", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(p, "all", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(p, "*", StringComparison.OrdinalIgnoreCase));
    }

    private bool CanAccessJobType(string? jobType)
    {
        var canonical = NormalizeCanonicalJobType(jobType);
        if (canonical == null)
        {
            // Unknown job types are validated and returned as 400 BadRequest by ExportJobService
            return true;
        }

        if (canonical == "AuditLog")
        {
            return CanAccessAuditLogs();
        }

        if (User.IsInRole("SuperAdmin") || User.IsInRole("TenantAdmin") || User.IsInRole("Admin"))
        {
            return true;
        }

        var perms = GetUserPermissions();
        if (perms.Any(p =>
                string.Equals(p, "all", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(p, "*", StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        if (perms.Count > 0)
        {
            return canonical switch
            {
                "Invoice" => HasAnyPermission(perms, "invoices.view", "invoices.manage", "billing.view", "reports.view", "reports.export"),
                "Payment" => HasAnyPermission(perms, "payments.view", "payments.manage", "billing.view", "reports.view", "reports.export"),
                "Customer" => HasAnyPermission(perms, "customers.view", "customers.manage"),
                "CreditNote" => HasAnyPermission(perms, "creditnotes.view", "creditnotes.manage", "billing.view", "reports.view", "reports.export"),
                "Quotation" => HasAnyPermission(perms, "quotations.view", "quotations.manage", "billing.view", "reports.view", "reports.export"),
                "Product" => HasAnyPermission(perms, "products.view", "products.manage"),
                _ => false
            };
        }

        // Role-only fallback when token does not carry explicit permissions array
        if (User.IsInRole("BillingManager") || User.IsInRole("User"))
        {
            return true;
        }

        if (User.IsInRole("Accountant"))
        {
            return canonical is "Invoice" or "Payment" or "CreditNote" or "Quotation";
        }

        return false;
    }

    private bool CanAccessAuditLogs()
    {
        if (User.IsInRole("SuperAdmin") || User.IsInRole("TenantAdmin") || User.IsInRole("Admin") || User.IsInRole("Accountant"))
        {
            return true;
        }

        var perms = GetUserPermissions();
        return HasAnyPermission(perms, "audit.view", "audit.export", "all", "*");
    }

    private static bool HasAnyPermission(List<string> userPerms, params string[] expected)
    {
        return userPerms.Any(up => expected.Any(exp => string.Equals(up, exp, StringComparison.OrdinalIgnoreCase)));
    }

    private List<string> GetUserPermissions()
    {
        return User.FindAll("permissions")
            .Concat(User.FindAll("permission"))
            .SelectMany(c => (c.Value ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            .ToList();
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
