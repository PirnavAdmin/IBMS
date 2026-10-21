using System.Diagnostics;
using System.Text.Json;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Webhook;
using Billing.Domain.Entities;
using Microsoft.Extensions.Logging;

namespace Billing.Application.Services;

public class WebhookService : IWebhookService
{
    private readonly IWebhookRepository _webhookRepository;
    private readonly IWebhookSecurityService _securityService;
    private readonly IWebhookDispatcher _dispatcher;
    private readonly ILogger<WebhookService> _logger;

    public WebhookService(
        IWebhookRepository webhookRepository,
        IWebhookSecurityService securityService,
        IWebhookDispatcher dispatcher,
        ILogger<WebhookService> logger)
    {
        _webhookRepository = webhookRepository;
        _securityService = securityService;
        _dispatcher = dispatcher;
        _logger = logger;
    }

    public async Task<ApiResponse<PagedResult<WebhookDto>>> GetWebhooksAsync(WebhookQueryParameters query, int tenantId)
    {
        var (items, totalCount) = await _webhookRepository.GetPagedListAsync(query, tenantId);

        var dtos = items.Select(MapToDto).ToList();

        var page = query.PageNumber > 0 ? query.PageNumber : 1;
        var size = query.PageSize > 0 ? query.PageSize : 20;

        return ApiResponse<PagedResult<WebhookDto>>.Ok(
            new PagedResult<WebhookDto>(dtos, totalCount, page, size),
            "Webhooks retrieved successfully.");
    }

    public async Task<ApiResponse<WebhookDto>> GetWebhookByIdAsync(int id, int tenantId)
    {
        var webhook = await _webhookRepository.GetByIdAsync(id, tenantId);
        if (webhook == null)
            return ApiResponse<WebhookDto>.Fail("Webhook not found.");

        return ApiResponse<WebhookDto>.Ok(MapToDto(webhook), "Webhook retrieved successfully.");
    }

    public async Task<ApiResponse<WebhookDto>> CreateWebhookAsync(CreateWebhookRequest request, int tenantId)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return ApiResponse<WebhookDto>.Fail("Webhook name is required.");

        if (string.IsNullOrWhiteSpace(request.TargetUrl) || 
            !Uri.TryCreate(request.TargetUrl, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            return ApiResponse<WebhookDto>.Fail("A valid HTTP or HTTPS destination URL is required.");
        }

        var secretKey = _securityService.GenerateSecretKey();

        var webhook = new Webhook
        {
            TenantId = tenantId,
            ApplicationId = request.ApplicationId,
            Name = request.Name.Trim(),
            TargetUrl = request.TargetUrl.Trim(),
            SecretKey = secretKey,
            SubscribedEventsJson = JsonSerializer.Serialize(request.SubscribedEvents ?? new List<string> { "*" }),
            Status = request.Status?.Trim() ?? "Active",
            CreatedAtUtc = DateTime.UtcNow
        };

        var saved = await _webhookRepository.AddAsync(webhook);
        _logger.LogInformation("Webhook {WebhookId} created for Tenant {TenantId}", saved.Id, tenantId);

        return ApiResponse<WebhookDto>.Ok(MapToDto(saved), "Webhook created successfully.");
    }

