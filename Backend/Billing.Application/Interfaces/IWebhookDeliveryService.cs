using Billing.Contracts;
using Billing.Contracts.Webhook;

namespace Billing.Application.Interfaces;

public interface IWebhookDeliveryService
{
    Task<ApiResponse<PagedResult<WebhookDeliveryDto>>> GetDeliveriesAsync(WebhookDeliveryQueryParameters query, int tenantId);
    Task<ApiResponse<WebhookDeliveryDto>> GetDeliveryByIdAsync(int id, int tenantId);
    Task<ApiResponse<ReplayDeliveryResponse>> ReplayDeliveryAsync(int deliveryId, int tenantId);
}
