using System.Text;
using System.Text.Json;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Payment;
using Billing.Domain.Enums;
using Microsoft.Extensions.Logging;
using QRCoder;

namespace Billing.Infrastructure.Services;

public class PaymentGatewayService : IPaymentGatewayService
{
    private readonly IInvoiceRepository _invoiceRepository;
    private readonly IPaymentService _paymentService;
    private readonly IInvoiceTemplateRepository _templateRepository;
    private readonly ILogger<PaymentGatewayService> _logger;

    public PaymentGatewayService(
        IInvoiceRepository invoiceRepository,
        IPaymentService paymentService,
        IInvoiceTemplateRepository templateRepository,
        ILogger<PaymentGatewayService> logger)
    {
        _invoiceRepository = invoiceRepository;
        _paymentService = paymentService;
        _templateRepository = templateRepository;
        _logger = logger;
    }

    public async Task<ApiResponse<PaymentOrderDto>> CreateOrderAsync(int tenantId, CreatePaymentOrderRequest request)
    {
        var invoice = await _invoiceRepository.GetByIdAsync(request.InvoiceId, tenantId);
        if (invoice == null)
        {
            return ApiResponse<PaymentOrderDto>.Fail("Invoice not found.");
        }

        if (invoice.BalanceAmount <= 0)
        {
            return ApiResponse<PaymentOrderDto>.Fail("Invoice has no outstanding balance.");
        }

        var amountToPay = request.Amount.HasValue && request.Amount.Value > 0 && request.Amount.Value <= invoice.BalanceAmount
            ? request.Amount.Value
            : invoice.BalanceAmount;

        var orderId = $"order_{Guid.NewGuid():N}"[..20];
        var upiId = "9014177402@ybl";
        string? bankName = null;
        string? accountNumber = null;
        string? ifscCode = null;
        string? accountHolderName = null;
        string? branch = null;

        // Try getting tenant's template UPI & Bank details if available
        try
        {
            var defaultTemplate = await _templateRepository.GetDefaultTemplateAsync(tenantId);
            var version = defaultTemplate?.Versions?.OrderByDescending(v => v.VersionNumber).FirstOrDefault();
            if (version != null && !string.IsNullOrWhiteSpace(version.PaymentInstructionsJson))
            {
                using var doc = JsonDocument.Parse(version.PaymentInstructionsJson);
                var root = doc.RootElement;
                if (root.TryGetProperty("UpiId", out var upiProp) || root.TryGetProperty("upiId", out upiProp))
                {
                    var val = upiProp.GetString();
                    if (!string.IsNullOrWhiteSpace(val))
                    {
                        upiId = val.Trim();
                    }
                }
                if (root.TryGetProperty("BankName", out var bnProp) || root.TryGetProperty("bankName", out bnProp))
                    bankName = bnProp.GetString();
                if (root.TryGetProperty("AccountNumber", out var anProp) || root.TryGetProperty("accountNumber", out anProp))
                    accountNumber = anProp.GetString();
                if (root.TryGetProperty("IfscCode", out var ifscProp) || root.TryGetProperty("ifscCode", out ifscProp))
                    ifscCode = ifscProp.GetString();
                if (root.TryGetProperty("AccountHolderName", out var ahProp) || root.TryGetProperty("accountHolderName", out ahProp))
                    accountHolderName = ahProp.GetString();
                if (root.TryGetProperty("Branch", out var brProp) || root.TryGetProperty("branch", out brProp))
                    branch = brProp.GetString();
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not load template UPI/Bank settings for Tenant {TenantId}", tenantId);
        }

        // Standard UPI Payment URI specification: upi://pay?pa=...&pn=...&am=...&cu=INR&tn=...
        var payeeName = Uri.EscapeDataString(accountHolderName ?? invoice.Customer?.Name ?? "IBMS Invoice");
        var note = Uri.EscapeDataString($"Payment for {invoice.InvoiceNumber}");
        var upiUri = $"upi://pay?pa={upiId}&pn={payeeName}&am={amountToPay:F2}&cu=INR&tn={note}&tr={invoice.InvoiceNumber}";

        // Generate QR code bytes using QRCoder
        string qrBase64 = string.Empty;
        try
        {
            using var qrGenerator = new QRCodeGenerator();
            using var qrCodeData = qrGenerator.CreateQrCode(upiUri, QRCodeGenerator.ECCLevel.M);
            using var qrCode = new PngByteQRCode(qrCodeData);
            var qrBytes = qrCode.GetGraphic(15);
            qrBase64 = Convert.ToBase64String(qrBytes);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not generate QR code for Invoice {InvoiceId}", invoice.Id);
        }

        var orderDto = new PaymentOrderDto
        {
            OrderId = orderId,
            Gateway = request.Gateway ?? "Razorpay",
            InvoiceId = invoice.Id,
            TenantId = invoice.TenantId,
            InvoiceNumber = invoice.InvoiceNumber,
            Amount = amountToPay,
            TotalAmount = invoice.TotalAmount,
            PaidAmount = invoice.PaidAmount,
            BalanceAmount = invoice.BalanceAmount,
            Status = invoice.Status,
            Currency = invoice.Currency ?? "INR",
            KeyId = "rzp_test_ibms_sandbox",
            UpiId = upiId,
            BankName = bankName,
            AccountNumber = accountNumber,
            IfscCode = ifscCode,
            AccountHolderName = accountHolderName,
            Branch = branch,
            CustomerName = invoice.Customer?.Name,
            CustomerEmail = invoice.Customer?.Email,
            CustomerPhone = invoice.Customer?.Phone,
            PaymentLink = $"http://localhost:3000/pay/{invoice.Id}?tenantId={invoice.TenantId}",
            UpiUri = upiUri,
            QrCodeBase64 = qrBase64,
            IsSandbox = true,
            CreatedAtUtc = DateTime.UtcNow
        };

        return ApiResponse<PaymentOrderDto>.Ok(orderDto, "Payment order created successfully.");
    }

    public async Task<ApiResponse<PaymentDetailDto>> VerifyAndProcessPaymentAsync(
        int tenantId,
        VerifyGatewayPaymentRequest request,
        string performedBy)
    {
        var invoice = await _invoiceRepository.GetByIdAsync(request.InvoiceId, tenantId);
        if (invoice == null)
        {
            return ApiResponse<PaymentDetailDto>.Fail("Invoice not found.");
        }

        var paymentId = string.IsNullOrWhiteSpace(request.PaymentId) ? $"pay_{Guid.NewGuid():N}"[..20] : request.PaymentId.Trim();
        var amount = request.Amount > 0 ? request.Amount : invoice.BalanceAmount;

        // Record the payment cleanly through the existing PaymentService
        var createRequest = new CreatePaymentRequest
        {
            InvoiceId = invoice.Id,
            CustomerId = invoice.CustomerId,
            Amount = amount,
            Currency = invoice.Currency ?? "INR",
            Method = "Gateway",
            ProviderName = request.Gateway ?? "Razorpay",
            ProviderTransactionId = paymentId,
            CustomMethodName = request.Gateway ?? "Razorpay",
            Reference = $"{request.OrderId}|{paymentId}",
            PaymentDate = DateTime.UtcNow,
            Allocations = new List<CreatePaymentAllocationRequest>
            {
                new()
                {
                    InvoiceId = invoice.Id,
                    AllocatedAmount = amount
                }
            }
        };

        var roles = new[] { "TenantAdmin", "SuperAdmin", "User" };
        var permissions = new[] { "payments.create", "billing.admin" };

        var result = await _paymentService.CreatePaymentAsync(tenantId, createRequest, performedBy, roles, permissions);

        if (!result.IsSuccess)
        {
            return ApiResponse<PaymentDetailDto>.Fail(result.ErrorMessage ?? "Payment allocation failed.");
        }

        _logger.LogInformation("Gateway payment {PaymentId} recorded for Invoice {InvoiceId} ({Amount} {Currency})",
            paymentId, invoice.Id, amount, invoice.Currency);

        return ApiResponse<PaymentDetailDto>.Ok(result.Data!, "Gateway payment verified and applied successfully.");
    }

    public async Task<byte[]> GenerateInvoiceQrCodeAsync(int tenantId, int invoiceId)
    {
        var invoice = await _invoiceRepository.GetByIdAsync(invoiceId, tenantId);
        var upiId = "billing@ibms";
        var amount = invoice?.BalanceAmount ?? 0m;
        var invNum = invoice?.InvoiceNumber ?? $"INV-{invoiceId}";

        try
        {
            var defaultTemplate = await _templateRepository.GetDefaultTemplateAsync(tenantId);
            var version = defaultTemplate?.Versions?.OrderByDescending(v => v.VersionNumber).FirstOrDefault();
            if (version != null && !string.IsNullOrWhiteSpace(version.PaymentInstructionsJson))
            {
                using var doc = JsonDocument.Parse(version.PaymentInstructionsJson);
                if (doc.RootElement.TryGetProperty("UpiId", out var upiProp) || doc.RootElement.TryGetProperty("upiId", out upiProp))
                {
                    var val = upiProp.GetString();
                    if (!string.IsNullOrWhiteSpace(val))
                    {
                        upiId = val.Trim();
                    }
                }
            }
        }
        catch
        {
            // fallback to default
        }

        var upiUri = $"upi://pay?pa={upiId}&pn=IBMS&am={amount:F2}&cu=INR&tn={Uri.EscapeDataString(invNum)}";
        using var qrGenerator = new QRCodeGenerator();
        using var qrCodeData = qrGenerator.CreateQrCode(upiUri, QRCodeGenerator.ECCLevel.M);
        using var qrCode = new PngByteQRCode(qrCodeData);
        return qrCode.GetGraphic(15);
    }
}