    public async Task<ApiResponse<WebhookDto>> UpdateWebhookAsync(int id, UpdateWebhookRequest request, int tenantId)
    {
        var webhook = await _webhookRepository.GetByIdAsync(id, tenantId);
        if (webhook == null)
            return ApiResponse<WebhookDto>.Fail("Webhook not found.");

        if (string.IsNullOrWhiteSpace(request.Name))
            return ApiResponse<WebhookDto>.Fail("Webhook name is required.");

        if (string.IsNullOrWhiteSpace(request.TargetUrl) || 
            !Uri.TryCreate(request.TargetUrl, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            return ApiResponse<WebhookDto>.Fail("A valid HTTP or HTTPS destination URL is required.");
        }

        webhook.Name = request.Name.Trim();
        webhook.TargetUrl = request.TargetUrl.Trim();
        webhook.ApplicationId = request.ApplicationId;
        webhook.SubscribedEventsJson = JsonSerializer.Serialize(request.SubscribedEvents ?? new List<string>());
        webhook.Status = request.Status?.Trim() ?? webhook.Status;

        await _webhookRepository.UpdateAsync(webhook);
        _logger.LogInformation("Webhook {WebhookId} updated for Tenant {TenantId}", webhook.Id, tenantId);

        return ApiResponse<WebhookDto>.Ok(MapToDto(webhook), "Webhook updated successfully.");
    }

    public async Task<ApiResponse<bool>> DeleteWebhookAsync(int id, int tenantId)
    {
        var webhook = await _webhookRepository.GetByIdAsync(id, tenantId);
        if (webhook == null)
            return ApiResponse<bool>.Fail("Webhook not found.");

        await _webhookRepository.DeleteAsync(webhook);
        _logger.LogInformation("Webhook {WebhookId} deleted for Tenant {TenantId}", id, tenantId);

        return ApiResponse<bool>.Ok(true, "Webhook deleted successfully.");
    }

    public async Task<ApiResponse<WebhookDto>> ToggleStatusAsync(int id, int tenantId)
    {
        var webhook = await _webhookRepository.GetByIdAsync(id, tenantId);
        if (webhook == null)
            return ApiResponse<WebhookDto>.Fail("Webhook not found.");

        webhook.Status = webhook.Status == "Active" ? "Disabled" : "Active";
        if (webhook.Status == "Active")
        {
            webhook.ConsecutiveFailureCount = 0;
        }

        await _webhookRepository.UpdateAsync(webhook);
        _logger.LogInformation("Webhook {WebhookId} status toggled to {Status}", id, webhook.Status);

        return ApiResponse<WebhookDto>.Ok(MapToDto(webhook), $"Webhook is now {webhook.Status}.");
    }

    public async Task<ApiResponse<RotateSecretResponse>> RotateSecretAsync(int id, int tenantId)
    {
        var webhook = await _webhookRepository.GetByIdAsync(id, tenantId);
        if (webhook == null)
            return ApiResponse<RotateSecretResponse>.Fail("Webhook not found.");

        var newSecret = _securityService.GenerateSecretKey();
        webhook.SecretKey = newSecret;
        await _webhookRepository.UpdateAsync(webhook);

        _logger.LogInformation("Secret rotated for Webhook {WebhookId} by Tenant {TenantId}", id, tenantId);

        var response = new RotateSecretResponse
        {
            WebhookId = webhook.Id,
            NewSecretKey = newSecret,
            SecretKeyPreview = _securityService.MaskSecret(newSecret),
            RotatedAtUtc = DateTime.UtcNow
        };

        return ApiResponse<RotateSecretResponse>.Ok(response, "Webhook secret rotated successfully.");
    }

    public async Task<ApiResponse<WebhookPingResponse>> PingAsync(int id, int tenantId)
    {
        var webhook = await _webhookRepository.GetByIdAsync(id, tenantId);
        if (webhook == null)
            return ApiResponse<WebhookPingResponse>.Fail("Webhook not found.");

        var testPayload = JsonSerializer.Serialize(new
        {
            @event = "endpoint.ping",
            timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            message = "IBMS Webhook Test Ping",
            webhookId = webhook.Id,
            webhookName = webhook.Name
        });

        var pingDelivery = new WebhookDelivery
        {
            TenantId = tenantId,
            WebhookId = webhook.Id,
            EventId = Guid.NewGuid().ToString("N"),
            EventType = "endpoint.ping",
            PayloadJson = testPayload,
            Status = "Pending",
            AttemptNumber = 1,
            MaxAttempts = 1,
            CreatedAtUtc = DateTime.UtcNow
        };

        var result = await _dispatcher.DispatchDeliveryAsync(pingDelivery, webhook);

        var pingResponse = new WebhookPingResponse
        {
            Success = result.Status == "Success",
            StatusCode = result.ResponseStatusCode ?? 0,
            Message = result.Status == "Success" ? "Ping delivered successfully." : result.FailureReason ?? "Ping failed.",
            LatencyMs = result.ExecutionDurationMs ?? 0,
            ResponseBody = result.ResponseBody
        };

        return ApiResponse<WebhookPingResponse>.Ok(pingResponse, pingResponse.Message);
    }

    public List<WebhookEventDefinitionDto> GetAvailableEvents()
    {
        return new List<WebhookEventDefinitionDto>
        {
            new() { EventType = "*", Category = "General", Description = "Subscribe to all current and future billing events.", SamplePayload = "{}" },
            new() { EventType = "invoice.issued", Category = "Invoices", Description = "Triggered when an invoice is finalized and issued to a customer.", SamplePayload = "{\"invoiceId\":101,\"invoiceNumber\":\"INV-2026-0001\",\"totalAmount\":1250.00,\"currency\":\"INR\"}" },
            new() { EventType = "invoice.sent", Category = "Invoices", Description = "Triggered when an invoice is sent to customer via email or channel.", SamplePayload = "{\"invoiceId\":101,\"recipient\":\"client@example.com\"}" },
            new() { EventType = "invoice.voided", Category = "Invoices", Description = "Triggered when an issued invoice is voided.", SamplePayload = "{\"invoiceId\":101,\"reason\":\"Data entry error\"}" },
            new() { EventType = "invoice.cancelled", Category = "Invoices", Description = "Triggered when an invoice is cancelled.", SamplePayload = "{\"invoiceId\":101}" },
            new() { EventType = "payment.received", Category = "Payments", Description = "Triggered when a customer payment is recorded and allocated.", SamplePayload = "{\"paymentId\":55,\"paymentNumber\":\"PAY-2026-0010\",\"amount\":500.00,\"paymentMethod\":\"UPI\"}" },
            new() { EventType = "payment.failed", Category = "Payments", Description = "Triggered when a payment transaction fails.", SamplePayload = "{\"paymentId\":56,\"errorCode\":\"INSUFFICIENT_FUNDS\"}" },
            new() { EventType = "payment.refunded", Category = "Payments", Description = "Triggered when a refund is processed on a payment.", SamplePayload = "{\"paymentId\":55,\"refundAmount\":100.00}" },
            new() { EventType = "quotation.sent", Category = "Quotations", Description = "Triggered when a quotation is dispatched to a customer.", SamplePayload = "{\"quotationId\":12,\"quoteNumber\":\"QT-2026-0005\"}" },
            new() { EventType = "quotation.approved", Category = "Quotations", Description = "Triggered when a quotation is approved by customer/management.", SamplePayload = "{\"quotationId\":12,\"approvedAtUtc\":\"2026-10-14T10:00:00Z\"}" },
            new() { EventType = "quotation.converted", Category = "Quotations", Description = "Triggered when a quotation is converted into an official invoice.", SamplePayload = "{\"quotationId\":12,\"invoiceId\":102}" },
            new() { EventType = "credit_note.issued", Category = "Credit Notes", Description = "Triggered when a credit note is generated against an invoice.", SamplePayload = "{\"creditNoteId\":7,\"creditNoteNumber\":\"CN-2026-0002\",\"amount\":200.00}" },
            new() { EventType = "credit_note.applied", Category = "Credit Notes", Description = "Triggered when a credit note is applied to reduce an invoice balance.", SamplePayload = "{\"creditNoteId\":7,\"invoiceId\":101,\"amount\":200.00}" },
            new() { EventType = "credit_note.refunded", Category = "Credit Notes", Description = "Triggered when an amount is refunded from a credit note.", SamplePayload = "{\"creditNoteId\":7,\"refundAmount\":200.00}" },
            new() { EventType = "customer.created", Category = "Customers", Description = "Triggered when a new customer profile is registered.", SamplePayload = "{\"customerId\":40,\"customerCode\":\"CUST-040\",\"name\":\"Acme Global\"}" },
            new() { EventType = "customer.updated", Category = "Customers", Description = "Triggered when customer information is modified.", SamplePayload = "{\"customerId\":40,\"name\":\"Acme Global Tech\"}" }
        };
    }

    private WebhookDto MapToDto(Webhook webhook)
    {
        List<string> events = new();
        try
        {
            events = JsonSerializer.Deserialize<List<string>>(webhook.SubscribedEventsJson) ?? new();
        }
        catch
        {
            events = new List<string>();
        }

        return new WebhookDto
        {
            Id = webhook.Id,
            TenantId = webhook.TenantId,
            ApplicationId = webhook.ApplicationId,
            ApplicationName = webhook.Application?.Name,
            Name = webhook.Name,
            TargetUrl = webhook.TargetUrl,
            SecretKeyPreview = _securityService.MaskSecret(webhook.SecretKey),
            SubscribedEvents = events,
            Status = webhook.Status,
            ConsecutiveFailureCount = webhook.ConsecutiveFailureCount,
            LastTriggeredAtUtc = webhook.LastTriggeredAtUtc,
            CreatedAtUtc = webhook.CreatedAtUtc,
            UpdatedAtUtc = webhook.UpdatedAtUtc
        };
    }
}
