using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Billing.Application.Common;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Payment;
using Billing.Domain.Entities;
using Billing.Domain.Enums;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using QRCoder;

namespace Billing.Infrastructure.Services;

public class PaymentGatewayService : IPaymentGatewayService
{
    private static readonly HttpClient SharedHttpClient = new() { Timeout = TimeSpan.FromSeconds(15) };
    private readonly IInvoiceRepository _invoiceRepository;
    private readonly IPaymentService _paymentService;
    private readonly IInvoiceTemplateRepository _templateRepository;
    private readonly IPaymentLedgerService? _ledgerService;
    private readonly BillingDbContext? _dbContext;
    private readonly IConfiguration? _configuration;
    private readonly ISecretEncryptionService? _secretEncryptionService;
    private readonly ILogger<PaymentGatewayService> _logger;

    public PaymentGatewayService(
        IInvoiceRepository invoiceRepository,
        IPaymentService paymentService,
        IInvoiceTemplateRepository templateRepository,
        ILogger<PaymentGatewayService> logger,
        IPaymentLedgerService? ledgerService = null,
        BillingDbContext? dbContext = null,
        IConfiguration? configuration = null,
        ISecretEncryptionService? secretEncryptionService = null)
    {
        _invoiceRepository = invoiceRepository;
        _paymentService = paymentService;
        _templateRepository = templateRepository;
        _logger = logger;
        _ledgerService = ledgerService;
        _dbContext = dbContext;
        _configuration = configuration;
        _secretEncryptionService = secretEncryptionService;
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

        var gatewaySettings = await LoadGatewaySettingAsync(tenantId);
        var isSandbox = gatewaySettings?.IsSandbox ?? true;
        var allowTestTools = isSandbox && (gatewaySettings?.AllowTestSimulationTools ?? true);
        var activeKeyId = isSandbox
            ? (string.IsNullOrWhiteSpace(gatewaySettings?.RazorpayTestKeyId) ? "rzp_test_ibms_sandbox" : gatewaySettings.RazorpayTestKeyId.Trim())
            : gatewaySettings?.RazorpayLiveKeyId?.Trim();
        var activeKeySecret = isSandbox
            ? UnprotectSecret(gatewaySettings?.RazorpayTestKeySecretProtected)
            : UnprotectSecret(gatewaySettings?.RazorpayLiveKeySecretProtected);

        if (!isSandbox && (string.IsNullOrWhiteSpace(activeKeyId) || !activeKeyId.StartsWith("rzp_live_", StringComparison.OrdinalIgnoreCase) || string.IsNullOrWhiteSpace(activeKeySecret)))
        {
            return ApiResponse<PaymentOrderDto>.Fail("Live payment mode requires configured Razorpay Live Key ID and Key Secret.");
        }

        var orderId = $"order_{Guid.NewGuid():N}"[..20];
        var hasRazorpayOrder = false;
        var hasGatewayCredentials = !string.IsNullOrWhiteSpace(activeKeyId)
            && !string.Equals(activeKeyId, "rzp_test_ibms_sandbox", StringComparison.OrdinalIgnoreCase)
            && !string.IsNullOrWhiteSpace(activeKeySecret);
        if (!request.SkipGatewayOrderCreation && hasGatewayCredentials)
        {
            var (ok, rzpOrderId, errMsg) = await CreateRazorpayOrderAsync(
                activeKeyId!,
                activeKeySecret!,
                amountToPay,
                invoice.Currency ?? "INR",
                invoice.InvoiceNumber,
                invoice.Id,
                invoice.TenantId);
            if (!ok || string.IsNullOrWhiteSpace(rzpOrderId))
            {
                return ApiResponse<PaymentOrderDto>.Fail(errMsg ?? "Unable to initialize Razorpay payment order.");
            }
            orderId = rzpOrderId;
            hasRazorpayOrder = true;
        }
        var upiId = "9014177402@ybl";
        string? bankName = null;
        string? accountNumber = null;
        string? ifscCode = null;
        string? accountHolderName = null;
        string? branch = null;
        bool netBankingEnabled = true;
        string? netBankingProvider = "Razorpay NetBanking";
        string? netBankingInstructions = "Select your bank and complete Retail or Corporate NetBanking OTP authorization.";
        var supportedNetBankingBanks = new List<string>
        {
            "Abhyudaya Co-operative Bank",
            "Airtel Payments Bank",
            "Andhra Pragathi Grameena Bank",
            "Andhra Pradesh Grameena Vikas Bank",
            "AP Mahesh Co-operative Urban Bank",
            "AU Small Finance Bank",
            "Axis Bank",
            "Bandhan Bank",
            "Bank of America India",
            "Bank of Baroda",
            "Bank of India",
            "Bank of Maharashtra",
            "Barclays Bank India",
            "Baroda Gujarat Gramin Bank",
            "Baroda Rajasthan Kshetriya Gramin Bank",
            "Baroda UP Bank",
            "BNP Paribas India",
            "Canara Bank",
            "Capital Small Finance Bank",
            "Central Bank of India",
            "Chaitanya Godavari Grameena Bank",
            "Citibank India",
            "City Union Bank",
            "Cosmos Co-operative Bank",
            "CSB Bank",
            "DBS Bank India",
            "DCB Bank",
            "Deutsche Bank India",
            "Dhanlaxmi Bank",
            "Equitas Small Finance Bank",
            "ESAF Small Finance Bank",
            "Federal Bank",
            "Fino Payments Bank",
            "HDFC Bank",
            "HSBC India",
            "ICICI Bank",
            "IDBI Bank",
            "IDFC First Bank",
            "India Post Payments Bank",
            "Indian Bank",
            "Indian Overseas Bank",
            "IndusInd Bank",
            "Jammu & Kashmir Bank",
            "Jana Small Finance Bank",
            "Jio Payments Bank",
            "JPMorgan Chase Bank India",
            "Kalupur Commercial Co-operative Bank",
            "Karnataka Bank",
            "Karnataka Gramin Bank",
            "Karnataka Vikas Grameena Bank",
            "Karur Vysya Bank",
            "Kerala Gramin Bank",
            "Kotak Mahindra Bank",
            "Maharashtra Gramin Bank",
            "Nainital Bank",
            "North East Small Finance Bank",
            "NSDL Payments Bank",
            "Paytm Payments Bank",
            "Punjab & Sind Bank",
            "Punjab National Bank",
            "RBL Bank",
            "Saptagiri Grameena Bank",
            "Saraswat Co-operative Bank",
            "Sarva Haryana Gramin Bank",
            "Shamrao Vithal Co-operative Bank (SVC Bank)",
            "Shivalik Small Finance Bank",
            "South Indian Bank",
            "Standard Chartered Bank",
            "State Bank of India",
            "Suryoday Small Finance Bank",
            "Tamil Nadu Grama Bank",
            "Tamilnad Mercantile Bank",
            "Telangana Grameena Bank",
            "TJSB Sahakari Bank",
            "UCO Bank",
            "Ujjivan Small Finance Bank",
            "Union Bank of India",
            "Unity Small Finance Bank",
            "Utkarsh Small Finance Bank",
            "Yes Bank"
        };

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
                if ((root.TryGetProperty("NetBankingEnabled", out var nbeProp) || root.TryGetProperty("netBankingEnabled", out nbeProp)) && (nbeProp.ValueKind == JsonValueKind.True || nbeProp.ValueKind == JsonValueKind.False))
                    netBankingEnabled = nbeProp.GetBoolean();
                if (root.TryGetProperty("NetBankingProvider", out var nbpProp) || root.TryGetProperty("netBankingProvider", out nbpProp))
                {
                    var val = nbpProp.GetString();
                    if (!string.IsNullOrWhiteSpace(val)) netBankingProvider = val.Trim();
                }
                if (root.TryGetProperty("NetBankingInstructions", out var nbiProp) || root.TryGetProperty("netBankingInstructions", out nbiProp))
                {
                    var val = nbiProp.GetString();
                    if (!string.IsNullOrWhiteSpace(val)) netBankingInstructions = val.Trim();
                }
                if (root.TryGetProperty("NetBankingBanks", out var nbbProp) || root.TryGetProperty("netBankingBanks", out nbbProp))
                {
                    var rawBanks = nbbProp.GetString()?.Trim();
                    const string legacyPreset = "HDFC Bank, ICICI Bank, State Bank of India, Axis Bank, Kotak Mahindra Bank, Union Bank of India";
                    if (!string.IsNullOrWhiteSpace(rawBanks) &&
                        !string.Equals(rawBanks, legacyPreset, StringComparison.OrdinalIgnoreCase))
                    {
                        var parsedBanks = rawBanks.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                            .Distinct(StringComparer.OrdinalIgnoreCase)
                            .ToList();
                        if (parsedBanks.Count > 0) supportedNetBankingBanks = parsedBanks;
                    }
                }
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

        decimal? lastPaidAmount = invoice.PaidAmount > 0 ? invoice.PaidAmount : null;
        DateTime? lastPaymentDate = null;
        if (invoice.PaidAmount > 0 && _dbContext != null)
        {
            var latestAlloc = await _dbContext.InvoicePaymentAllocations
                .AsNoTracking()
                .Include(a => a.Payment)
                .Where(a => a.TenantId == tenantId
                    && a.InvoiceId == invoice.Id
                    && !a.IsReversed
                    && a.Payment != null
                    && a.Payment.Status == PaymentStatus.Completed)
                .OrderByDescending(a => a.Payment!.CreatedAtUtc)
                .ThenByDescending(a => a.Id)
                .Select(a => new { a.AllocatedAmount, a.Payment!.PaymentDate })
                .FirstOrDefaultAsync();
            if (latestAlloc != null)
            {
                lastPaidAmount = latestAlloc.AllocatedAmount;
                lastPaymentDate = latestAlloc.PaymentDate;
            }
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
            LastPaidAmount = lastPaidAmount,
            LastPaymentDate = lastPaymentDate,
            BalanceAmount = invoice.BalanceAmount,
            AllowPartialPayments = invoice.AllowPartialPayments,
            Status = invoice.Status,
            Currency = invoice.Currency ?? "INR",
            KeyId = activeKeyId ?? "rzp_test_ibms_sandbox",
            UpiId = upiId,
            BankName = bankName,
            AccountNumber = accountNumber,
            IfscCode = ifscCode,
            AccountHolderName = accountHolderName,
            Branch = branch,
            NetBankingEnabled = netBankingEnabled,
            NetBankingProvider = netBankingProvider,
            NetBankingInstructions = netBankingInstructions,
            SupportedNetBankingBanks = supportedNetBankingBanks,
            CustomerName = invoice.Customer?.Name,
            CustomerEmail = invoice.Customer?.Email,
            CustomerPhone = invoice.Customer?.Phone,
            PaymentLink = $"{Billing.Application.Common.AppUrlResolver.GetFrontendBaseUrl()}/pay/{invoice.Id}?tenantId={invoice.TenantId}",
            UpiUri = upiUri,
            QrCodeBase64 = qrBase64,
            IsSandbox = isSandbox,
            AllowTestSimulationTools = allowTestTools,
            HasRazorpayOrder = hasRazorpayOrder,
            IsGatewayConfigured = hasGatewayCredentials,
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

        var gatewaySettings = await LoadGatewaySettingAsync(tenantId);
        var isSandbox = gatewaySettings?.IsSandbox ?? true;
        var allowTestTools = isSandbox && (gatewaySettings?.AllowTestSimulationTools ?? true);
        var activeKeySecret = isSandbox
            ? UnprotectSecret(gatewaySettings?.RazorpayTestKeySecretProtected)
            : UnprotectSecret(gatewaySettings?.RazorpayLiveKeySecretProtected);

        if (!allowTestTools)
        {
            if (string.Equals(request.Gateway, "UPI_Simulated", StringComparison.OrdinalIgnoreCase))
            {
                return ApiResponse<PaymentDetailDto>.Fail("Simulated payments are disabled when Checkout Test Mode is turned off.");
            }

            if (!string.Equals(request.Gateway, "Razorpay_Webhook", StringComparison.OrdinalIgnoreCase))
            {
                if (!string.Equals(request.Gateway, "Razorpay", StringComparison.OrdinalIgnoreCase))
                {
                    return ApiResponse<PaymentDetailDto>.Fail("Checkout Test Mode is disabled. Online payments must be completed via Razorpay Checkout.");
                }
                if (string.IsNullOrWhiteSpace(activeKeySecret) ||
                    string.IsNullOrWhiteSpace(request.OrderId) ||
                    string.IsNullOrWhiteSpace(request.PaymentId) ||
                    !VerifyRazorpayPaymentSignature(activeKeySecret, request.OrderId, request.PaymentId, request.Signature))
                {
                    return ApiResponse<PaymentDetailDto>.Fail("Invalid Razorpay payment signature verification.");
                }
            }
        }
        else if (string.Equals(request.Gateway, "Razorpay", StringComparison.OrdinalIgnoreCase) &&
                 !string.IsNullOrWhiteSpace(activeKeySecret) &&
                 !string.IsNullOrWhiteSpace(request.OrderId) &&
                 !string.IsNullOrWhiteSpace(request.PaymentId) &&
                 !string.Equals(request.Signature, "rzp_sig", StringComparison.Ordinal))
        {
            if (!VerifyRazorpayPaymentSignature(activeKeySecret, request.OrderId, request.PaymentId, request.Signature))
            {
                return ApiResponse<PaymentDetailDto>.Fail("Invalid Razorpay test payment signature verification.");
            }
        }

        var paymentId = string.IsNullOrWhiteSpace(request.PaymentId) ? $"pay_{Guid.NewGuid():N}"[..20] : request.PaymentId.Trim();
        var amount = request.Amount > 0 ? request.Amount : invoice.BalanceAmount;

        var isInternetBanking = string.Equals(request.Gateway, "InternetBanking", StringComparison.OrdinalIgnoreCase) ||
                                string.Equals(request.Gateway, "NetBanking", StringComparison.OrdinalIgnoreCase);
        var isBankTransfer = string.Equals(request.Gateway, "BankTransfer", StringComparison.OrdinalIgnoreCase);
        var isUpi = request.Gateway?.Contains("UPI", StringComparison.OrdinalIgnoreCase) == true;
        var isCard = string.Equals(request.Gateway, "Card", StringComparison.OrdinalIgnoreCase) ||
                     string.Equals(request.Gateway, "CreditCard", StringComparison.OrdinalIgnoreCase) ||
                     string.Equals(request.Gateway, "DebitCard", StringComparison.OrdinalIgnoreCase);
        var method = isInternetBanking ? "InternetBanking" : (isBankTransfer ? "BankTransfer" : (isUpi ? "UPI" : (isCard ? "Card" : "Gateway")));
        var bankLabel = !string.IsNullOrWhiteSpace(request.BankName) ? request.BankName.Trim() : null;
        var provider = isInternetBanking ? (bankLabel != null ? $"{bankLabel} NetBanking" : "Internet Banking") : (isBankTransfer ? "Bank Transfer" : (isUpi ? "UPI Payment" : (isCard ? "Credit / Debit Card" : (request.Gateway ?? "Razorpay"))));
        var reference = isInternetBanking || isBankTransfer || isUpi || isCard ? paymentId : $"{request.OrderId}|{paymentId}";

        // Record the payment cleanly through the existing PaymentService
        var createRequest = new CreatePaymentRequest
        {
            InvoiceId = invoice.Id,
            CustomerId = invoice.CustomerId,
            Amount = amount,
            Currency = invoice.Currency ?? "INR",
            Method = method,
            ProviderName = provider,
            BankName = bankLabel,
            AccountLabel = !string.IsNullOrWhiteSpace(request.AccountType) ? request.AccountType.Trim() : null,
            ProviderTransactionId = paymentId,
            CustomMethodName = provider,
            Reference = reference,
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

        // Real-time automatic logging to Excel / CSV Ledger for tracking and webhooks
        if (_ledgerService != null)
        {
            try
            {
                var updatedInv = await _invoiceRepository.GetByIdAsync(invoice.Id, tenantId);
                var remBal = updatedInv?.BalanceAmount ?? Math.Max(0, invoice.BalanceAmount - amount);
                var statusStr = remBal <= 0 ? "Fully Paid" : "Partially Paid";
                var payViaLabel = isInternetBanking ? $"Internet Banking{(bankLabel != null ? $" ({bankLabel})" : "")}" : (isUpi ? "UPI (GPay/PhonePe)" : (isCard ? "Credit/Debit Card" : (isBankTransfer ? "Bank Transfer" : (request.Gateway ?? "Online Gateway"))));

                _ = _ledgerService.LogPaymentAsync(new PaymentLedgerEntry
                {
                    TenantId = tenantId,
                    InvoiceId = invoice.Id,
                    InvoiceNumber = invoice.InvoiceNumber,
                    CustomerName = invoice.Customer?.Name ?? "Valued Customer",
                    CustomerPhone = invoice.Customer?.Phone ?? string.Empty,
                    CustomerEmail = invoice.Customer?.Email ?? string.Empty,
                    TotalAmount = invoice.TotalAmount,
                    AmountPaid = amount,
                    BalanceDue = remBal,
                    PayVia = payViaLabel,
                    TransactionReference = reference,
                    PaymentStatus = statusStr,
                    Source = performedBy
                });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not append payment to Excel ledger for Invoice {InvoiceId}", invoice.Id);
            }
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

    public async Task<ApiResponse<PaymentGatewaySettingsDto>> GetGatewaySettingsAsync(int tenantId)
    {
        var row = await LoadGatewaySettingAsync(tenantId);
        return ApiResponse<PaymentGatewaySettingsDto>.Ok(
            MapSettingsDto(tenantId, row),
            "Payment gateway settings retrieved successfully.");
    }

    public async Task<ApiResponse<PaymentGatewaySettingsDto>> UpdateGatewaySettingsAsync(
        int tenantId,
        UpdatePaymentGatewaySettingsRequest request,
        string performedBy)
    {
        if (_dbContext == null)
        {
            return ApiResponse<PaymentGatewaySettingsDto>.Fail("Database context is unavailable for gateway settings.");
        }

        var testKeyId = string.IsNullOrWhiteSpace(request.RazorpayTestKeyId) ? null : request.RazorpayTestKeyId.Trim();
        var liveKeyId = string.IsNullOrWhiteSpace(request.RazorpayLiveKeyId) ? null : request.RazorpayLiveKeyId.Trim();

        if (!string.IsNullOrWhiteSpace(testKeyId) && !testKeyId.StartsWith("rzp_test_", StringComparison.OrdinalIgnoreCase))
        {
            return ApiResponse<PaymentGatewaySettingsDto>.Fail("Razorpay Test Key ID must start with 'rzp_test_'.");
        }

        if (!string.IsNullOrWhiteSpace(liveKeyId) && !liveKeyId.StartsWith("rzp_live_", StringComparison.OrdinalIgnoreCase))
        {
            return ApiResponse<PaymentGatewaySettingsDto>.Fail("Razorpay Live Key ID must start with 'rzp_live_'.");
        }

        var entity = await _dbContext.PaymentGatewaySettings.FirstOrDefaultAsync(x => x.TenantId == tenantId);
        var isNew = entity == null;
        entity ??= new PaymentGatewaySetting { TenantId = tenantId, CreatedAtUtc = DateTime.UtcNow };

        entity.Provider = string.IsNullOrWhiteSpace(request.Provider) ? "Razorpay" : request.Provider.Trim();
        entity.IsSandbox = request.IsSandbox;
        entity.AllowTestSimulationTools = request.AllowTestSimulationTools;
        entity.RazorpayTestKeyId = testKeyId;
        entity.RazorpayLiveKeyId = liveKeyId;

        if (request.ClearTestKeySecret) entity.RazorpayTestKeySecretProtected = null;
        else if (!string.IsNullOrWhiteSpace(request.RazorpayTestKeySecret))
            entity.RazorpayTestKeySecretProtected = ProtectSecret(request.RazorpayTestKeySecret.Trim());

        if (request.ClearTestWebhookSecret) entity.RazorpayTestWebhookSecretProtected = null;
        else if (!string.IsNullOrWhiteSpace(request.RazorpayTestWebhookSecret))
            entity.RazorpayTestWebhookSecretProtected = ProtectSecret(request.RazorpayTestWebhookSecret.Trim());

        if (request.ClearLiveKeySecret) entity.RazorpayLiveKeySecretProtected = null;
        else if (!string.IsNullOrWhiteSpace(request.RazorpayLiveKeySecret))
            entity.RazorpayLiveKeySecretProtected = ProtectSecret(request.RazorpayLiveKeySecret.Trim());

        if (request.ClearLiveWebhookSecret) entity.RazorpayLiveWebhookSecretProtected = null;
        else if (!string.IsNullOrWhiteSpace(request.RazorpayLiveWebhookSecret))
            entity.RazorpayLiveWebhookSecretProtected = ProtectSecret(request.RazorpayLiveWebhookSecret.Trim());

        if (!entity.IsSandbox)
        {
            var hasLiveSecret = !string.IsNullOrWhiteSpace(UnprotectSecret(entity.RazorpayLiveKeySecretProtected));
            if (string.IsNullOrWhiteSpace(entity.RazorpayLiveKeyId) || !hasLiveSecret)
            {
                return ApiResponse<PaymentGatewaySettingsDto>.Fail(
                    "To enable Live Mode, please enter both your Razorpay Live Key ID (rzp_live_...) and Live Key Secret.");
            }
        }

        entity.UpdatedAtUtc = DateTime.UtcNow;
        entity.UpdatedBy = performedBy;

        if (isNew)
            await _dbContext.PaymentGatewaySettings.AddAsync(entity);
        else
            _dbContext.PaymentGatewaySettings.Update(entity);

        await _dbContext.SaveChangesAsync();

        return ApiResponse<PaymentGatewaySettingsDto>.Ok(
            MapSettingsDto(tenantId, entity),
            entity.IsSandbox
                ? "Payment gateway saved in Sandbox (Test Mode)."
                : "Payment gateway switched to Live Working Mode.");
    }

    public async Task<bool> IsTestSimulationAllowedAsync(int tenantId)
    {
        var row = await LoadGatewaySettingAsync(tenantId);
        var isSandbox = row?.IsSandbox ?? true;
        var allowTools = row?.AllowTestSimulationTools ?? true;
        return isSandbox && allowTools;
    }

    public async Task<bool> VerifyWebhookSignatureAsync(int tenantId, string rawBody, string? signatureHeader)
    {
        var row = await LoadGatewaySettingAsync(tenantId);
        var isSandbox = row?.IsSandbox ?? true;
        var webhookSecret = isSandbox
            ? UnprotectSecret(row?.RazorpayTestWebhookSecretProtected)
            : UnprotectSecret(row?.RazorpayLiveWebhookSecretProtected);

        if (string.IsNullOrWhiteSpace(webhookSecret))
        {
            // In Live Mode, webhook secret is mandatory; in local dev Sandbox without secret, allow test webhook payloads.
            return isSandbox;
        }

        if (string.IsNullOrWhiteSpace(signatureHeader)) return false;

        var expected = ComputeHmacSha256Hex(webhookSecret, rawBody);
        return FixedTimeEqualsHex(expected, signatureHeader.Trim());
    }

    private async Task<PaymentGatewaySetting?> LoadGatewaySettingAsync(int tenantId)
    {
        if (_dbContext == null) return null;
        return await _dbContext.PaymentGatewaySettings
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.TenantId == tenantId);
    }

    private PaymentGatewaySettingsDto MapSettingsDto(int tenantId, PaymentGatewaySetting? entity)
    {
        var hasTestSecret = !string.IsNullOrWhiteSpace(UnprotectSecret(entity?.RazorpayTestKeySecretProtected));
        var hasTestWebhook = !string.IsNullOrWhiteSpace(UnprotectSecret(entity?.RazorpayTestWebhookSecretProtected));
        var hasLiveSecret = !string.IsNullOrWhiteSpace(UnprotectSecret(entity?.RazorpayLiveKeySecretProtected));
        var hasLiveWebhook = !string.IsNullOrWhiteSpace(UnprotectSecret(entity?.RazorpayLiveWebhookSecretProtected));
        var testKeyId = entity?.RazorpayTestKeyId;
        var liveKeyId = entity?.RazorpayLiveKeyId;

        return new PaymentGatewaySettingsDto
        {
            TenantId = tenantId,
            Provider = entity?.Provider ?? "Razorpay",
            IsSandbox = entity?.IsSandbox ?? true,
            AllowTestSimulationTools = entity?.AllowTestSimulationTools ?? true,
            RazorpayTestKeyId = testKeyId,
            HasTestKeySecret = hasTestSecret,
            HasTestWebhookSecret = hasTestWebhook,
            RazorpayLiveKeyId = liveKeyId,
            HasLiveKeySecret = hasLiveSecret,
            HasLiveWebhookSecret = hasLiveWebhook,
            TestGatewayReady = !string.IsNullOrWhiteSpace(testKeyId) && testKeyId.StartsWith("rzp_test_", StringComparison.OrdinalIgnoreCase) && hasTestSecret,
            LiveModeReady = !string.IsNullOrWhiteSpace(liveKeyId) && liveKeyId.StartsWith("rzp_live_", StringComparison.OrdinalIgnoreCase) && hasLiveSecret,
            WebhookEndpointUrl = $"{AppUrlResolver.GetApiBaseUrl()}/api/v1/payments/gateway/webhook",
            UpdatedAtUtc = entity?.UpdatedAtUtc,
            UpdatedBy = entity?.UpdatedBy
        };
    }

    private async Task<(bool Success, string? OrderId, string? ErrorMessage)> CreateRazorpayOrderAsync(
        string keyId,
        string keySecret,
        decimal amount,
        string currency,
        string invoiceNumber,
        int invoiceId,
        int tenantId)
    {
        try
        {
            var amountPaise = (long)Math.Round(amount * 100m, MidpointRounding.AwayFromZero);
            var payload = new
            {
                amount = amountPaise,
                currency = string.IsNullOrWhiteSpace(currency) ? "INR" : currency.ToUpperInvariant(),
                receipt = string.IsNullOrWhiteSpace(invoiceNumber) ? $"INV-{invoiceId}" : invoiceNumber,
                notes = new Dictionary<string, string>
                {
                    ["invoiceId"] = invoiceId.ToString(),
                    ["tenantId"] = tenantId.ToString(),
                    ["invoiceNumber"] = invoiceNumber
                }
            };

            using var req = new HttpRequestMessage(HttpMethod.Post, "https://api.razorpay.com/v1/orders");
            var basic = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{keyId}:{keySecret}"));
            req.Headers.Authorization = new AuthenticationHeaderValue("Basic", basic);
            req.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

            using var res = await SharedHttpClient.SendAsync(req);
            var body = await res.Content.ReadAsStringAsync();

            if (!res.IsSuccessStatusCode)
            {
                _logger.LogWarning("Razorpay order creation failed ({Status}): {Body}", res.StatusCode, body);
                return (false, null, $"Razorpay API rejected order creation ({(int)res.StatusCode}). Check your Razorpay Key ID/Secret.");
            }

            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.TryGetProperty("id", out var idProp))
            {
                return (true, idProp.GetString(), null);
            }

            return (false, null, "Razorpay API returned an unexpected order response.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Razorpay order creation request failed for Invoice {InvoiceId}", invoiceId);
            return (false, null, $"Could not connect to Razorpay API: {ex.Message}");
        }
    }

    private byte[] DeriveAesKey()
    {
        var seed = _configuration?["PaymentGateway:EncryptionKey"]
            ?? _configuration?["JwtSettings:SecretKey"]
            ?? _configuration?["Jwt:Key"]
            ?? "IBMS-Default-Gateway-Key-Dev-Only";
        return SHA256.HashData(Encoding.UTF8.GetBytes($"IBMS.PaymentGatewaySecret.v1:{seed}"));
    }

    private string? ProtectSecret(string? plainText)
    {
        if (string.IsNullOrWhiteSpace(plainText)) return null;
        if (_secretEncryptionService != null)
        {
            return _secretEncryptionService.Protect(plainText);
        }

        var plainBytes = Encoding.UTF8.GetBytes(plainText);
        var nonce = RandomNumberGenerator.GetBytes(12);
        var tag = new byte[16];
        var cipher = new byte[plainBytes.Length];
        using var aes = new AesGcm(DeriveAesKey(), 16);
        aes.Encrypt(nonce, plainBytes, cipher, tag);

        var combined = new byte[nonce.Length + tag.Length + cipher.Length];
        Buffer.BlockCopy(nonce, 0, combined, 0, nonce.Length);
        Buffer.BlockCopy(tag, 0, combined, nonce.Length, tag.Length);
        Buffer.BlockCopy(cipher, 0, combined, nonce.Length + tag.Length, cipher.Length);
        return "enc:v1:" + Convert.ToBase64String(combined);
    }

    private string? UnprotectSecret(string? stored)
    {
        if (string.IsNullOrWhiteSpace(stored)) return null;
        if (_secretEncryptionService != null)
        {
            return _secretEncryptionService.Unprotect(stored);
        }

        const string prefix = "enc:v1:";
        if (!stored.StartsWith(prefix, StringComparison.Ordinal)) return stored;
        try
        {
            var combined = Convert.FromBase64String(stored.Substring(prefix.Length));
            if (combined.Length < 29) return null;
            var nonce = combined[..12];
            var tag = combined[12..28];
            var cipher = combined[28..];
            var plain = new byte[cipher.Length];
            using var aes = new AesGcm(DeriveAesKey(), 16);
            aes.Decrypt(nonce, cipher, tag, plain);
            return Encoding.UTF8.GetString(plain);
        }
        catch
        {
            return null;
        }
    }

    private static string ComputeHmacSha256Hex(string secret, string payload)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(payload));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static bool VerifyRazorpayPaymentSignature(string keySecret, string orderId, string paymentId, string? signature)
    {
        if (string.IsNullOrWhiteSpace(signature)) return false;
        var expected = ComputeHmacSha256Hex(keySecret, $"{orderId}|{paymentId}");
        return FixedTimeEqualsHex(expected, signature.Trim());
    }

    private static bool FixedTimeEqualsHex(string a, string b)
    {
        var aBytes = Encoding.UTF8.GetBytes(a.ToLowerInvariant());
        var bBytes = Encoding.UTF8.GetBytes(b.ToLowerInvariant());
        return aBytes.Length == bBytes.Length && CryptographicOperations.FixedTimeEquals(aBytes, bBytes);
    }
}
