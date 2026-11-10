namespace Billing.Domain.Entities;

public class PaymentGatewaySetting
{
    public int Id { get; set; }

    public int TenantId { get; set; } = 1;
    public Tenant? Tenant { get; set; }

    public string Provider { get; set; } = "Razorpay";

    public bool IsSandbox { get; set; } = true;

    public bool AllowTestSimulationTools { get; set; } = true;

    public string? RazorpayTestKeyId { get; set; }

    public string? RazorpayTestKeySecretProtected { get; set; }

    public string? RazorpayTestWebhookSecretProtected { get; set; }

    public string? RazorpayLiveKeyId { get; set; }

    public string? RazorpayLiveKeySecretProtected { get; set; }

    public string? RazorpayLiveWebhookSecretProtected { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAtUtc { get; set; }

    public string? UpdatedBy { get; set; }
}
