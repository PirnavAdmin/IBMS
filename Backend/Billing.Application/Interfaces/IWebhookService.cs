using Billing.Contracts;
using Billing.Contracts.Webhook;

namespace Billing.Application.Interfaces;

public interface IWebhookService
{
    Task<ApiResponse<PagedResult<WebhookDto>>> GetWebhooksAsync(WebhookQueryParameters query, int tenantId);
    Task<ApiResponse<WebhookDto>> GetWebhookByIdAsync(int id, int tenantId);
    Task<ApiResponse<WebhookDto>> CreateWebhookAsync(CreateWebhookRequest request, int tenantId);
    Task<ApiResponse<WebhookDto>> UpdateWebhookAsync(int id, UpdateWebhookRequest request, int tenantId);
    Task<ApiResponse<bool>> DeleteWebhookAsync(int id, int tenantId);
    Task<ApiResponse<WebhookDto>> ToggleStatusAsync(int id, int tenantId);
    Task<ApiResponse<RotateSecretResponse>> RotateSecretAsync(int id, int tenantId);
    Task<ApiResponse<WebhookPingResponse>> PingAsync(int id, int tenantId);
    List<WebhookEventDefinitionDto> GetAvailableEvents();
}
