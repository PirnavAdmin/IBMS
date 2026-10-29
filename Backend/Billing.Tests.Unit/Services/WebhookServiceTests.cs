using System.Net;
using System.Text.Json;
using Billing.Application.Interfaces;
using Billing.Application.Services;
using Billing.Contracts.Webhook;
using Billing.Domain.Entities;
using Billing.Infrastructure.Services;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace Billing.Tests.Unit.Services;

public class WebhookServiceTests
{
    private readonly WebhookSecurityService _securityService;
    private readonly Mock<IWebhookRepository> _webhookRepoMock;
    private readonly Mock<IWebhookDeliveryRepository> _deliveryRepoMock;
    private readonly Mock<IIntegrationApplicationRepository> _integrationRepoMock;
    private readonly Mock<IOutboxRepository> _outboxRepoMock;
    private readonly Mock<IWebhookDispatcher> _dispatcherMock;
    private readonly Mock<ILogger<WebhookService>> _loggerMock;
    private readonly Mock<ILogger<OutboxService>> _outboxLoggerMock;
    private readonly Mock<ILogger<IntegrationApplicationService>> _integrationLoggerMock;

    private readonly WebhookService _webhookService;
    private readonly OutboxService _outboxService;
    private readonly WebhookDeliveryService _deliveryService;
    private readonly IntegrationApplicationService _integrationService;

    public WebhookServiceTests()
    {
        _securityService = new WebhookSecurityService();
        _webhookRepoMock = new Mock<IWebhookRepository>();
        _deliveryRepoMock = new Mock<IWebhookDeliveryRepository>();
        _integrationRepoMock = new Mock<IIntegrationApplicationRepository>();
        _outboxRepoMock = new Mock<IOutboxRepository>();
        _dispatcherMock = new Mock<IWebhookDispatcher>();
        _loggerMock = new Mock<ILogger<WebhookService>>();
        _outboxLoggerMock = new Mock<ILogger<OutboxService>>();
        _integrationLoggerMock = new Mock<ILogger<IntegrationApplicationService>>();

        _webhookService = new WebhookService(
            _webhookRepoMock.Object,
            _securityService,
            _dispatcherMock.Object,
            _loggerMock.Object);

        _outboxService = new OutboxService(
            _outboxRepoMock.Object,
            _webhookRepoMock.Object,
            _deliveryRepoMock.Object,
            _dispatcherMock.Object,
            _outboxLoggerMock.Object);

        _deliveryService = new WebhookDeliveryService(
            _deliveryRepoMock.Object,
            _webhookRepoMock.Object,
            _dispatcherMock.Object,
            Mock.Of<ILogger<WebhookDeliveryService>>());

        _integrationService = new IntegrationApplicationService(
            _integrationRepoMock.Object,
            _securityService,
            _integrationLoggerMock.Object);
    }

    // ============================================================
    // 1. Security Service Tests (HMAC SHA-256, Secret generation)
    // ============================================================

    [Fact]
    public void SecurityService_GeneratesValidSecretKey()
    {
        var secret = _securityService.GenerateSecretKey();
        Assert.NotNull(secret);
        Assert.StartsWith("whsec_", secret);
        Assert.True(secret.Length > 20);
    }

    [Fact]
    public void SecurityService_ComputesAndVerifiesHmacSha256()
    {
        var secret = "whsec_test_secret_key_1234567890";
        var payload = "{\"event\":\"invoice.issued\",\"amount\":1500.00}";
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

        var signature = _securityService.ComputeHmacSha256(secret, payload, timestamp);

        Assert.NotNull(signature);
        Assert.NotEmpty(signature);

        var isValid = _securityService.VerifySignature(secret, payload, timestamp, signature);
        Assert.True(isValid);

        // Tampered payload fails verification
        var tamperedPayload = "{\"event\":\"invoice.issued\",\"amount\":9999.00}";
        var isTamperedValid = _securityService.VerifySignature(secret, tamperedPayload, timestamp, signature);
        Assert.False(isTamperedValid);

        // Wrong secret fails verification
        var isWrongSecretValid = _securityService.VerifySignature("whsec_wrong_key_9999999999", payload, timestamp, signature);
        Assert.False(isWrongSecretValid);

        // Invalid signature fails verification
        var isInvalidSigValid = _securityService.VerifySignature(secret, payload, timestamp, "bad_sig");
        Assert.False(isInvalidSigValid);
    }

