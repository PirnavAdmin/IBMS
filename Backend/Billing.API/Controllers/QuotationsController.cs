using System.Security.Claims;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Quotation;
using Billing.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers;

[Authorize(Roles = "TenantAdmin,SuperAdmin,Admin,BillingManager,Accountant,User,Viewer,Customer")]

[ApiController]
[Route("api/v1/quotations")]
[Consumes("application/json")]
public class QuotationsController : ControllerBase
{
    private readonly IQuotationService _quotationService;
    private readonly IQuotationActionService _actionService;
    private readonly IAuditLogRepository? _auditLogRepo;
    private readonly IQuotationPdfEngine? _quotationPdfEngine;
    private readonly IQuotationRepository? _quotationRepository;
    private readonly ITenantRepository? _tenantRepository;
    private readonly ILogger<QuotationsController> _logger;

    public QuotationsController(
        IQuotationService quotationService,
        IQuotationActionService actionService,
        ILogger<QuotationsController> logger,
        IAuditLogRepository? auditLogRepo = null,
        IQuotationPdfEngine? quotationPdfEngine = null,
        IQuotationRepository? quotationRepository = null,
        ITenantRepository? tenantRepository = null)
    {
        _quotationService = quotationService;
        _actionService = actionService;
        _logger = logger;
        _auditLogRepo = auditLogRepo;
        _quotationPdfEngine = quotationPdfEngine;
        _quotationRepository = quotationRepository;
        _tenantRepository = tenantRepository;
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
    /// Download or preview official Quotation PDF document.
    /// </summary>
    [HttpGet("{id:int}/pdf")]
    [ProducesResponseType(typeof(FileContentResult), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetQuotationPdf([FromRoute] int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        if (_quotationRepository == null || _quotationPdfEngine == null)
            return StatusCode(StatusCodes.Status501NotImplemented, "PDF generation engine is unavailable.");

        var quotation = await _quotationRepository.GetByIdAsync(id, tenantId.Value);
        if (quotation == null) return NotFound("Quotation not found.");

        var tenant = quotation.Tenant ?? (_tenantRepository != null ? await _tenantRepository.GetByIdAsync(tenantId.Value) : null);
        var pdfBytes = _quotationPdfEngine.GenerateQuotationPdf(quotation, tenant);

        return File(pdfBytes, "application/pdf", $"{quotation.QuoteNumber}.pdf");
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

        var userName = GetUserName();
        var result = await _quotationService.CreateDraftAsync(request, tenantId.Value, userName);

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

        var result = await _quotationService.UpdateDraftAsync(id, request, tenantId.Value, GetUserName());

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

        var result = await _actionService.SendQuotationAsync(id, tenantId.Value, GetUserName());
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPost("{id:int}/approve")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [Authorize(Roles = "TenantAdmin,SuperAdmin,Admin,BillingManager,Manager")]
    public async Task<IActionResult> ApproveQuotation([FromRoute] int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _actionService.ApproveQuotationAsync(id, tenantId.Value, GetUserName());
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpGet("public/{id:int}/approve")]
    [AllowAnonymous]
    public async Task<IActionResult> PublicApproveQuotation([FromRoute] int id, [FromQuery] int? tenantId)
    {
        var targetTenant = tenantId ?? GetTenantId() ?? 2;
        var result = await _actionService.ApproveQuotationAsync(id, targetTenant, "Customer (via Email)");

        var html = result.Success
            ? @"<!DOCTYPE html><html><head><title>Quotation Approved</title><meta name='viewport' content='width=device-width, initial-scale=1.0'></head><body style='font-family:-apple-system,BlinkMacSystemFont,""Segoe UI"",Roboto,sans-serif;background:#f8fafc;margin:0;padding:40px 16px;display:flex;justify-content:center;'><div style='background:#fff;max-width:520px;width:100%;padding:40px 32px;border-radius:16px;box-shadow:0 10px 25px rgba(0,0,0,0.05);text-align:center;border:1px solid #e2e8f0;'><div style='width:64px;height:64px;background:#dcfce7;color:#16a34a;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:32px;margin-bottom:20px;'>&#10003;</div><h2 style='color:#0f172a;margin:0 0 12px;font-size:24px;'>Quotation Approved!</h2><p style='color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;'>Thank you! Your quotation has been successfully approved. Our billing team has received your confirmation and will finalize and dispatch your official tax invoice shortly.</p><div style='background:#f1f5f9;padding:16px;border-radius:8px;font-size:14px;color:#334155;'>Status: <strong style='color:#16a34a;'>Approved</strong></div></div></body></html>"
            : $@"<!DOCTYPE html><html><head><title>Quotation Approval</title></head><body style='font-family:sans-serif;text-align:center;padding:50px;background:#f8fafc;'><div style='background:#fff;max-width:500px;margin:auto;padding:30px;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.06);'><h2>Notice</h2><p>{result.Message}</p></div></body></html>";

        return Content(html, "text/html");
    }

    [HttpPost("{id:int}/cancel")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [Authorize(Roles = "TenantAdmin,SuperAdmin,Admin,BillingManager,Accountant,User,Viewer,Customer")]

    public async Task<IActionResult> CancelQuotation([FromRoute] int id, [FromBody] CancelQuotationRequest request)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _actionService.CancelQuotationAsync(id, tenantId.Value, request?.Reason ?? string.Empty, GetUserName());
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPost("{id:int}/convert")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> ConvertQuotation([FromRoute] int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _actionService.ConvertToInvoiceAsync(id, tenantId.Value, GetUserName());
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
        return Ok(ApiResponse<List<AuditLog>>.Ok(logs ?? new List<AuditLog>(), "Audit logs fetched"));
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

    private string GetUserName()
    {
        // These service arguments are stored in audit UserName and communication SentBy.
        return User.FindFirst(ClaimTypes.Name)?.Value
            ?? User.FindFirst("name")?.Value
            ?? User.FindFirst(ClaimTypes.Email)?.Value
            ?? User.FindFirst("email")?.Value
            ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? User.FindFirst("sub")?.Value
            ?? "system";
    }
}

public class CancelQuotationRequest
{
    public string? Reason { get; set; }
}

