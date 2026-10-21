using System.Diagnostics;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Billing.Application.Interfaces;
using Billing.Domain.Entities;
using Microsoft.Extensions.Logging;

namespace Billing.Infrastructure.Services;

public class WebhookDispatcher : IWebhookDispatcher
{
    private readonly HttpClient _httpClient;
    private readonly IWebhookSecurityService _securityService;
    private readonly IWebhookRepository _webhookRepository;
    private readonly IWebhookDeliveryRepository _deliveryRepository;
    private readonly ILogger<WebhookDispatcher> _logger;

    public WebhookDispatcher(
        HttpClient httpClient,
        IWebhookSecurityService securityService,
        IWebhookRepository webhookRepository,
        IWebhookDeliveryRepository deliveryRepository,
        ILogger<WebhookDispatcher> logger)
    {
        _httpClient = httpClient;
        _securityService = securityService;
        _webhookRepository = webhookRepository;
        _deliveryRepository = deliveryRepository;
        _logger = logger;
    }

    public async Task<WebhookDelivery> DispatchDeliveryAsync(WebhookDelivery delivery, Webhook webhook)
    {
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var signature = _securityService.ComputeHmacSha256(webhook.SecretKey, delivery.PayloadJson, timestamp);

        using var request = new HttpRequestMessage(HttpMethod.Post, webhook.TargetUrl);
        request.Content = new StringContent(delivery.PayloadJson, Encoding.UTF8, "application/json");

        request.Headers.Add("User-Agent", "IBMS-Webhook-Delivery/1.0");
        request.Headers.Add("X-IBMS-Signature", $"t={timestamp},v1={signature}");
        request.Headers.Add("X-IBMS-Timestamp", timestamp.ToString());
        request.Headers.Add("X-IBMS-Event", delivery.EventType);
        request.Headers.Add("X-IBMS-Delivery-Id", delivery.EventId);

        var headerSnapshot = new Dictionary<string, string>
        {
            ["User-Agent"] = "IBMS-Webhook-Delivery/1.0",
            ["X-IBMS-Signature"] = $"t={timestamp},v1={signature}",
            ["X-IBMS-Timestamp"] = timestamp.ToString(),
            ["X-IBMS-Event"] = delivery.EventType,
            ["X-IBMS-Delivery-Id"] = delivery.EventId,
            ["Content-Type"] = "application/json"
        };
        delivery.RequestHeadersJson = JsonSerializer.Serialize(headerSnapshot);

        var stopwatch = Stopwatch.StartNew();

        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            var response = await _httpClient.SendAsync(request, cts.Token);
            stopwatch.Stop();

            delivery.ExecutionDurationMs = stopwatch.ElapsedMilliseconds;
            delivery.ResponseStatusCode = (int)response.StatusCode;

            var responseBody = await response.Content.ReadAsStringAsync(cts.Token);
            if (!string.IsNullOrEmpty(responseBody) && responseBody.Length > 2000)
            {
                responseBody = responseBody.Substring(0, 2000) + "... [truncated]";
            }
            delivery.ResponseBody = responseBody;

            if (response.IsSuccessStatusCode)
            {
                delivery.Status = "Success";
                delivery.DeliveredAtUtc = DateTime.UtcNow;
                delivery.FailureReason = null;
                delivery.NextRetryUtc = null;

                webhook.ConsecutiveFailureCount = 0;
                webhook.LastTriggeredAtUtc = DateTime.UtcNow;
                await _webhookRepository.UpdateAsync(webhook);
            }
            else
            {
                await HandleFailureAsync(delivery, webhook, $"HTTP {(int)response.StatusCode} {response.ReasonPhrase}");
            }
        }
        catch (OperationCanceledException)
        {
            stopwatch.Stop();
            delivery.ExecutionDurationMs = stopwatch.ElapsedMilliseconds;
            await HandleFailureAsync(delivery, webhook, "Request timed out after 10 seconds.");
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            delivery.ExecutionDurationMs = stopwatch.ElapsedMilliseconds;
            await HandleFailureAsync(delivery, webhook, ex.Message);
        }

        await _deliveryRepository.UpdateAsync(delivery);
        return delivery;
    }

    private async Task HandleFailureAsync(WebhookDelivery delivery, Webhook webhook, string failureReason)
    {
        delivery.FailureReason = failureReason;

        if (delivery.AttemptNumber >= delivery.MaxAttempts)
        {
            delivery.Status = "DeadLetter";
            delivery.NextRetryUtc = null;
            _logger.LogWarning("Webhook delivery {DeliveryId} to {Url} exceeded max retries and moved to DeadLetter. Reason: {Reason}",
                delivery.Id, webhook.TargetUrl, failureReason);
        }
        else
        {
            delivery.Status = "Retrying";
            var delay = CalculateExponentialBackoff(delivery.AttemptNumber);
            delivery.NextRetryUtc = DateTime.UtcNow.Add(delay);
            delivery.AttemptNumber++;
            _logger.LogInformation("Webhook delivery {DeliveryId} scheduled for retry #{Attempt} at {Time}",
                delivery.Id, delivery.AttemptNumber, delivery.NextRetryUtc);
        }

        webhook.ConsecutiveFailureCount++;
        webhook.LastTriggeredAtUtc = DateTime.UtcNow;

        if (webhook.ConsecutiveFailureCount >= 10 && webhook.Status == "Active")
        {
            webhook.Status = "Suspended";
            _logger.LogWarning("Webhook {WebhookId} ({Name}) suspended due to 10 consecutive delivery failures.",
                webhook.Id, webhook.Name);
        }

        await _webhookRepository.UpdateAsync(webhook);
    }

    private static TimeSpan CalculateExponentialBackoff(int attempt)
    {
        return attempt switch
        {
            1 => TimeSpan.FromMinutes(1),
            2 => TimeSpan.FromMinutes(5),
            3 => TimeSpan.FromMinutes(30),
            4 => TimeSpan.FromHours(2),
            _ => TimeSpan.FromHours(6)
        };
    }
}
