using Billing.Contracts;
using Billing.Contracts.Payment;

namespace Billing.Application.Interfaces;

public interface IPaymentGatewayService
{
    Task<ApiResponse<PaymentOrderDto>> CreateOrderAsync(int tenantId, CreatePaymentOrderRequest request);
    Task<ApiResponse<PaymentDetailDto>> VerifyAndProcessPaymentAsync(int tenantId, VerifyGatewayPaymentRequest request, string performedBy);
    Task<byte[]> GenerateInvoiceQrCodeAsync(int tenantId, int invoiceId);
    Task<ApiResponse<PaymentGatewaySettingsDto>> GetGatewaySettingsAsync(int tenantId);
    Task<ApiResponse<PaymentGatewaySettingsDto>> UpdateGatewaySettingsAsync(int tenantId, UpdatePaymentGatewaySettingsRequest request, string performedBy);
    Task<bool> IsTestSimulationAllowedAsync(int tenantId);
    Task<bool> VerifyWebhookSignatureAsync(int tenantId, string rawBody, string? signatureHeader);
}
