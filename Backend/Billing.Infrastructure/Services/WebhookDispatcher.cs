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
    private readonly ICustomerRepository? _customerRepository;
    private readonly ILogger<WebhookDispatcher> _logger;

    public WebhookDispatcher(
        HttpClient httpClient,
        IWebhookSecurityService securityService,
        IWebhookRepository webhookRepository,
        IWebhookDeliveryRepository deliveryRepository,
        ILogger<WebhookDispatcher> logger,
        ICustomerRepository? customerRepository = null)
    {
        _httpClient = httpClient;
        _securityService = securityService;
        _webhookRepository = webhookRepository;
        _deliveryRepository = deliveryRepository;
        _logger = logger;
        _customerRepository = customerRepository;
    }

    public async Task<WebhookDelivery> DispatchDeliveryAsync(WebhookDelivery delivery, Webhook webhook)
    {
        var payloadToSend = await NormalizePayloadAsync(delivery.PayloadJson, delivery.EventType, delivery.TenantId);
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var signature = _securityService.ComputeHmacSha256(webhook.SecretKey, payloadToSend, timestamp);

        using var request = new HttpRequestMessage(HttpMethod.Post, webhook.TargetUrl);
        request.Content = new StringContent(payloadToSend, Encoding.UTF8, "application/json");

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
            delivery.ResponseBody = responseBody.Length > 2000
                ? responseBody[..2000] + "... [truncated]"
                : responseBody;

            if (response.IsSuccessStatusCode)
            {
                delivery.Status = "Success";
                delivery.DeliveredAtUtc = DateTime.UtcNow;
                delivery.FailureReason = null;
                delivery.NextRetryUtc = null;

                webhook.ConsecutiveFailureCount = 0;
                webhook.LastTriggeredAtUtc = DateTime.UtcNow;
                await _webhookRepository.UpdateAsync(webhook);

                _logger.LogInformation("Webhook delivery {DeliveryId} succeeded with HTTP {StatusCode} in {Duration}ms",
                    delivery.Id, delivery.ResponseStatusCode, delivery.ExecutionDurationMs);
            }
            else
            {
                var failureReason = $"HTTP {(int)response.StatusCode} {response.ReasonPhrase}";
                await HandleFailureAsync(delivery, webhook, failureReason);
            }
        }
        catch (TaskCanceledException)
        {
            stopwatch.Stop();
            delivery.ExecutionDurationMs = stopwatch.ElapsedMilliseconds;
            await HandleFailureAsync(delivery, webhook, "Request timed out after 10 seconds.");
        }
        catch (HttpRequestException ex)
        {
            stopwatch.Stop();
            delivery.ExecutionDurationMs = stopwatch.ElapsedMilliseconds;
            await HandleFailureAsync(delivery, webhook, $"HTTP request failed: {ex.Message}");
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            delivery.ExecutionDurationMs = stopwatch.ElapsedMilliseconds;
            await HandleFailureAsync(delivery, webhook, $"Unexpected delivery failure: {ex.Message}");
        }

        await _deliveryRepository.UpdateAsync(delivery);
        return delivery;
    }

    private async Task<string> NormalizePayloadAsync(string rawPayloadJson, string eventType, int tenantId)
    {
        try
        {
            using var doc = JsonDocument.Parse(rawPayloadJson);
            var src = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);

            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                src[prop.Name] = prop.Value.ValueKind switch
                {
                    JsonValueKind.String => prop.Value.GetString(),
                    JsonValueKind.Number => prop.Value.TryGetInt64(out var l) ? l : prop.Value.GetDecimal(),
                    JsonValueKind.True => true,
                    JsonValueKind.False => false,
                    JsonValueKind.Null => null,
                    _ => prop.Value.Clone()
                };
            }

            // Target dictionary with Ordinal (case-sensitive) comparer so both lowercase and uppercase keys coexist
            var dict = new Dictionary<string, object?>(StringComparer.Ordinal);
            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                dict[prop.Name] = src[prop.Name];
            }

            // Event variants
            dict["event"] = eventType;
            dict["Event"] = eventType;
            dict["eventType"] = eventType;
            dict["EventType"] = eventType;
            dict["event_type"] = eventType;

            var num = src.GetValueOrDefault("InvoiceNumber")
                   ?? src.GetValueOrDefault("PaymentNumber")
                   ?? src.GetValueOrDefault("QuoteNumber")
                   ?? src.GetValueOrDefault("CreditNoteNumber")
                   ?? src.GetValueOrDefault("CustomerCode")
                   ?? src.GetValueOrDefault("InvoiceId")
                   ?? src.GetValueOrDefault("PaymentId")
                   ?? (src.TryGetValue("CustomerId", out var cidVal) ? $"CUST-{cidVal}" : null);

            var customerCode = src.GetValueOrDefault("CustomerCode")
                            ?? (src.TryGetValue("CustomerId", out var cid3) ? $"CUST-{cid3}" : null);

            var customerId = src.GetValueOrDefault("CustomerId");

            if (num != null)
            {
                dict["number"] = num;
                dict["Number"] = num;
                dict["Invoice Number"] = num;
                dict["InvoiceNumber"] = num;
                dict["invoice_number"] = num;
                dict["id"] = num;
                dict["Id"] = num;
            }

            if (customerCode != null)
            {
                dict["CustomerCode"] = customerCode;
                dict["Customer Code"] = customerCode;
                dict["customer_code"] = customerCode;
            }

            if (customerId != null)
            {
                dict["CustomerId"] = customerId;
                dict["Customer Id"] = customerId;
                dict["customer_id"] = customerId;
            }

            var amt = src.GetValueOrDefault("TotalAmount")
                   ?? src.GetValueOrDefault("Amount")
                   ?? src.GetValueOrDefault("AppliedAmount")
                   ?? src.GetValueOrDefault("RefundAmount");

            if (amt != null)
            {
                dict["amount"] = amt;
                dict["Amount"] = amt;
                dict["TotalAmount"] = amt;
                dict["total_amount"] = amt;
            }
            else
            {
                dict["amount"] = "-";
                dict["Amount"] = "-";
                dict["TotalAmount"] = "-";
                dict["total_amount"] = "-";
            }

            // Resolve Customer Name
            string? resolvedCustomer = null;
            if (src.TryGetValue("CustomerName", out var cn) && cn != null && !string.IsNullOrWhiteSpace(cn.ToString()))
            {
                resolvedCustomer = cn.ToString();
            }
            else if (src.TryGetValue("Name", out var n) && n != null && !string.IsNullOrWhiteSpace(n.ToString()))
            {
                resolvedCustomer = n.ToString();
            }
            else if (src.TryGetValue("Customer", out var c) && c != null && !string.IsNullOrWhiteSpace(c.ToString()))
            {
                resolvedCustomer = c.ToString();
            }

            if (string.IsNullOrWhiteSpace(resolvedCustomer) && _customerRepository != null && src.TryGetValue("CustomerId", out var cidObj))
            {
                if (int.TryParse(cidObj?.ToString(), out var cid) && cid > 0)
                {
                    try
                    {
                        var cust = await _customerRepository.GetByIdAsync(cid, tenantId);
                        if (cust != null && !string.IsNullOrWhiteSpace(cust.Name))
                        {
                            resolvedCustomer = cust.Name;
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Could not resolve customer name for CustomerId {CustomerId}", cid);
                    }
                }
            }

            if (string.IsNullOrWhiteSpace(resolvedCustomer))
            {
                resolvedCustomer = src.GetValueOrDefault("Recipient")?.ToString()
                                ?? (src.TryGetValue("CustomerId", out var cid2) ? $"Customer #{cid2}" : null);
            }

            if (resolvedCustomer != null)
            {
                dict["customer"] = resolvedCustomer;
                dict["Customer"] = resolvedCustomer;
                dict["CustomerName"] = resolvedCustomer;
                dict["Customer Name"] = resolvedCustomer;
                dict["customer_name"] = resolvedCustomer;
                dict["Name"] = resolvedCustomer;
                dict["name"] = resolvedCustomer;
            }

            // Format date cleanly in readable format: yyyy-MM-dd HH:mm
            var rawDate = src.GetValueOrDefault("IssuedAtUtc")
                       ?? src.GetValueOrDefault("CreatedAtUtc")
                       ?? src.GetValueOrDefault("UpdatedAtUtc")
                       ?? src.GetValueOrDefault("SentAtUtc")
                       ?? src.GetValueOrDefault("PaymentDate")
                       ?? src.GetValueOrDefault("QuoteDate")
                       ?? src.GetValueOrDefault("date");

            if (rawDate != null && DateTime.TryParse(rawDate.ToString(), out var parsedDate))
            {
                var localTime = parsedDate.Kind == DateTimeKind.Utc ? parsedDate.AddHours(5.5) : parsedDate;
                dict["date"] = localTime.ToString("yyyy-MM-dd HH:mm");
                dict["Date"] = dict["date"];
            }
            else
            {
                var now = DateTime.UtcNow.AddHours(5.5).ToString("yyyy-MM-dd HH:mm");
                dict["date"] = now;
                dict["Date"] = now;
            }

            return JsonSerializer.Serialize(dict);
        }
        catch
        {
            return rawPayloadJson;
        }
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
