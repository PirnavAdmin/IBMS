using System.Text.Json;
using System.Text.Json.Nodes;
using Billing.Application.Common;
using Billing.Application.Interfaces;
using Billing.Domain.Entities;
using Microsoft.Extensions.Logging;

namespace Billing.Application.Services;

public class OutboxService : IOutboxService
{
    private static readonly TimeSpan ClaimLeaseDuration = TimeSpan.FromMinutes(2);

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
        var rawJson = payload is string str ? str : JsonSerializer.Serialize(payload);
        var payloadJson = InjectEventIdIntoPayload(rawJson, resolvedEventId);

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
        var instanceId = CreateInstanceClaimId();
        var pending = await _outboxRepository.ClaimPendingMessagesAsync(instanceId, ClaimLeaseDuration, 50, cancellationToken);
        var processedCount = 0;

        foreach (var message in pending)
        {
            if (cancellationToken.IsCancellationRequested) break;

            try
            {
                await DispatchSingleMessageAsync(message, instanceId, cancellationToken);
                processedCount++;
            }
            catch (Exception ex)
            {
                message.RetryCount++;
                message.Error = ex.Message.Length > 950 ? ex.Message[..950] : ex.Message;
                message.Status = message.RetryCount >= 5 ? "Failed" : "Pending";
                message.LockedByInstance = null;
                message.LockedUntilUtc = null;
                await _outboxRepository.UpdateAsync(message);
                _logger.LogError(ex, "Failed to process Outbox message {MessageId}", message.Id);
            }
        }

        return processedCount;
    }

    public async Task<int> ProcessPendingRetriesAsync(CancellationToken cancellationToken = default)
    {
        var instanceId = CreateInstanceClaimId();
        var retries = await _deliveryRepository.ClaimPendingRetriesAsync(instanceId, ClaimLeaseDuration, 50, cancellationToken);
        var retriedCount = 0;

        foreach (var delivery in retries)
        {
            if (cancellationToken.IsCancellationRequested) break;

            try
            {
                var webhook = delivery.Webhook ?? await _webhookRepository.GetByIdAsync(delivery.WebhookId, delivery.TenantId);
                string? blockReason = null;
                if (webhook != null && webhook.Status == "Active" &&
                    IntegrationApplicationPolicy.IsWebhookExecutionAllowed(webhook.Application, out blockReason))
                {
                    await _dispatcher.DispatchDeliveryAsync(delivery, webhook);
                    retriedCount++;
                }
                else
                {
                    delivery.Status = "DeadLetter";
                    delivery.FailureReason = webhook == null || webhook.Status != "Active"
                        ? "Associated webhook is inactive or was deleted."
                        : (blockReason ?? "Associated integration application is inactive or disabled.");
                    delivery.NextRetryUtc = null;
                    delivery.LockedByInstance = null;
                    delivery.LockedUntilUtc = null;
                    await _deliveryRepository.UpdateAsync(delivery);
                }
            }
            catch (Exception ex)
            {
                delivery.LockedByInstance = null;
                delivery.LockedUntilUtc = null;
                await _deliveryRepository.UpdateAsync(delivery);
                _logger.LogError(ex, "Error executing retry for WebhookDelivery {DeliveryId}", delivery.Id);
            }
        }

        return retriedCount;
    }

    private async Task DispatchSingleMessageAsync(OutboxMessage message, string instanceId, CancellationToken cancellationToken)
    {
        var webhooks = await _webhookRepository.GetActiveByEventAsync(message.TenantId, message.EventType);
        var nowUtc = DateTime.UtcNow;

        var eligibleWebhooks = new Dictionary<int, Webhook>();
        var plannedDeliveries = new List<WebhookDelivery>();

        foreach (var webhook in webhooks)
        {
            if (!IntegrationApplicationPolicy.IsWebhookExecutionAllowed(webhook.Application, out var blockReason))
            {
                _logger.LogInformation("Skipping Webhook {WebhookId} for Event {EventId}: {Reason}", webhook.Id, message.EventId, blockReason);
                continue;
            }

            eligibleWebhooks[webhook.Id] = webhook;
            plannedDeliveries.Add(new WebhookDelivery
            {
                TenantId = message.TenantId,
                WebhookId = webhook.Id,
                EventId = message.EventId,
                EventType = message.EventType,
                PayloadJson = message.PayloadJson,
                Status = "Pending",
                AttemptNumber = 1,
                MaxAttempts = 5,
                LockedByInstance = instanceId,
                LockedUntilUtc = nowUtc.Add(ClaimLeaseDuration),
                CreatedAtUtc = nowUtc
            });
        }

        // Phase 1 DB Transaction: Atomically persist child delivery records and mark OutboxMessage Published.
        // External HTTP dispatch is strictly executed outside the DB transaction.
        var persistedDeliveries = await _outboxRepository.FanOutAndMarkPublishedAsync(
            message,
            plannedDeliveries,
            nowUtc,
            cancellationToken);

        foreach (var delivery in persistedDeliveries)
        {
            if (!eligibleWebhooks.TryGetValue(delivery.WebhookId, out var webhook)) continue;

            try
            {
                await _dispatcher.DispatchDeliveryAsync(delivery, webhook);
            }
            catch (Exception ex)
            {
                delivery.LockedByInstance = null;
                delivery.LockedUntilUtc = null;
                _logger.LogError(ex, "HTTP dispatch error after atomic fan-out for WebhookDelivery {DeliveryId}", delivery.Id);
            }
        }
    }

    private static string CreateInstanceClaimId()
    {
        return $"{Environment.MachineName}:{Guid.NewGuid():N}";
    }

    private static string InjectEventIdIntoPayload(string rawJson, string eventId)
    {
        if (string.IsNullOrWhiteSpace(rawJson))
        {
            return JsonSerializer.Serialize(new { EventId = eventId });
        }

        try
        {
            var node = JsonNode.Parse(rawJson);
            if (node is JsonObject obj)
            {
                if (!obj.ContainsKey("EventId") && !obj.ContainsKey("eventId") && !obj.ContainsKey("event_id"))
                {
                    obj["EventId"] = eventId;
                }
                return obj.ToJsonString();
            }
        }
        catch
        {
        }

        return rawJson;
    }
}
