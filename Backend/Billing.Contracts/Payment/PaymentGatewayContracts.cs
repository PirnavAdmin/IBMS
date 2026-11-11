namespace Billing.Contracts.Payment;

public class CreatePaymentOrderRequest
{
    public int InvoiceId { get; set; }
    public int? TenantId { get; set; }
    public decimal? Amount { get; set; }
    public string? Currency { get; set; } = "INR";
    public string Gateway { get; set; } = "Razorpay";
}

public class PaymentOrderDto
{
    public string OrderId { get; set; } = string.Empty;
    public string Gateway { get; set; } = "Razorpay";
    public int InvoiceId { get; set; }
    public int TenantId { get; set; }
    public string InvoiceNumber { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public decimal TotalAmount { get; set; }
    public decimal PaidAmount { get; set; }
    public decimal? LastPaidAmount { get; set; }
    public DateTime? LastPaymentDate { get; set; }
    public decimal BalanceAmount { get; set; }
    public bool AllowPartialPayments { get; set; } = true;
    public string? Status { get; set; }
    public string Currency { get; set; } = "INR";
    public string? KeyId { get; set; } = "rzp_test_ibms_sandbox";
    public string? UpiId { get; set; }
    public string? BankName { get; set; }
    public string? AccountNumber { get; set; }
    public string? IfscCode { get; set; }
    public string? AccountHolderName { get; set; }
    public string? Branch { get; set; }
    public bool NetBankingEnabled { get; set; } = true;
    public string? NetBankingProvider { get; set; }
    public string? NetBankingInstructions { get; set; }
    public List<string>? SupportedNetBankingBanks { get; set; }
    public string? CustomerName { get; set; }
    public string? CustomerEmail { get; set; }
    public string? CustomerPhone { get; set; }
    public string? PaymentLink { get; set; }
    public string? UpiUri { get; set; }
    public string? QrCodeBase64 { get; set; }
    public bool IsSandbox { get; set; } = true;
    public bool AllowTestSimulationTools { get; set; } = true;
    public bool HasRazorpayOrder { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public class VerifyGatewayPaymentRequest
{
    public int InvoiceId { get; set; }
    public int? TenantId { get; set; }
    public string OrderId { get; set; } = string.Empty;
    public string PaymentId { get; set; } = string.Empty;
    public string? Signature { get; set; }
    public string Gateway { get; set; } = "Razorpay";
    public decimal Amount { get; set; }
    public string? BankName { get; set; }
    public string? AccountType { get; set; }
}

public class SimulateQrPaymentRequest
{
    public int? TenantId { get; set; }
    public decimal? Amount { get; set; }
    public string? UtrReference { get; set; }
}

public class PaymentGatewaySettingsDto
{
    public int TenantId { get; set; }
    public string Provider { get; set; } = "Razorpay";
    public bool IsSandbox { get; set; } = true;
    public bool AllowTestSimulationTools { get; set; } = true;
    public string? RazorpayTestKeyId { get; set; }
    public bool HasTestKeySecret { get; set; }
    public bool HasTestWebhookSecret { get; set; }
    public string? RazorpayLiveKeyId { get; set; }
    public bool HasLiveKeySecret { get; set; }
    public bool HasLiveWebhookSecret { get; set; }
    public bool TestGatewayReady { get; set; }
    public bool LiveModeReady { get; set; }
    public string WebhookEndpointUrl { get; set; } = string.Empty;
    public DateTime? UpdatedAtUtc { get; set; }
    public string? UpdatedBy { get; set; }
}

public class UpdatePaymentGatewaySettingsRequest
{
    public string? Provider { get; set; } = "Razorpay";
    public bool IsSandbox { get; set; } = true;
    public bool AllowTestSimulationTools { get; set; } = true;
    public string? RazorpayTestKeyId { get; set; }
    public string? RazorpayTestKeySecret { get; set; }
    public bool ClearTestKeySecret { get; set; }
    public string? RazorpayTestWebhookSecret { get; set; }
    public bool ClearTestWebhookSecret { get; set; }
    public string? RazorpayLiveKeyId { get; set; }
    public string? RazorpayLiveKeySecret { get; set; }
    public bool ClearLiveKeySecret { get; set; }
    public string? RazorpayLiveWebhookSecret { get; set; }
    public bool ClearLiveWebhookSecret { get; set; }
}
