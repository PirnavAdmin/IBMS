using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Webhook;
using Billing.Domain.Entities;
using Microsoft.Extensions.Logging;

namespace Billing.Application.Services;

public class WebhookDeliveryService : IWebhookDeliveryService
{
    private readonly IWebhookDeliveryRepository _deliveryRepository;
    private readonly IWebhookRepository _webhookRepository;
    private readonly IWebhookDispatcher _dispatcher;
    private readonly ILogger<WebhookDeliveryService> _logger;

    public WebhookDeliveryService(
        IWebhookDeliveryRepository deliveryRepository,
        IWebhookRepository webhookRepository,
        IWebhookDispatcher dispatcher,
        ILogger<WebhookDeliveryService> logger)
    {
        _deliveryRepository = deliveryRepository;
        _webhookRepository = webhookRepository;
        _dispatcher = dispatcher;
        _logger = logger;
    }

    public async Task<ApiResponse<PagedResult<WebhookDeliveryDto>>> GetDeliveriesAsync(WebhookDeliveryQueryParameters query, int tenantId)
    {
        var (items, totalCount) = await _deliveryRepository.GetPagedListAsync(query, tenantId);

        var dtos = items.Select(MapToDto).ToList();

        var page = query.PageNumber > 0 ? query.PageNumber : 1;
        var size = query.PageSize > 0 ? query.PageSize : 20;

        return ApiResponse<PagedResult<WebhookDeliveryDto>>.Ok(
            new PagedResult<WebhookDeliveryDto>(dtos, totalCount, page, size),
            "Webhook deliveries retrieved successfully.");
    }

    public async Task<ApiResponse<WebhookDeliveryDto>> GetDeliveryByIdAsync(int id, int tenantId)
    {
        var delivery = await _deliveryRepository.GetByIdAsync(id, tenantId);
        if (delivery == null)
            return ApiResponse<WebhookDeliveryDto>.Fail("Webhook delivery not found.");

        return ApiResponse<WebhookDeliveryDto>.Ok(MapToDto(delivery), "Webhook delivery retrieved successfully.");
    }

    public async Task<ApiResponse<ReplayDeliveryResponse>> ReplayDeliveryAsync(int deliveryId, int tenantId)
    {
        var delivery = await _deliveryRepository.GetByIdAsync(deliveryId, tenantId);
        if (delivery == null)
            return ApiResponse<ReplayDeliveryResponse>.Fail("Webhook delivery not found.");

        var webhook = delivery.Webhook ?? await _webhookRepository.GetByIdAsync(delivery.WebhookId, tenantId);
        if (webhook == null)
            return ApiResponse<ReplayDeliveryResponse>.Fail("The associated webhook destination no longer exists.");

        if (webhook.Status != "Active")
            return ApiResponse<ReplayDeliveryResponse>.Fail($"The webhook is currently {webhook.Status}. Please activate it before replaying.");

        _logger.LogInformation("Replaying WebhookDelivery {DeliveryId} for Tenant {TenantId}", deliveryId, tenantId);

        // Reset delivery state for replay
        delivery.Status = "Retrying";
        delivery.AttemptNumber = 1;
        delivery.MaxAttempts = 5;
        delivery.NextRetryUtc = null;
        delivery.FailureReason = null;

        var result = await _dispatcher.DispatchDeliveryAsync(delivery, webhook);

        var response = new ReplayDeliveryResponse
        {
            Success = result.Status == "Success",
            DeliveryId = result.Id,
            Message = result.Status == "Success" ? "Delivery replayed and succeeded." : $"Replay attempt completed with status: {result.Status}",
            Status = result.Status,
            AttemptNumber = result.AttemptNumber
        };

        return ApiResponse<ReplayDeliveryResponse>.Ok(response, response.Message);
    }

    private static WebhookDeliveryDto MapToDto(WebhookDelivery delivery)
    {
        return new WebhookDeliveryDto
        {
            Id = delivery.Id,
            TenantId = delivery.TenantId,
            WebhookId = delivery.WebhookId,
            WebhookName = delivery.Webhook?.Name,
            TargetUrl = delivery.Webhook?.TargetUrl,
            EventId = delivery.EventId,
            EventType = delivery.EventType,
            PayloadJson = delivery.PayloadJson,
            RequestHeadersJson = delivery.RequestHeadersJson,
            ResponseStatusCode = delivery.ResponseStatusCode,
            ResponseBody = delivery.ResponseBody,
            ExecutionDurationMs = delivery.ExecutionDurationMs,
            Status = delivery.Status,
            AttemptNumber = delivery.AttemptNumber,
            MaxAttempts = delivery.MaxAttempts,
            NextRetryUtc = delivery.NextRetryUtc,
            FailureReason = delivery.FailureReason,
            CreatedAtUtc = delivery.CreatedAtUtc,
            DeliveredAtUtc = delivery.DeliveredAtUtc
        };
    }
}