    [Fact]
    public void SecurityService_MaskSecret_CorrectlyMasksValue()
    {
        var secret = "whsec_abcdef1234567890";
        var masked = _securityService.MaskSecret(secret);

        Assert.Equal("whsec_****7890", masked);
    }

    // ============================================================
    // 2. Webhook Management CRUD Tests
    // ============================================================

    [Fact]
    public async Task CreateWebhook_WithValidData_ReturnsSuccess()
    {
        var tenantId = 1;
        var request = new CreateWebhookRequest
        {
            Name = "ERP Sync Webhook",
            TargetUrl = "https://erp.example.com/api/webhooks/billing",
            SubscribedEvents = new List<string> { "invoice.issued", "payment.received" }
        };

        _webhookRepoMock.Setup(r => r.AddAsync(It.IsAny<Webhook>()))
            .ReturnsAsync((Webhook w) =>
            {
                w.Id = 101;
                return w;
            });

        var response = await _webhookService.CreateWebhookAsync(request, tenantId);

        Assert.True(response.Success);
        Assert.NotNull(response.Data);
        Assert.Equal("ERP Sync Webhook", response.Data.Name);
        Assert.Equal("https://erp.example.com/api/webhooks/billing", response.Data.TargetUrl);
        Assert.Equal(2, response.Data.SubscribedEvents.Count);
        Assert.NotEmpty(response.Data.SecretKeyPreview);
        _webhookRepoMock.Verify(r => r.AddAsync(It.IsAny<Webhook>()), Times.Once);
    }

    [Fact]
    public async Task CreateWebhook_WithInvalidUrl_ReturnsFailure()
    {
        var tenantId = 1;
        var request = new CreateWebhookRequest
        {
            Name = "Bad Webhook",
            TargetUrl = "ftp://invalid-url.com",
            SubscribedEvents = new List<string> { "invoice.issued" }
        };

        var response = await _webhookService.CreateWebhookAsync(request, tenantId);

        Assert.False(response.Success);
        Assert.Contains("HTTP or HTTPS", response.Message);
        _webhookRepoMock.Verify(r => r.AddAsync(It.IsAny<Webhook>()), Times.Never);
    }

    [Fact]
    public async Task RotateSecret_GeneratesNewSecretAndUpdatesEntity()
    {
        var tenantId = 1;
        var webhook = new Webhook
        {
            Id = 5,
            TenantId = tenantId,
            Name = "Accounting System",
            TargetUrl = "https://accounting.example.com/webhook",
            SecretKey = "whsec_old_secret_key_111",
            Status = "Active"
        };

        _webhookRepoMock.Setup(r => r.GetByIdAsync(5, tenantId)).ReturnsAsync(webhook);
        _webhookRepoMock.Setup(r => r.UpdateAsync(It.IsAny<Webhook>())).Returns(Task.CompletedTask);

        var response = await _webhookService.RotateSecretAsync(5, tenantId);

        Assert.True(response.Success);
        Assert.NotNull(response.Data);
        Assert.NotEqual("whsec_old_secret_key_111", response.Data.NewSecretKey);
        Assert.StartsWith("whsec_", response.Data.NewSecretKey);
        Assert.Equal(5, response.Data.WebhookId);
        _webhookRepoMock.Verify(r => r.UpdateAsync(It.Is<Webhook>(w => w.SecretKey == response.Data.NewSecretKey)), Times.Once);
    }

    [Fact]
    public async Task ToggleStatus_SwitchesBetweenActiveAndDisabled()
    {
        var tenantId = 1;
        var webhook = new Webhook
        {
            Id = 7,
            TenantId = tenantId,
            Status = "Active"
        };

        _webhookRepoMock.Setup(r => r.GetByIdAsync(7, tenantId)).ReturnsAsync(webhook);
        _webhookRepoMock.Setup(r => r.UpdateAsync(It.IsAny<Webhook>())).Returns(Task.CompletedTask);

        var response = await _webhookService.ToggleStatusAsync(7, tenantId);

        Assert.True(response.Success);
        Assert.Equal("Disabled", response.Data!.Status);

        // Toggle again
        var response2 = await _webhookService.ToggleStatusAsync(7, tenantId);
        Assert.True(response2.Success);
        Assert.Equal("Active", response2.Data!.Status);
    }

