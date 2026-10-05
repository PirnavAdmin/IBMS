using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers;

[Authorize(Roles = "TenantAdmin,SuperAdmin")]
[ApiController]
[Route("api/v1/invoices")]
[Consumes("application/json")]
public class InvoicesController : ControllerBase
{
    private readonly IInvoiceService _invoiceService;
    private readonly IInvoiceRepository _invoiceRepository;

    public InvoicesController(IInvoiceService invoiceService, IInvoiceRepository invoiceRepository)
    {
        _invoiceService = invoiceService;
        _invoiceRepository = invoiceRepository;
    }

    [HttpGet]
    [ProducesResponseType(typeof(PagedResult<Invoice>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetInvoices([FromQuery] InvoiceFilterRequest filter)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _invoiceRepository.GetPagedAsync(tenantId.Value, filter);
        return Ok(result);
    }

    [HttpGet("summary")]
    [ProducesResponseType(typeof(InvoiceSummaryDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetSummary()
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _invoiceRepository.GetSummaryAsync(tenantId.Value);
        return Ok(result);
    }

    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(Invoice), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetInvoice(int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var invoice = await _invoiceRepository.GetByIdAsync(id, tenantId.Value);
        if (invoice == null) return NotFound(new { message = "Invoice not found." });

        return Ok(invoice);
    }

    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<Invoice>), StatusCodes.Status200OK)]
    public async Task<IActionResult> CreateDraft([FromBody] Invoice request)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _invoiceService.CreateDraftAsync(request, tenantId.Value);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPut("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<Invoice>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> UpdateDraft(int id, [FromBody] Invoice request)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _invoiceService.UpdateDraftAsync(id, request, tenantId.Value);
        
        if (!result.Success && result.Message != null && result.Message.Contains("Concurrency error"))
            return Conflict(result);

        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPost("{id:int}/issue")]
    [ProducesResponseType(typeof(ApiResponse<Invoice>), StatusCodes.Status200OK)]
    [Authorize(Roles = "TenantAdmin,SuperAdmin")]
    public async Task<IActionResult> IssueInvoice(int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _invoiceService.IssueInvoiceAsync(id, tenantId.Value, User.Identity?.Name);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPost("{id:int}/cancel")]
    [ProducesResponseType(typeof(ApiResponse<Invoice>), StatusCodes.Status200OK)]
    [Authorize(Roles = "TenantAdmin,SuperAdmin")]
    public async Task<IActionResult> CancelInvoice(int id, [FromBody] ReasonRequest request)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _invoiceService.CancelInvoiceAsync(id, tenantId.Value, request.Reason, User.Identity?.Name);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPost("{id:int}/void")]
    [ProducesResponseType(typeof(ApiResponse<Invoice>), StatusCodes.Status200OK)]
    [Authorize(Roles = "TenantAdmin,SuperAdmin")]
    public async Task<IActionResult> VoidInvoice(int id, [FromBody] ReasonRequest request)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _invoiceService.VoidInvoiceAsync(id, tenantId.Value, request.Reason, User.Identity?.Name);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    private int? GetTenantId()
    {
        var claim = User.FindFirst("TenantId")?.Value ?? User.FindFirst("tenant_id")?.Value;
        if (int.TryParse(claim, out var tid) && tid > 0) return tid;

        if (User.IsInRole("SuperAdmin"))
        {
            if (Request.Headers.TryGetValue("X-Tenant-Id", out var h) && int.TryParse(h, out var hId) && hId > 0)
                return hId;
            return 1;
        }
        return null;
    }
}




