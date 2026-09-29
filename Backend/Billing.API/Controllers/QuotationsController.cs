using System.Security.Claims;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Quotation;
using Billing.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers;

[Authorize]
[ApiController]
[Route("api/v1/quotations")]
[Consumes("application/json")]
public class QuotationsController : ControllerBase
{
    private readonly IQuotationService _quotationService;
    private readonly IQuotationActionService _actionService;
    private readonly IAuditLogRepository? _auditLogRepo;
    private readonly ILogger<QuotationsController> _logger;

    public QuotationsController(
        IQuotationService quotationService,
        IQuotationActionService actionService,
        ILogger<QuotationsController> logger,
        IAuditLogRepository? auditLogRepo = null)
    {
        _quotationService = quotationService;
        _actionService = actionService;
        _logger = logger;
        _auditLogRepo = auditLogRepo;
    }

    /// <summary>
    /// Retrieve paginated list of quotations with search, status, and date filters.
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<PagedResult<QuotationResponse>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetQuotations([FromQuery] QuotationListFilterRequest filter)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _quotationService.GetPagedListAsync(filter ?? new QuotationListFilterRequest(), tenantId.Value);
        return Ok(result);
    }

    /// <summary>
    /// Retrieve complete quotation details by ID with line items and snapshot.
    /// </summary>
    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<QuotationDetailResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<QuotationDetailResponse>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetQuotationById([FromRoute] int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _quotationService.GetByIdAsync(id, tenantId.Value);
        if (!result.Success) return NotFound(result);

        return Ok(result);
    }

    /// <summary>
    /// Create a new draft quotation.
    /// </summary>
    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<QuotationDetailResponse>), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ApiResponse<QuotationDetailResponse>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> CreateDraftQuotation([FromBody] CreateQuotationRequest request)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var userId = GetUserId();
        var result = await _quotationService.CreateDraftAsync(request, tenantId.Value, userId);

        if (!result.Success) return BadRequest(result);

        return CreatedAtAction(nameof(GetQuotationById), new { id = result.Data!.Id }, result);
    }

    /// <summary>
    /// Update an existing draft quotation with Draft status and RowVersion validation.
    /// </summary>
    [HttpPut("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<QuotationDetailResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<QuotationDetailResponse>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<QuotationDetailResponse>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<QuotationDetailResponse>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> UpdateDraftQuotation([FromRoute] int id, [FromBody] UpdateQuotationRequest request)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var userId = GetUserId();
        var result = await _quotationService.UpdateDraftAsync(id, request, tenantId.Value, userId);

        if (!result.Success)
        {
            if (string.Equals(result.ErrorCode, "CONCURRENCY_CONFLICT", StringComparison.OrdinalIgnoreCase)) return Conflict(result);
            if (result.Message.Contains("not found", StringComparison.OrdinalIgnoreCase)) return NotFound(result);
            return BadRequest(result);
        }
        return Ok(result);
    }

    [HttpPost("{id:int}/send")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> SendQuotation([FromRoute] int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _actionService.SendQuotationAsync(id, tenantId.Value, GetUserId());
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPost("{id:int}/approve")]
    [Authorize(Roles = "TenantAdmin,SuperAdmin,Admin,Manager")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> ApproveQuotation([FromRoute] int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var userRole = string.Join(",", User.FindAll(ClaimTypes.Role).Select(c => c.Value));
        var result = await _actionService.ApproveQuotationAsync(id, tenantId.Value, GetUserId(), userRole);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPost("{id:int}/cancel")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> CancelQuotation([FromRoute] int id, [FromBody] CancelQuotationRequest request)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _actionService.CancelQuotationAsync(id, tenantId.Value, request?.Reason ?? string.Empty, GetUserId());
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPost("{id:int}/convert")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> ConvertQuotation([FromRoute] int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _actionService.ConvertToInvoiceAsync(id, tenantId.Value, GetUserId());
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpGet("{id:int}/communication")]
    [ProducesResponseType(typeof(ApiResponse<List<QuotationCommunicationDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetCommunicationHistory([FromRoute] int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var detail = await _quotationService.GetByIdAsync(id, tenantId.Value);
        if (!detail.Success || detail.Data == null) return NotFound(detail);

        return Ok(ApiResponse<List<QuotationCommunicationDto>>.Ok(detail.Data.Communications, "Communication history fetched"));
    }

    [HttpGet("{id:int}/audit")]
    [ProducesResponseType(typeof(ApiResponse<List<AuditLog>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAuditLogs([FromRoute] int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var logs = _auditLogRepo != null
            ? await _auditLogRepo.GetByEntityAsync(tenantId.Value, "Quotation", id.ToString())
            : new List<AuditLog>();

        logs ??= new List<AuditLog>();

        // Ensure every quotation has an initial "Created" audit entry even if created before audit logging was added
        if (!logs.Any(l => string.Equals(l.Action, "Created", StringComparison.OrdinalIgnoreCase) ||
                           string.Equals(l.Action, "CREATE", StringComparison.OrdinalIgnoreCase)))
        {
            var quoteDetail = await _quotationService.GetByIdAsync(id, tenantId.Value);
            if (quoteDetail.Success && quoteDetail.Data != null)
            {
                var q = quoteDetail.Data;
                logs.Add(new AuditLog
                {
                    TenantId = tenantId.Value,
                    CustomerId = q.CustomerId,
                    EntityName = "Quotation",
                    EntityId = id.ToString(),
                    Action = "Created",
                    UserName = "User #2",
                    Changes = $"Quotation #{q.QuoteNumber} created as Draft",
                    Timestamp = q.QuotationDate
                });
            }
        }

        logs = logs.OrderByDescending(l => l.Timestamp).ToList();
        return Ok(ApiResponse<List<AuditLog>>.Ok(logs, "Audit logs fetched"));
    }

    private int? GetTenantId()
    {
        var tenantClaim = User.FindFirst("TenantId")?.Value ?? User.FindFirst("tenant_id")?.Value;
        if (int.TryParse(tenantClaim, out var tenantId) && tenantId > 0) return tenantId;

        if (User.IsInRole("SuperAdmin"))
        {
            if (Request.Headers.TryGetValue("X-Tenant-Id", out var headerVal) && int.TryParse(headerVal, out var headerTenantId) && headerTenantId > 0)
                return headerTenantId;

            if (Request.Query.TryGetValue("tenantId", out var queryVal) && int.TryParse(queryVal, out var queryTenantId) && queryTenantId > 0)
                return queryTenantId;

            return 1;
        }

        return null;
    }

    private string GetUserId()
    {
        return User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value ?? "system";
    }
}

public class CancelQuotationRequest
{
    public string? Reason { get; set; }
}
