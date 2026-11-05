using System.Security.Claims;
using System.Text.Json;
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
    private readonly IPaymentGatewayService? _gatewayService;

    public PaymentsController(IPaymentService paymentService, IPaymentGatewayService? gatewayService = null)
    {
        _paymentService = paymentService;
        _gatewayService = gatewayService;
    }

    private int? GetTenantId()
    {
        if (User.IsInRole("SuperAdmin"))
        {
            if (Request?.Headers != null && Request.Headers.TryGetValue("X-Tenant-Id", out var headerVal))
            {
                if (int.TryParse(headerVal.ToString(), out var headerTenantId) && headerTenantId > 0)
                {
                    return headerTenantId;
                }
            }
            return 1;
        }

        var claim = User.FindFirst("tenant_id")?.Value ?? User.FindFirst("TenantId")?.Value;
        if (int.TryParse(claim, out var tenantId) && tenantId > 0)
        {
            return tenantId;
        }

        return null;
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

        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

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

        var result = await _paymentService.CreatePaymentAsync(
            tenantId.Value,
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
        if (!tenantId.HasValue) return Forbid();

        var result = await _paymentService.GetPagedPaymentsAsync(
            tenantId.Value,
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
        if (!tenantId.HasValue) return Forbid();

        var result = await _paymentService.GetPaymentByIdAsync(
            tenantId.Value,
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
        if (!tenantId.HasValue) return Forbid();

        var result = await _paymentService.ReversePaymentAsync(
            tenantId.Value,
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
        if (!tenantId.HasValue) return Forbid();

        var result = await _paymentService.UpdatePaymentStatusAsync(
            tenantId.Value,
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
        if (!tenantId.HasValue) return Forbid();

        var result = await _paymentService.GetPaymentAuditHistoryAsync(
            tenantId.Value,
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
        if (!tenantId.HasValue) return Forbid();

        var result = await _paymentService.GetEligibleInvoicesAsync(
            tenantId.Value,
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
        if (!tenantId.HasValue) return Forbid();

        var result = await _paymentService.GetInvoiceBalanceAsync(
            tenantId.Value,
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

    [HttpPost("gateway/create-order")]
    [AllowAnonymous]
    public async Task<IActionResult> CreateGatewayOrder([FromBody] CreatePaymentOrderRequest request, [FromQuery] int? tenantId)
    {
        var targetTenant = tenantId ?? request.TenantId ?? GetTenantId() ?? 2;

        if (_gatewayService == null) return BadRequest(ApiResponse<PaymentOrderDto>.Fail("Payment gateway service not configured."));
        var result = await _gatewayService.CreateOrderAsync(targetTenant, request);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPost("gateway/verify")]
    [AllowAnonymous]
    public async Task<IActionResult> VerifyGatewayPayment([FromBody] VerifyGatewayPaymentRequest request, [FromQuery] int? tenantId)
    {
        var targetTenant = tenantId ?? request.TenantId ?? GetTenantId() ?? 2;

        var performedBy = GetUserDisplayName() ?? "Customer (Online)";
        if (_gatewayService == null) return BadRequest(ApiResponse<PaymentDetailDto>.Fail("Payment gateway service not configured."));
        var result = await _gatewayService.VerifyAndProcessPaymentAsync(targetTenant, request, performedBy);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpGet("gateway/qr/{invoiceId:int}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetInvoiceQrCode(int invoiceId, [FromQuery] int? tenantId)
    {
        var targetTenant = tenantId ?? GetTenantId() ?? 1;
        if (_gatewayService == null) return NotFound();
        var qrBytes = await _gatewayService.GenerateInvoiceQrCodeAsync(targetTenant, invoiceId);
        return File(qrBytes, "image/png");
    }

    [HttpGet("gateway/invoice-status/{invoiceId:int}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetInvoiceStatus(int invoiceId, [FromQuery] int? tenantId)
    {
        var targetTenant = tenantId ?? GetTenantId() ?? 2;
        var balanceResult = await _paymentService.GetInvoiceBalanceAsync(targetTenant, invoiceId, null);
        if (!balanceResult.IsSuccess || balanceResult.Data == null)
        {
            return NotFound(ApiResponse<object>.Fail("Invoice not found."));
        }

        var data = balanceResult.Data;
        return Ok(ApiResponse<object>.Ok(new
        {
            invoiceId = data.InvoiceId,
            invoiceNumber = data.InvoiceNumber,
            totalAmount = data.TotalAmount,
            paidAmount = data.PaidAmount,
            balanceAmount = data.BalanceAmount,
            status = data.Status,
            currency = data.Currency,
            isPaid = string.Equals(data.Status, "Paid", StringComparison.OrdinalIgnoreCase) || data.BalanceAmount <= 0,
            isPartiallyPaid = string.Equals(data.Status, "Partially Paid", StringComparison.OrdinalIgnoreCase)
        }));
    }

    [HttpPost("gateway/simulate-qr-payment/{invoiceId:int}")]
    [AllowAnonymous]
    public async Task<IActionResult> SimulateQrPayment(int invoiceId, [FromQuery] int? tenantId, [FromBody] SimulateQrPaymentRequest? request)
    {
        var targetTenant = tenantId ?? request?.TenantId ?? GetTenantId() ?? 2;
        if (_gatewayService == null) return BadRequest(ApiResponse<PaymentDetailDto>.Fail("Payment gateway service not configured."));

        var utrRef = !string.IsNullOrWhiteSpace(request?.UtrReference)
            ? request.UtrReference.Trim()
            : $"UPI{DateTime.UtcNow:yyyyMMddHHmmss}{Random.Shared.Next(1000, 9999)}";

        var verifyReq = new VerifyGatewayPaymentRequest
        {
            InvoiceId = invoiceId,
            TenantId = targetTenant,
            OrderId = $"order_qr_{invoiceId}_{DateTime.UtcNow.Ticks}",
            PaymentId = utrRef,
            Amount = request?.Amount ?? 0,
            Gateway = "UPI_Simulated"
        };

        var performedBy = GetUserDisplayName() ?? "UPI App Simulation";
        var result = await _gatewayService.VerifyAndProcessPaymentAsync(targetTenant, verifyReq, performedBy);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPost("gateway/webhook")]
    [AllowAnonymous]
    public async Task<IActionResult> GatewayWebhook([FromBody] JsonElement payload, [FromQuery] int? tenantId)
    {
        try
        {
            var targetTenant = tenantId ?? GetTenantId() ?? 2;

            string? paymentId = null;
            string? orderId = null;
            decimal amount = 0m;
            int invoiceId = 0;

            if (payload.TryGetProperty("payload", out var payloadObj) && payloadObj.TryGetProperty("payment", out var paymentObj) && paymentObj.TryGetProperty("entity", out var entityObj))
            {
                if (entityObj.TryGetProperty("id", out var pId)) paymentId = pId.GetString();
                if (entityObj.TryGetProperty("order_id", out var oId)) orderId = oId.GetString();
                if (entityObj.TryGetProperty("amount", out var amt)) amount = amt.GetDecimal() / 100m;

                if (entityObj.TryGetProperty("notes", out var notesObj))
                {
                    if (notesObj.TryGetProperty("invoiceId", out var invProp))
                    {
                        if (invProp.ValueKind == JsonValueKind.Number) invoiceId = invProp.GetInt32();
                        else if (int.TryParse(invProp.GetString(), out var parsedId)) invoiceId = parsedId;
                    }
                    if (notesObj.TryGetProperty("tenantId", out var tProp))
                    {
                        if (tProp.ValueKind == JsonValueKind.Number) targetTenant = tProp.GetInt32();
                        else if (int.TryParse(tProp.GetString(), out var parsedT)) targetTenant = parsedT;
                    }
                }
            }
            else if (payload.TryGetProperty("invoiceId", out var directInv))
            {
                invoiceId = directInv.GetInt32();
                if (payload.TryGetProperty("paymentId", out var directPid)) paymentId = directPid.GetString();
                if (payload.TryGetProperty("amount", out var directAmt)) amount = directAmt.GetDecimal();
                if (payload.TryGetProperty("orderId", out var directOid)) orderId = directOid.GetString();
            }

            if (invoiceId <= 0)
            {
                return Ok(new { status = "ignored", reason = "No invoice identifier in webhook payload" });
            }

            if (_gatewayService == null) return BadRequest("Payment gateway not configured.");

            var verifyReq = new VerifyGatewayPaymentRequest
            {
                InvoiceId = invoiceId,
                TenantId = targetTenant,
                OrderId = orderId ?? $"wh_{Guid.NewGuid():N}"[..20],
                PaymentId = paymentId ?? $"pay_wh_{DateTime.UtcNow.Ticks}",
                Amount = amount,
                Gateway = "Razorpay_Webhook"
            };

            var performedBy = "Gateway Webhook";
            var result = await _gatewayService.VerifyAndProcessPaymentAsync(targetTenant, verifyReq, performedBy);
            return result.Success ? Ok(result) : BadRequest(result);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }

}