    [Fact]
    public void GetAvailableEvents_ReturnsBillingEventDefinitions()
    {
        var events = _webhookService.GetAvailableEvents();

        Assert.NotEmpty(events);
        Assert.Contains(events, e => e.EventType == "invoice.issued");
        Assert.Contains(events, e => e.EventType == "payment.received");
        Assert.Contains(events, e => e.EventType == "quotation.approved");
        Assert.Contains(events, e => e.EventType == "credit_note.applied");
    }

    // ============================================================
    // 3. Integration Applications & Feature Flags Tests
    // ============================================================

    [Fact]
    public async Task RegisterApplication_CreatesAppAndGeneratesClientSecret()
    {
        var tenantId = 1;
        var request = new RegisterIntegrationApplicationRequest
        {
            Name = "Zapier Integration",
            Description = "Zapier billing triggers and actions",
            FeatureFlags = new Dictionary<string, bool>
            {
                ["AllowAutoReplay"] = true,
                ["IncludeSensitiveData"] = false
            }
        };

        _integrationRepoMock.Setup(r => r.AddAsync(It.IsAny<IntegrationApplication>()))
            .ReturnsAsync((IntegrationApplication a) =>
            {
                a.Id = 22;
                return a;
            });

        var response = await _integrationService.RegisterApplicationAsync(request, tenantId);

        Assert.True(response.Success);
        Assert.NotNull(response.Data);
        Assert.StartsWith("app_", response.Data.ClientId);
        Assert.StartsWith("whapp_sec_", response.Data.ClientSecret);
        Assert.True(response.Data.FeatureFlags["AllowAutoReplay"]);
        Assert.False(response.Data.FeatureFlags["IncludeSensitiveData"]);
    }

    [Fact]
    public async Task UpdateFeatureFlags_UpdatesSpecificAppFlags()
    {
        var tenantId = 1;
        var app = new IntegrationApplication
        {
            Id = 3,
            TenantId = tenantId,
            Name = "Salesforce Connector",
            ClientId = "app_12345",
            FeatureFlagsJson = "{\"SyncInvoices\":true,\"SyncPayments\":false}"
        };

        _integrationRepoMock.Setup(r => r.GetByIdAsync(3, tenantId)).ReturnsAsync(app);
        _integrationRepoMock.Setup(r => r.UpdateAsync(It.IsAny<IntegrationApplication>())).Returns(Task.CompletedTask);

        var request = new UpdateFeatureFlagsRequest
        {
            FeatureFlags = new Dictionary<string, bool>
            {
                ["SyncInvoices"] = true,
                ["SyncPayments"] = true,
                ["BetaV2Api"] = true
            }
        };

        var response = await _integrationService.UpdateFeatureFlagsAsync(3, request, tenantId);

        Assert.True(response.Success);
        Assert.NotNull(response.Data);
        Assert.True(response.Data.FeatureFlags["SyncPayments"]);
        Assert.True(response.Data.FeatureFlags["BetaV2Api"]);
    }

    // ============================================================
    // 4. Outbox Event Publishing Tests
    // ============================================================

    [Fact]
    public async Task OutboxService_PublishEventAsync_PersistsPendingOutboxMessage()
    {
        var tenantId = 1;
        var payload = new { InvoiceId = 42, InvoiceNumber = "INV-00042", Amount = 990.00m };

        _outboxRepoMock.Setup(r => r.AddAsync(It.IsAny<OutboxMessage>()))
            .ReturnsAsync((OutboxMessage m) =>
            {
                m.Id = 1001;
                return m;
            });

        var result = await _outboxService.PublishEventAsync(tenantId, "invoice.issued", payload);

        Assert.NotNull(result);
        Assert.Equal("invoice.issued", result.EventType);
        Assert.Equal("Pending", result.Status);
        Assert.NotEmpty(result.EventId);
        Assert.Contains("INV-00042", result.PayloadJson);
        _outboxRepoMock.Verify(r => r.AddAsync(It.IsAny<OutboxMessage>()), Times.Once);
    }

    // ============================================================
    // 5. Webhook Replay Delivery Tests
    // ============================================================

