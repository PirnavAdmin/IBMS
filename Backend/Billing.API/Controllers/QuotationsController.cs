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

    [HttpGet("public/decision")]
    [AllowAnonymous]
    public async Task<IActionResult> PublicProcessQuotationDecision(
        [FromQuery] string? token,
        [FromQuery] string? action,
        [FromQuery] int? tenantId)
    {
        var targetTenant = tenantId ?? GetTenantId() ?? 2;
        var result = await _actionService.ProcessCustomerDecisionAsync(token ?? string.Empty, action ?? string.Empty, targetTenant);
        return RenderDecisionHtmlPage(result);
    }

    [HttpGet("public/{id:int}/approve")]
    [AllowAnonymous]
    public async Task<IActionResult> PublicApproveQuotation([FromRoute] int id, [FromQuery] int? tenantId)
    {
        var targetTenant = tenantId ?? GetTenantId() ?? 2;
        var result = await _actionService.ProcessCustomerDecisionAsync(id.ToString(), "approve", targetTenant);
        return RenderDecisionHtmlPage(result);
    }

    private IActionResult RenderDecisionHtmlPage(ApiResponse<QuotationPublicDecisionResult> result)
    {
        if (!result.Success || result.Data == null)
        {
            var errorHtml = @"<!DOCTYPE html>
<html lang='en'>
<head>
  <meta charset='utf-8'>
  <meta name='viewport' content='width=device-width, initial-scale=1.0'>
  <title>Quotation Decision - Notice</title>
</head>
<body style='margin:0;padding:48px 16px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,""Segoe UI"",Roboto,sans-serif;color:#1e293b;display:flex;justify-content:center;align-items:flex-start;min-height:100vh;box-sizing:border-box;'>
  <div style='background:#ffffff;max-width:520px;width:100%;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,0.06);border:1px solid #e2e8f0;overflow:hidden;text-align:center;'>
    <div style='background:#0f172a;padding:24px;color:#ffffff;'>
      <h3 style='margin:0;font-size:16px;font-weight:600;letter-spacing:1px;text-transform:uppercase;'>INVOICE &bull; BILLING</h3>
    </div>
    <div style='padding:36px 32px;'>
      <div style='width:64px;height:64px;background:#fef2f2;color:#dc2626;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:30px;margin-bottom:20px;border:1px solid #fee2e2;'>&#9888;</div>
      <h2 style='margin:0 0 12px;font-size:22px;color:#0f172a;'>Notice</h2>
      <p style='color:#64748b;font-size:15px;line-height:1.6;margin:0 0 24px;'>" + System.Net.WebUtility.HtmlEncode(result.Message) + @"</p>
      <div style='background:#f8fafc;padding:14px;border-radius:8px;font-size:13px;color:#64748b;border:1px solid #e2e8f0;'>
        If you believe this is an error or need a refreshed quote, please contact our support team.
      </div>
    </div>
  </div>
</body>
</html>";
            return Content(errorHtml, "text/html");
        }

        var data = result.Data;
        var isApproved = string.Equals(data.Decision, "Approved", StringComparison.OrdinalIgnoreCase);
        var decisionColor = isApproved ? "#16a34a" : "#dc2626";
        var decisionBg = isApproved ? "#dcfce7" : "#fee2e2";

        string pageTitle;
        string headerIcon;
        string headerTitle;
        string headerDesc;
        string statusBadge;
        string noticeBox;

        if (data.IsAlreadyRecorded)
        {
            pageTitle = "Decision Already Recorded";
            headerIcon = "<div style='width:64px;height:64px;background:#f1f5f9;color:#475569;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:30px;margin-bottom:18px;border:1px solid #cbd5e1;'>&#128274;</div>";
            headerTitle = "Decision Already Recorded";
            headerDesc = "Your decision for quotation <strong>" + System.Net.WebUtility.HtmlEncode(data.QuoteNumber) + "</strong> was already saved on <strong>" + (data.RespondedAtUtc.HasValue ? data.RespondedAtUtc.Value.ToString("dd MMM yyyy, hh:mm tt") : "") + " UTC</strong>.";
            statusBadge = "<span style='background:" + decisionBg + ";color:" + decisionColor + ";padding:4px 12px;border-radius:20px;font-weight:700;font-size:13px;'>" + data.Decision + "</span>";
            noticeBox = @"<div style='background:#fffbeb;border:1px solid #fef3c7;border-left:4px solid #f59e0b;padding:14px 16px;border-radius:8px;text-align:left;margin-top:20px;'>
              <div style='font-size:13px;font-weight:700;color:#92400e;margin-bottom:4px;'>&#128274; Buttons Permanently Inactive</div>
              <div style='font-size:12px;color:#78350f;line-height:1.5;'>
                For data integrity and security, quotation action buttons can only be used once. Since a response was already recorded, these buttons will not process any further changes.
              </div>
            </div>";
        }
        else if (isApproved)
        {
            pageTitle = "Quotation Approved";
            headerIcon = "<div style='width:64px;height:64px;background:#dcfce7;color:#16a34a;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:32px;margin-bottom:18px;border:1px solid #bbf7d0;'>&#10003;</div>";
            headerTitle = "Quotation Approved!";
            headerDesc = "Thank you! Quotation <strong>" + System.Net.WebUtility.HtmlEncode(data.QuoteNumber) + "</strong> has been approved. Our billing team will finalize and issue your official tax invoice shortly.";
            statusBadge = "<span style='background:#dcfce7;color:#16a34a;padding:4px 12px;border-radius:20px;font-weight:700;font-size:13px;'>Approved</span>";
            noticeBox = @"<div style='background:#f0fdf4;border:1px solid #bbf7d0;border-left:4px solid #16a34a;padding:14px 16px;border-radius:8px;text-align:left;margin-top:20px;'>
              <div style='font-size:13px;font-weight:700;color:#166534;margin-bottom:4px;'>&#10003; Confirmation Finalized</div>
              <div style='font-size:12px;color:#14532d;line-height:1.5;'>
                Your decision has been updated in real time. The action buttons in your email are now permanently locked.
              </div>
            </div>";
        }
        else
        {
            pageTitle = "Quotation Declined";
            headerIcon = "<div style='width:64px;height:64px;background:#fee2e2;color:#dc2626;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:30px;margin-bottom:18px;border:1px solid #fecaca;'>&#10006;</div>";
            headerTitle = "Quotation Declined";
            headerDesc = "Quotation <strong>" + System.Net.WebUtility.HtmlEncode(data.QuoteNumber) + "</strong> has been marked as declined. Our sales team has been notified.";
            statusBadge = "<span style='background:#fee2e2;color:#dc2626;padding:4px 12px;border-radius:20px;font-weight:700;font-size:13px;'>Declined</span>";
            noticeBox = @"<div style='background:#fef2f2;border:1px solid #fee2e2;border-left:4px solid #dc2626;padding:14px 16px;border-radius:8px;text-align:left;margin-top:20px;'>
              <div style='font-size:13px;font-weight:700;color:#991b1b;margin-bottom:4px;'>&#10006; Decision Recorded</div>
              <div style='font-size:12px;color:#7f1d1d;line-height:1.5;'>
                Your response is stored. The action buttons in your email are now permanently locked.
              </div>
            </div>";
        }

        var html = @"<!DOCTYPE html>
<html lang='en'>
<head>
  <meta charset='utf-8'>
  <meta name='viewport' content='width=device-width, initial-scale=1.0'>
  <title>" + pageTitle + @"</title>
</head>
<body style='margin:0;padding:40px 16px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,""Segoe UI"",Roboto,sans-serif;color:#1e293b;display:flex;justify-content:center;align-items:flex-start;min-height:100vh;box-sizing:border-box;'>
  <div style='background:#ffffff;max-width:540px;width:100%;border-radius:16px;box-shadow:0 12px 35px rgba(0,0,0,0.06);border:1px solid #e2e8f0;overflow:hidden;'>
    <div style='background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);padding:24px 32px;color:#ffffff;display:flex;justify-content:space-between;align-items:center;'>
      <div>
        <div style='font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;font-weight:600;'>" + System.Net.WebUtility.HtmlEncode(data.CompanyName) + @"</div>
        <div style='font-size:18px;font-weight:700;margin-top:2px;'>Customer Decision Portal</div>
      </div>
      <div>" + statusBadge + @"</div>
    </div>
    <div style='padding:36px 32px;text-align:center;'>
      " + headerIcon + @"
      <h2 style='margin:0 0 10px;font-size:24px;font-weight:700;color:#0f172a;'>" + headerTitle + @"</h2>
      <p style='color:#64748b;font-size:15px;line-height:1.6;margin:0 0 24px;'>" + headerDesc + @"</p>
      
      <div style='background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;text-align:left;margin-bottom:8px;'>
        <div style='font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;font-weight:700;margin-bottom:12px;'>Quotation Summary</div>
        <table style='width:100%;border-collapse:collapse;font-size:14px;'>
          <tr>
            <td style='color:#64748b;padding:6px 0;'>Quote Number:</td>
            <td style='font-weight:600;color:#0f172a;text-align:right;padding:6px 0;'>" + System.Net.WebUtility.HtmlEncode(data.QuoteNumber) + @"</td>
          </tr>
          <tr>
            <td style='color:#64748b;padding:6px 0;'>Customer:</td>
            <td style='font-weight:600;color:#0f172a;text-align:right;padding:6px 0;'>" + System.Net.WebUtility.HtmlEncode(data.CustomerName) + @"</td>
          </tr>
          <tr>
            <td style='color:#64748b;padding:6px 0;'>Total Amount:</td>
            <td style='font-weight:700;color:#0f172a;text-align:right;padding:6px 0;'>" + System.Net.WebUtility.HtmlEncode(data.Currency) + " " + data.TotalAmount.ToString("N2") + @"</td>
          </tr>
          <tr>
            <td style='color:#64748b;padding:6px 0;'>Decision:</td>
            <td style='font-weight:700;color:" + decisionColor + @";text-align:right;padding:6px 0;'>" + data.Decision + @"</td>
          </tr>
          <tr>
            <td style='color:#64748b;padding:6px 0;'>Timestamp:</td>
            <td style='font-weight:500;color:#475569;text-align:right;padding:6px 0;'>" + (data.RespondedAtUtc.HasValue ? data.RespondedAtUtc.Value.ToString("dd MMM yyyy, hh:mm tt") : "") + @" UTC</td>
          </tr>
        </table>
      </div>

      " + noticeBox + @"

      <div style='margin-top:28px;padding-top:20px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;line-height:1.6;'>
        Have questions? Please reach out directly to your account representative or billing support.<br/>
        &copy; " + DateTime.UtcNow.Year + " " + System.Net.WebUtility.HtmlEncode(data.CompanyName) + @". All rights reserved.
      </div>
    </div>
  </div>
</body>
</html>";

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

