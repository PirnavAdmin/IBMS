using System.Text.Json;
using Billing.Application.Interfaces;
using Billing.Domain.Entities;
using Microsoft.Extensions.Logging;

namespace Billing.Application.Services;

public class OutboxService : IOutboxService
{
    private readonly IOutboxRepository _outboxRepository;
    private readonly IWebhookRepository _webhookRepository;
    private readonly IWebhookDeliveryRepository _deliveryRepository;
    private readonly IWebhookDispatcher _dispatcher;
    private readonly ILogger<OutboxService> _logger;

    public OutboxService(
        IOutboxRepository outboxRepository,
        IWebhookRepository webhookRepository,
        IWebhookDeliveryRepository deliveryRepository,
        IWebhookDispatcher dispatcher,
        ILogger<OutboxService> logger)
    {
        _outboxRepository = outboxRepository;
        _webhookRepository = webhookRepository;
        _deliveryRepository = deliveryRepository;
        _dispatcher = dispatcher;
        _logger = logger;
    }

    public async Task<OutboxMessage> PublishEventAsync(int tenantId, string eventType, object payload, string? eventId = null)
    {
        var resolvedEventId = string.IsNullOrWhiteSpace(eventId) ? Guid.NewGuid().ToString("N") : eventId;
        var payloadJson = payload is string str ? str : JsonSerializer.Serialize(payload);

        var message = new OutboxMessage
        {
            TenantId = tenantId,
            EventId = resolvedEventId,
            EventType = eventType,
            PayloadJson = payloadJson,
            Status = "Pending",
            CreatedAtUtc = DateTime.UtcNow
        };

        var saved = await _outboxRepository.AddAsync(message);
        _logger.LogInformation("Outbox event {EventType} ({EventId}) published for Tenant {TenantId}", eventType, resolvedEventId, tenantId);

        return saved;
    }

    public async Task<int> ProcessPendingOutboxMessagesAsync(CancellationToken cancellationToken = default)
    {
        var pending = await _outboxRepository.GetPendingMessagesAsync(50);
        var processedCount = 0;

        foreach (var message in pending)
        {
            if (cancellationToken.IsCancellationRequested) break;

            try
            {
                await DispatchSingleMessageAsync(message);
                processedCount++;
            }
            catch (Exception ex)
            {
                message.RetryCount++;
                message.Error = ex.Message;
                if (message.RetryCount >= 5)
                {
                    message.Status = "Failed";
                }
                await _outboxRepository.UpdateAsync(message);
                _logger.LogError(ex, "Failed to process Outbox message {MessageId}", message.Id);
            }
        }

        return processedCount;
    }

    public async Task<int> ProcessPendingRetriesAsync(CancellationToken cancellationToken = default)
    {
        var retries = await _deliveryRepository.GetPendingRetriesAsync(50);
        var retriedCount = 0;

        foreach (var delivery in retries)
        {
            if (cancellationToken.IsCancellationRequested) break;

            try
            {
                var webhook = delivery.Webhook ?? await _webhookRepository.GetByIdAsync(delivery.WebhookId, delivery.TenantId);
                if (webhook != null && webhook.Status == "Active")
                {
                    await _dispatcher.DispatchDeliveryAsync(delivery, webhook);
                    retriedCount++;
                }
                else
                {
                    delivery.Status = "DeadLetter";
                    delivery.FailureReason = "Associated webhook is inactive or was deleted.";
                    delivery.NextRetryUtc = null;
                    await _deliveryRepository.UpdateAsync(delivery);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error executing retry for WebhookDelivery {DeliveryId}", delivery.Id);
            }
        }

        return retriedCount;
    }

    private async Task DispatchSingleMessageAsync(OutboxMessage message)
    {
        message.Status = "Processing";
        await _outboxRepository.UpdateAsync(message);

        var webhooks = await _webhookRepository.GetActiveByEventAsync(message.TenantId, message.EventType);

        if (webhooks.Count == 0)
        {
            message.Status = "Published";
            message.ProcessedAtUtc = DateTime.UtcNow;
            await _outboxRepository.UpdateAsync(message);
            return;
        }

        foreach (var webhook in webhooks)
        {
            var delivery = new WebhookDelivery
            {
                TenantId = message.TenantId,
                WebhookId = webhook.Id,
                EventId = message.EventId,
                EventType = message.EventType,
                PayloadJson = message.PayloadJson,
                Status = "Success",
                AttemptNumber = 1,
                MaxAttempts = 5,
                CreatedAtUtc = DateTime.UtcNow
            };

            await _deliveryRepository.AddAsync(delivery);
            await _dispatcher.DispatchDeliveryAsync(delivery, webhook);
        }

        message.Status = "Published";
        message.ProcessedAtUtc = DateTime.UtcNow;
        await _outboxRepository.UpdateAsync(message);
    }
}
