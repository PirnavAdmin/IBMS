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
    private readonly IInvoiceCommunicationRepository _communicationRepository;
    private readonly IAuditLogRepository _auditLogRepository;

    public InvoicesController(
        IInvoiceService invoiceService,
        IInvoiceRepository invoiceRepository,
        IInvoiceCommunicationRepository communicationRepository,
        IAuditLogRepository auditLogRepository)
    {
        _invoiceService = invoiceService;
        _invoiceRepository = invoiceRepository;
        _communicationRepository = communicationRepository;
        _auditLogRepository = auditLogRepository;
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

    [HttpGet("export")]
    public async Task<IActionResult> ExportInvoices([FromQuery] InvoiceFilterRequest filter, [FromQuery] string format = "csv")
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var exportFilter = new InvoiceFilterRequest
        {
            SearchTerm = filter?.SearchTerm,
            CustomerId = filter?.CustomerId,
            Status = filter?.Status,
            StartDate = filter?.StartDate,
            EndDate = filter?.EndDate,
            Currency = filter?.Currency,
            PaymentState = filter?.PaymentState,
            MinOutstandingAmount = filter?.MinOutstandingAmount,
            MaxOutstandingAmount = filter?.MaxOutstandingAmount,
            MinTotalAmount = filter?.MinTotalAmount,
            MaxTotalAmount = filter?.MaxTotalAmount,
            SortBy = filter?.SortBy,
            SortOrder = filter?.SortOrder,
            Page = 1,
            PageSize = 10000
        };

        var paged = await _invoiceRepository.GetPagedAsync(tenantId.Value, exportFilter);

        if (string.Equals(format, "json", StringComparison.OrdinalIgnoreCase))
        {
            return Ok(ApiResponse<List<Invoice>>.Ok(paged.Items, "Export data generated."));
        }

        var sb = new System.Text.StringBuilder();
        sb.AppendLine("InvoiceNumber,Date,DueDate,Customer,Status,Currency,Subtotal,DiscountAmount,TaxAmount,ChargesAmount,TotalAmount,PaidAmount,BalanceAmount");
        foreach (var inv in paged.Items)
        {
            var custName = inv.Customer?.Name?.Replace("\"", "\"\"") ?? "";
            sb.AppendLine($"\"{inv.InvoiceNumber}\",\"{inv.InvoiceDate:yyyy-MM-dd}\",\"{inv.DueDate:yyyy-MM-dd}\",\"{custName}\",\"{inv.Status}\",\"{inv.Currency}\",{inv.Subtotal},{inv.DiscountAmount},{inv.TaxAmount},{inv.ChargesAmount},{inv.TotalAmount},{inv.PaidAmount},{inv.BalanceAmount}");
        }

        var fileBytes = System.Text.Encoding.UTF8.GetBytes(sb.ToString());
        return File(fileBytes, "text/csv", $"invoices_export_{DateTime.UtcNow:yyyyMMddHHmmss}.csv");
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

        if (request == null)
            return BadRequest(ApiResponse<Invoice>.Fail("Request cannot be null."));

        if (request.TenantId > 0 && request.TenantId != tenantId.Value)
            return Forbid();

        request.TenantId = tenantId.Value;
        var result = await _invoiceService.CreateDraftAsync(request, tenantId.Value, User.Identity?.Name);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPut("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<Invoice>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> UpdateDraft(int id, [FromBody] Invoice request)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        if (request == null)
            return BadRequest(ApiResponse<Invoice>.Fail("Request cannot be null."));

        if (request.TenantId > 0 && request.TenantId != tenantId.Value)
            return Forbid();

        var result = await _invoiceService.UpdateDraftAsync(id, request, tenantId.Value, User.Identity?.Name);
        
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

    [HttpPost("{id:int}/send")]
    [HttpPost("{id:int}/resend")]
    [HttpPost("{id:int}/deliver")]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status200OK)]
    [Authorize(Roles = "TenantAdmin,SuperAdmin")]
    public async Task<IActionResult> SendInvoice(int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _invoiceService.DeliverInvoiceAsync(id, tenantId.Value, User.Identity?.Name);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpGet("{id:int}/communications")]
    [ProducesResponseType(typeof(ApiResponse<List<InvoiceCommunication>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetCommunications(int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var comms = await _communicationRepository.GetByInvoiceIdAsync(id, tenantId.Value);
        return Ok(ApiResponse<List<InvoiceCommunication>>.Ok(comms, "Invoice communications retrieved."));
    }

    [HttpGet("{id:int}/audit")]
    [ProducesResponseType(typeof(ApiResponse<List<AuditLog>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetInvoiceAudit(int id)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var logs = await _auditLogRepository.GetByEntityAsync(tenantId.Value, "Invoice", id.ToString());
        return Ok(ApiResponse<List<AuditLog>>.Ok(logs, "Invoice audit logs retrieved."));
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