    [Fact]
    public async Task ReplayDelivery_ResetsDeliveryToRetrying_AndDispatchesImmediately()
    {
        var tenantId = 1;
        var webhook = new Webhook
        {
            Id = 10,
            TenantId = tenantId,
            Name = "Notification Webhook",
            TargetUrl = "https://example.com/webhook",
            SecretKey = "whsec_test_secret",
            Status = "Active"
        };

        var delivery = new WebhookDelivery
        {
            Id = 55,
            TenantId = tenantId,
            WebhookId = 10,
            Webhook = webhook,
            EventId = "evt_12345",
            EventType = "payment.received",
            PayloadJson = "{\"paymentId\":88}",
            Status = "Failed",
            AttemptNumber = 3,
            MaxAttempts = 5
        };

        _deliveryRepoMock.Setup(r => r.GetByIdAsync(55, tenantId)).ReturnsAsync(delivery);
        _webhookRepoMock.Setup(r => r.GetByIdAsync(10, tenantId)).ReturnsAsync(webhook);
        _deliveryRepoMock.Setup(r => r.UpdateAsync(It.IsAny<WebhookDelivery>())).Returns(Task.CompletedTask);
        _dispatcherMock.Setup(d => d.DispatchDeliveryAsync(delivery, webhook))
            .ReturnsAsync(delivery);

        var response = await _deliveryService.ReplayDeliveryAsync(55, tenantId);

        Assert.True(response.Success);
        Assert.Equal(55, response.Data!.DeliveryId);
        _dispatcherMock.Verify(d => d.DispatchDeliveryAsync(delivery, webhook), Times.Once);
    }

    [Fact]
    public async Task CreateWebhook_WithCustomHeadersAndPayloadFormat_SavesAndMapsCorrectly()
    {
        var tenantId = 1;
        var request = new CreateWebhookRequest
        {
            Name = "Slack Channel Webhook",
            TargetUrl = "https://hooks.slack.com/services/T00/B00/X00",
            SubscribedEvents = new List<string> { "invoice.issued" },
            PayloadFormat = "Slack",
            CustomHeaders = new Dictionary<string, string>
            {
                ["Authorization"] = "Bearer test-slack-token",
                ["x-api-key"] = "test-key-123"
            }
        };

        _webhookRepoMock.Setup(r => r.AddAsync(It.IsAny<Webhook>()))
            .ReturnsAsync((Webhook w) =>
            {
                w.Id = 101;
                return w;
            });

        var result = await _webhookService.CreateWebhookAsync(request, tenantId);

        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.Equal("Slack Channel Webhook", result.Data.Name);
        Assert.Equal("Slack", result.Data.PayloadFormat);
        Assert.Equal(2, result.Data.CustomHeaders.Count);
        Assert.Equal("Bearer test-slack-token", result.Data.CustomHeaders["Authorization"]);
        Assert.Equal("test-key-123", result.Data.CustomHeaders["x-api-key"]);
    }

    [Fact]
    public async Task UpdateWebhook_WithCustomTemplate_UpdatesAndReturnsCorrectly()
    {
        var tenantId = 1;
        var existingWebhook = new Webhook
        {
            Id = 5,
            TenantId = tenantId,
            Name = "Custom CRM Hook",
            TargetUrl = "https://api.crm.com/leads",
            SubscribedEventsJson = "[\"customer.created\"]",
            CustomHeadersJson = "{\"x-custom-auth\":\"token123\"}",
            PayloadFormat = "Standard",
            Status = "Active"
        };

        _webhookRepoMock.Setup(r => r.GetByIdAsync(5, tenantId)).ReturnsAsync(existingWebhook);
        _webhookRepoMock.Setup(r => r.UpdateAsync(It.IsAny<Webhook>())).Returns(Task.CompletedTask);

        var updateReq = new UpdateWebhookRequest
        {
            Name = "Custom CRM Hook Updated",
            TargetUrl = "https://api.crm.com/v2/leads",
            SubscribedEvents = new List<string> { "customer.created", "customer.updated" },
            PayloadFormat = "Custom",
            CustomTemplate = "{\"client_name\":\"{{customer}}\",\"event\":\"{{event}}\"}",
            CustomHeaders = new Dictionary<string, string> { ["Authorization"] = "Bearer new-token" }
        };

        var result = await _webhookService.UpdateWebhookAsync(5, updateReq, tenantId);

        Assert.True(result.Success);
        Assert.Equal("Custom", result.Data!.PayloadFormat);
        Assert.Equal("{\"client_name\":\"{{customer}}\",\"event\":\"{{event}}\"}", result.Data.CustomTemplate);
        Assert.Equal("Bearer new-token", result.Data.CustomHeaders["Authorization"]);
    }
}
