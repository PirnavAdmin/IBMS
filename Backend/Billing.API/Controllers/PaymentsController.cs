using System.Security.Claims;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Payment;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers;

[ApiController]
[Route("api/v1/payments")]
[Authorize]
public class PaymentsController : ControllerBase
{
    private readonly IPaymentService _paymentService;

    public PaymentsController(IPaymentService paymentService)
    {
        _paymentService = paymentService;
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
            // Default authenticated staff/tenant admin fallback when role claim is not explicitly split
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

        return -1; // Deny access if Customer role has no bound CustomerId
    }

    [HttpPost]
    public async Task<ActionResult<ApiResponse<PaymentDetailDto>>> CreatePayment([FromBody] CreatePaymentRequest request)
    {
        if (request == null)
        {
            return BadRequest(ApiResponse<PaymentDetailDto>.Fail("Payment request payload is required."));
        }

        // Support Idempotency-Key or X-Idempotency-Key HTTP headers
        if (string.IsNullOrWhiteSpace(request.IdempotencyKey) && Request?.Headers != null)
        {
            if (Request.Headers.TryGetValue("Idempotency-Key", out var idemHeader) && !string.IsNullOrWhiteSpace(idemHeader))
            {
                request.IdempotencyKey = idemHeader.ToString().Trim();
            }
            else if (Request.Headers.TryGetValue("X-Idempotency-Key", out var xIdemHeader) && !string.IsNullOrWhiteSpace(xIdemHeader))
            {
                request.IdempotencyKey = xIdemHeader.ToString().Trim();
            }
        }

        var tenantId = GetTenantId();
        var result = await _paymentService.CreatePaymentAsync(
            tenantId,
            request,
            GetUserDisplayName(),
            GetUserRoles(),
            GetUserPermissions(),
            GetRestrictedCustomerId());

        if (!result.IsSuccess)
        {
            return ToErrorActionResult(result);
        }

        var message = result.IsIdempotentReplay
            ? "Payment already processed (idempotent replay)."
            : "Payment recorded successfully.";

        var response = ApiResponse<PaymentDetailDto>.Ok(result.Data!, message);
        if (result.StatusCode == 201 && !result.IsIdempotentReplay)
        {
            return StatusCode(201, response);
        }

        return Ok(response);
    }

    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<PaymentListItemDto>>>> GetPayments([FromQuery] PaymentListFilterRequest filter)
    {
        var tenantId = GetTenantId();
        var result = await _paymentService.GetPagedPaymentsAsync(
            tenantId,
            filter ?? new PaymentListFilterRequest(),
            GetUserRoles(),
            GetRestrictedCustomerId());

        if (!result.IsSuccess)
        {
            return ToErrorActionResult(result);
        }

        return Ok(ApiResponse<PagedResult<PaymentListItemDto>>.Ok(result.Data!));
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ApiResponse<PaymentDetailDto>>> GetPaymentById(int id)
    {
        var tenantId = GetTenantId();
        var result = await _paymentService.GetPaymentByIdAsync(
            tenantId,
            id,
            GetUserRoles(),
            GetRestrictedCustomerId());

        if (!result.IsSuccess)
        {
            return ToErrorActionResult(result);
        }

        return Ok(ApiResponse<PaymentDetailDto>.Ok(result.Data!));
    }

    [HttpPost("{id:int}/reverse")]
    public async Task<ActionResult<ApiResponse<PaymentDetailDto>>> ReversePayment(
        int id,
        [FromBody] ReversePaymentRequest request)
    {
        var tenantId = GetTenantId();
        var result = await _paymentService.ReversePaymentAsync(
            tenantId,
            id,
            request,
            GetUserDisplayName(),
            GetUserRoles(),
            GetUserPermissions());

        if (!result.IsSuccess)
        {
            return ToErrorActionResult(result);
        }

        return Ok(ApiResponse<PaymentDetailDto>.Ok(result.Data!, "Payment reversed and invoice balance restored successfully."));
    }

    [HttpPatch("{id:int}/status")]
    public async Task<ActionResult<ApiResponse<PaymentDetailDto>>> UpdatePaymentStatus(
        int id,
        [FromBody] UpdatePaymentStatusRequest request)
    {
        var tenantId = GetTenantId();
        var result = await _paymentService.UpdatePaymentStatusAsync(
            tenantId,
            id,
            request,
            GetUserDisplayName(),
            GetUserRoles(),
            GetUserPermissions());

        if (!result.IsSuccess)
        {
            return ToErrorActionResult(result);
        }

        return Ok(ApiResponse<PaymentDetailDto>.Ok(result.Data!, "Payment status updated successfully."));
    }

    [HttpGet("{id:int}/audit")]
    public async Task<ActionResult<ApiResponse<List<PaymentAuditEventDto>>>> GetPaymentAuditHistory(int id)
    {
        var tenantId = GetTenantId();
        var result = await _paymentService.GetPaymentAuditHistoryAsync(
            tenantId,
            id,
            GetRestrictedCustomerId());

        if (!result.IsSuccess)
        {
            return ToErrorActionResult(result);
        }

        return Ok(ApiResponse<List<PaymentAuditEventDto>>.Ok(result.Data!));
    }

    [HttpGet("eligible-invoices")]
    public async Task<ActionResult<ApiResponse<List<EligibleInvoiceBalanceDto>>>> GetEligibleInvoices([FromQuery] int? customerId = null)
    {
        var tenantId = GetTenantId();
        var result = await _paymentService.GetEligibleInvoicesAsync(
            tenantId,
            customerId,
            GetRestrictedCustomerId());

        if (!result.IsSuccess)
        {
            return ToErrorActionResult(result);
        }

        return Ok(ApiResponse<List<EligibleInvoiceBalanceDto>>.Ok(result.Data!));
    }

    [HttpGet("invoices/{invoiceId:int}/balance")]
    public async Task<ActionResult<ApiResponse<EligibleInvoiceBalanceDto>>> GetInvoiceBalance(int invoiceId)
    {
        var tenantId = GetTenantId();
        var result = await _paymentService.GetInvoiceBalanceAsync(
            tenantId,
            invoiceId,
            GetRestrictedCustomerId());

        if (!result.IsSuccess)
        {
            return ToErrorActionResult(result);
        }

        return Ok(ApiResponse<EligibleInvoiceBalanceDto>.Ok(result.Data!));
    }

    private ActionResult<ApiResponse<T>> ToErrorActionResult<T>(PaymentOperationResult<T> result)
    {
        var response = ApiResponse<T>.Fail(result.ErrorMessage ?? "Operation failed.", result.ValidationErrors);
        return result.StatusCode switch
        {
            404 => NotFound(response),
            403 => StatusCode(403, response),
            409 => Conflict(response),
            _ => BadRequest(response)
        };
    }
}
