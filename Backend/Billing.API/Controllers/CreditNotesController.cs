using System.Security.Claims;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.CreditNote;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers;

[ApiController]
[Route("api/v1/credit-notes")]
[Authorize]
public class CreditNotesController : ControllerBase
{
    private readonly ICreditNoteService _creditNoteService;

    public CreditNotesController(ICreditNoteService creditNoteService)
    {
        _creditNoteService = creditNoteService;
    }

    private int GetTenantId()
    {
        var claim = User.FindFirst("tenant_id")?.Value ?? User.FindFirst("TenantId")?.Value;
        if (int.TryParse(claim, out var tenantId) && tenantId > 0)
        {
            return tenantId;
        }

        if (Request?.Headers != null && Request.Headers.TryGetValue("X-Tenant-Id", out var headerVal))
        {
            if (int.TryParse(headerVal.ToString(), out var headerTenantId) && headerTenantId > 0)
            {
                return headerTenantId;
            }
        }

        return 1;
    }

    private string GetUserDisplayName()
    {
        return User.FindFirst("name")?.Value
            ?? User.FindFirst(ClaimTypes.Name)?.Value
            ?? User.FindFirst(ClaimTypes.Email)?.Value
            ?? User.Identity?.Name
            ?? "System";
    }

    private List<string> GetUserRoles()
    {
        var roles = new List<string>();
        foreach (var claim in User.FindAll(ClaimTypes.Role))
        {
            if (!string.IsNullOrWhiteSpace(claim.Value))
            {
                roles.AddRange(claim.Value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
            }
        }
        foreach (var claim in User.FindAll("role"))
        {
            if (!string.IsNullOrWhiteSpace(claim.Value))
            {
                roles.AddRange(claim.Value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
            }
        }
        foreach (var claim in User.FindAll("roles"))
        {
            if (!string.IsNullOrWhiteSpace(claim.Value))
            {
                roles.AddRange(claim.Value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
            }
        }

        if (roles.Count == 0)
        {
            roles.Add("TenantAdmin");
        }

        return roles.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    private List<string> GetUserPermissions()
    {
        var permissions = new List<string>();
        foreach (var claim in User.FindAll("permissions"))
        {
            if (!string.IsNullOrWhiteSpace(claim.Value))
            {
                permissions.AddRange(claim.Value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
            }
        }
        foreach (var claim in User.FindAll("permission"))
        {
            if (!string.IsNullOrWhiteSpace(claim.Value))
            {
                permissions.AddRange(claim.Value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
            }
        }
        return permissions.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    private int? GetRestrictedCustomerId()
    {
        var roles = GetUserRoles();
        var isCustomerOnly = roles.Count > 0
            && roles.All(r => string.Equals(r, "Customer", StringComparison.OrdinalIgnoreCase));

        if (!isCustomerOnly)
        {
            return null;
        }

        var customerClaim = User.FindFirst("customer_id")?.Value ?? User.FindFirst("CustomerId")?.Value;
        if (int.TryParse(customerClaim, out var customerId) && customerId > 0)
        {
            return customerId;
        }

        return -1;
    }

    [HttpPost]
    public async Task<ActionResult<ApiResponse<CreditNoteDetailDto>>> CreateCreditNote([FromBody] CreateCreditNoteRequest request)
    {
        if (request == null)
        {
            return BadRequest(ApiResponse<CreditNoteDetailDto>.Fail("Request payload is required."));
        }

        var tenantId = GetTenantId();
        var result = await _creditNoteService.CreateCreditNoteAsync(
            tenantId,
            request,
            GetUserDisplayName(),
            GetUserRoles(),
            GetUserPermissions(),
            GetRestrictedCustomerId());

        if (!result.Success)
        {
            return BadRequest(result);
        }

        return StatusCode(201, result);
    }

    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<CreditNoteListItemDto>>>> GetCreditNotes([FromQuery] CreditNoteFilterRequest filter)
    {
        var tenantId = GetTenantId();
        var result = await _creditNoteService.GetPagedCreditNotesAsync(
            tenantId,
            filter ?? new CreditNoteFilterRequest(),
            GetUserRoles(),
            GetRestrictedCustomerId());

        return Ok(result);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ApiResponse<CreditNoteDetailDto>>> GetCreditNoteById(int id)
    {
        var tenantId = GetTenantId();
        var result = await _creditNoteService.GetCreditNoteByIdAsync(
            tenantId,
            id,
            GetUserRoles(),
            GetRestrictedCustomerId());

        if (!result.Success)
        {
            return NotFound(result);
        }

        return Ok(result);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<ApiResponse<CreditNoteDetailDto>>> UpdateDraft(int id, [FromBody] UpdateCreditNoteRequest request)
    {
        if (request == null)
        {
            return BadRequest(ApiResponse<CreditNoteDetailDto>.Fail("Request payload is required."));
        }

        var tenantId = GetTenantId();
        var result = await _creditNoteService.UpdateCreditNoteDraftAsync(
            tenantId,
            id,
            request,
            GetUserDisplayName(),
            GetUserRoles(),
            GetUserPermissions(),
            GetRestrictedCustomerId());

        if (!result.Success)
        {
            return BadRequest(result);
        }

        return Ok(result);
    }

    [HttpPost("{id:int}/submit")]
    public async Task<ActionResult<ApiResponse<CreditNoteDetailDto>>> SubmitForApproval(int id)
    {
        var tenantId = GetTenantId();
        var result = await _creditNoteService.SubmitForApprovalAsync(
            tenantId,
            id,
            GetUserDisplayName(),
            GetUserRoles(),
            GetUserPermissions());

        if (!result.Success)
        {
            return BadRequest(result);
        }

        return Ok(result);
    }

    [HttpPost("{id:int}/approve")]
    public async Task<ActionResult<ApiResponse<CreditNoteDetailDto>>> ApproveCreditNote(int id)
    {
        var tenantId = GetTenantId();
        var result = await _creditNoteService.ApproveCreditNoteAsync(
            tenantId,
            id,
            GetUserDisplayName(),
            GetUserRoles(),
            GetUserPermissions());

        if (!result.Success)
        {
            return BadRequest(result);
        }

        return Ok(result);
    }

    [HttpPost("{id:int}/reject")]
    public async Task<ActionResult<ApiResponse<CreditNoteDetailDto>>> RejectCreditNote(int id, [FromBody] RejectCreditNoteRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.Reason))
        {
            return BadRequest(ApiResponse<CreditNoteDetailDto>.Fail("Rejection reason is required."));
        }

        var tenantId = GetTenantId();
        var result = await _creditNoteService.RejectCreditNoteAsync(
            tenantId,
            id,
            request,
            GetUserDisplayName(),
            GetUserRoles(),
            GetUserPermissions());

        if (!result.Success)
        {
            return BadRequest(result);
        }

        return Ok(result);
    }

    [HttpPost("{id:int}/issue")]
    public async Task<ActionResult<ApiResponse<CreditNoteDetailDto>>> IssueCreditNote(int id)
    {
        var tenantId = GetTenantId();
        var result = await _creditNoteService.IssueCreditNoteAsync(
            tenantId,
            id,
            GetUserDisplayName(),
            GetUserRoles(),
            GetUserPermissions());

        if (!result.Success)
        {
            return BadRequest(result);
        }

        return Ok(result);
    }

    [HttpPost("{id:int}/cancel")]
    public async Task<ActionResult<ApiResponse<CreditNoteDetailDto>>> CancelCreditNote(int id, [FromBody] CancelCreditNoteRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.Reason))
        {
            return BadRequest(ApiResponse<CreditNoteDetailDto>.Fail("Cancellation reason is required."));
        }

        var tenantId = GetTenantId();
        var result = await _creditNoteService.CancelCreditNoteAsync(
            tenantId,
            id,
            request,
            GetUserDisplayName(),
            GetUserRoles(),
            GetUserPermissions());

        if (!result.Success)
        {
            return BadRequest(result);
        }

        return Ok(result);
    }

    [HttpPost("{id:int}/refund")]
    public async Task<ActionResult<ApiResponse<CreditNoteDetailDto>>> ProcessRefund(int id, [FromBody] ProcessRefundRequest request)
    {
        if (request == null)
        {
            return BadRequest(ApiResponse<CreditNoteDetailDto>.Fail("Refund request payload is required."));
        }

        var tenantId = GetTenantId();
        var result = await _creditNoteService.ProcessRefundAsync(
            tenantId,
            id,
            request,
            GetUserDisplayName(),
            GetUserRoles(),
            GetUserPermissions());

        if (!result.Success)
        {
            return BadRequest(result);
        }

        return Ok(result);
    }

    [HttpGet("invoices/{invoiceId:int}/creditable-summary")]
    public async Task<ActionResult<ApiResponse<InvoiceCreditableSummaryDto>>> GetInvoiceCreditableSummary(int invoiceId)
    {
        var tenantId = GetTenantId();
        var result = await _creditNoteService.GetInvoiceCreditableSummaryAsync(
            tenantId,
            invoiceId,
            GetUserRoles(),
            GetRestrictedCustomerId());

        if (!result.Success)
        {
            return NotFound(result);
        }

        return Ok(result);
    }
}
