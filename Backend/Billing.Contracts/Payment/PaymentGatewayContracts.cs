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
    public string? CustomerName { get; set; }
    public string? CustomerEmail { get; set; }
    public string? CustomerPhone { get; set; }
    public string? PaymentLink { get; set; }
    public string? UpiUri { get; set; }
    public string? QrCodeBase64 { get; set; }
    public bool IsSandbox { get; set; } = true;
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
}
