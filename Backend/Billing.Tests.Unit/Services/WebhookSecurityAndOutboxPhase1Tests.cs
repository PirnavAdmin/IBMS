using System.Net;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Billing.API.Common;
using Billing.Application.Common;
using Billing.Application.Interfaces;
using Billing.Application.Services;
using Billing.Contracts.Webhook;
using Billing.Domain.Entities;
using Billing.Infrastructure.Security;
using Billing.Infrastructure.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace Billing.Tests.Unit.Services;

public class WebhookSecurityAndOutboxPhase1Tests
{
    private static IConfiguration BuildEncryptionConfig(string activeKeyId, Dictionary<string, string> keys, string? legacySecret = null)
    {
        var values = new Dictionary<string, string?>
        {
            ["Security:SecretEncryption:ActiveKeyId"] = activeKeyId
        };

        foreach (var kv in keys)
        {
            values[$"Security:SecretEncryption:Keys:{kv.Key}"] = kv.Value;
        }

        if (!string.IsNullOrWhiteSpace(legacySecret))
        {
            values["JwtSettings:SecretKey"] = legacySecret;
        }

        return new ConfigurationBuilder().AddInMemoryCollection(values).Build();
    }

    private sealed class TestHostEnvironment(string environmentName) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = environmentName;
        public string ApplicationName { get; set; } = "IBMS.Test";
        public string ContentRootPath { get; set; } = ".";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private sealed class StubHttpMessageHandler(Func<HttpRequestMessage, CancellationToken, HttpResponseMessage> handler) : HttpMessageHandler
    {
        public int CallCount { get; private set; }
        public HttpRequestMessage? LastRequest { get; private set; }
        public string? LastBody { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            CallCount++;
            LastRequest = request;
            if (request.Content != null)
            {
                LastBody = await request.Content.ReadAsStringAsync(cancellationToken);
            }
            return handler(request, cancellationToken);
        }
    }

    // =========================================================================
    // 1. AesSecretEncryptionService & Production Guardrails
    // =========================================================================

    [Fact]
    public void Encryption_ProtectsV2_SupportsKeyRotation_AndDecryptsLegacyV1AndPlaintext()
    {
        var configK1 = BuildEncryptionConfig("k1", new Dictionary<string, string>
        {
            ["k1"] = "first-32-char-shared-secret-key-01"
        }, legacySecret: "legacy-jwt-secret-key-for-v1");

        var svcK1 = new AesSecretEncryptionService(configK1);
        var cipherK1 = svcK1.Protect("whsec_super_secret_token");

        Assert.NotNull(cipherK1);
        Assert.StartsWith("enc:v2:k1:", cipherK1);
        Assert.True(svcK1.IsEncrypted(cipherK1));
        Assert.False(svcK1.NeedsReencryption(cipherK1));
        Assert.Equal("whsec_super_secret_token", svcK1.Unprotect(cipherK1));

        // Rotate active key to k2 while retaining k1
        var configK2 = BuildEncryptionConfig("k2", new Dictionary<string, string>
        {
            ["k1"] = "first-32-char-shared-secret-key-01",
            ["k2"] = "second-32-char-shared-secret-key-02"
        }, legacySecret: "legacy-jwt-secret-key-for-v1");

        var svcK2 = new AesSecretEncryptionService(configK2);
        Assert.True(svcK2.NeedsReencryption(cipherK1));
        Assert.Equal("whsec_super_secret_token", svcK2.Unprotect(cipherK1));

        var reprotected = svcK2.Protect(cipherK1);
        Assert.StartsWith("enc:v2:k2:", reprotected);
        Assert.False(svcK2.NeedsReencryption(reprotected));
        Assert.Equal("whsec_super_secret_token", svcK2.Unprotect(reprotected));

        // Legacy v1 ciphertext compatibility
        var v1Key = SHA256.HashData(Encoding.UTF8.GetBytes("IBMS.PaymentGatewaySecret.v1:legacy-jwt-secret-key-for-v1"));
        var nonce = new byte[12];
        var plain = Encoding.UTF8.GetBytes("legacy-gateway-secret");
        var cipher = new byte[plain.Length];
        var tag = new byte[16];
        using (var aes = new AesGcm(v1Key, 16))
        {
            aes.Encrypt(nonce, plain, cipher, tag);
        }
        var combined = nonce.Concat(tag).Concat(cipher).ToArray();
        var v1Stored = $"enc:v1:{Convert.ToBase64String(combined)}";

        Assert.True(svcK2.IsEncrypted(v1Stored));
        Assert.True(svcK2.NeedsReencryption(v1Stored));
        Assert.Equal("legacy-gateway-secret", svcK2.Unprotect(v1Stored));

        // Legacy plaintext fallback
        Assert.False(svcK2.IsEncrypted("plain-legacy-secret"));
        Assert.Equal("plain-legacy-secret", svcK2.Unprotect("plain-legacy-secret"));
    }

    [Fact]
    public void ValidateHostConfiguration_ThrowsInProductionWhenMissingOrShort_PassesWhenConfigured()
    {
        var emptyConfig = new ConfigurationBuilder().Build();
        var prodEnv = new TestHostEnvironment(Environments.Production);
        var devEnv = new TestHostEnvironment(Environments.Development);

        Assert.Throws<InvalidOperationException>(() =>
            AesSecretEncryptionService.ValidateHostConfiguration(emptyConfig, prodEnv));

        var shortConfig = BuildEncryptionConfig("k1", new Dictionary<string, string> { ["k1"] = "too-short" });
        Assert.Throws<InvalidOperationException>(() =>
            AesSecretEncryptionService.ValidateHostConfiguration(shortConfig, prodEnv));

        // Development allows fallback without throwing
        AesSecretEncryptionService.ValidateHostConfiguration(emptyConfig, devEnv);

        var validConfig = BuildEncryptionConfig("k1", new Dictionary<string, string>
        {
            ["k1"] = "valid-production-shared-encryption-key"
        });
        AesSecretEncryptionService.ValidateHostConfiguration(validConfig, prodEnv);
    }

    // =========================================================================
    // 2. WebhookSecurityService SSRF & Header Redaction
    // =========================================================================

    [Theory]
    [InlineData("http://localhost:5000/hook", false, false)]
    [InlineData("https://127.0.0.1/hook", false, false)]
    [InlineData("http://169.254.169.254/latest/meta-data/", false, false)]
    [InlineData("https://10.0.0.12/internal", false, false)]
    [InlineData("https://192.168.1.50/internal", false, false)]
    [InlineData("https://billing.internal/webhook", false, false)]
    [InlineData("ftp://hooks.example.com/hook", false, false)]
    [InlineData("http://localhost:5000/hook", true, true)]
    [InlineData("https://hooks.example.com/webhook-endpoint", false, true)]
    public void IsValidDestinationUrl_EnforcesSsrfAndSchemePolicy(string url, bool allowLocalhost, bool expectedValid)
    {
        var security = new WebhookSecurityService();
        var isValid = security.IsValidDestinationUrl(url, allowLocalhost, out var error);

        Assert.Equal(expectedValid, isValid);
        if (!expectedValid)
        {
            Assert.False(string.IsNullOrWhiteSpace(error));
        }
    }

    [Fact]
    public void RedactHeadersJson_MasksSensitiveHeadersOnly()
    {
        var security = new WebhookSecurityService();
        var rawJson = JsonSerializer.Serialize(new Dictionary<string, string>
        {
            ["Authorization"] = "Bearer super-secret-oauth-token",
            ["X-Api-Key"] = "abcd-1234-efgh-5678",
            ["X-Custom-Source"] = "IBMS-Prod"
        });

        var redactedJson = security.RedactHeadersJson(rawJson);
        Assert.NotNull(redactedJson);

        var parsed = JsonSerializer.Deserialize<Dictionary<string, string>>(redactedJson!);
        Assert.NotNull(parsed);
        Assert.Equal("Bear****oken", parsed!["Authorization"]);
        Assert.Equal("abcd****5678", parsed["X-Api-Key"]);
        Assert.Equal("IBMS-Prod", parsed["X-Custom-Source"]);
    }

    // =========================================================================
    // 3. WebhookService Encryption, Masked Header Preservation & App Policy
    // =========================================================================

    [Fact]
    public async Task CreateAndUpdateWebhook_EncryptsSecretsAtRest_PreservesMaskedHeaders_AndRejectsSsrfOrDisabledApp()
    {
        var enc = new AesSecretEncryptionService(BuildEncryptionConfig("k1", new Dictionary<string, string>
        {
            ["k1"] = "test-shared-webhook-encryption-key-01"
        }));

        var webhookRepo = new Mock<IWebhookRepository>();
        var appRepo = new Mock<IIntegrationApplicationRepository>();
        Webhook? storedWebhook = null;

        webhookRepo.Setup(r => r.AddAsync(It.IsAny<Webhook>()))
            .ReturnsAsync((Webhook w) =>
            {
                w.Id = 42;
                storedWebhook = w;
                return w;
            });

        appRepo.Setup(r => r.GetByIdAsync(10, 1))
            .ReturnsAsync(new IntegrationApplication
            {
                Id = 10,
                TenantId = 1,
                Name = "ERP App",
                Status = "Disabled",
                FeatureFlagsJson = "{\"allowWebhooks\":true}"
            });

        appRepo.Setup(r => r.GetByIdAsync(11, 1))
            .ReturnsAsync(new IntegrationApplication
            {
                Id = 11,
                TenantId = 1,
                Name = "Active ERP App",
                Status = "Active",
                FeatureFlagsJson = "{\"allowWebhooks\":true}"
            });

        var service = new WebhookService(
            webhookRepo.Object,
            new WebhookSecurityService(),
            Mock.Of<IWebhookDispatcher>(),
            Mock.Of<ILogger<WebhookService>>(),
            enc,
            appRepo.Object,
            new WebhookSecurityOptions { AllowLocalhostTargets = false });

        // Reject SSRF target
        var ssrfResult = await service.CreateWebhookAsync(new CreateWebhookRequest
        {
            Name = "Metadata Stealer",
            TargetUrl = "http://169.254.169.254/latest/meta-data",
            SubscribedEvents = ["invoice.paid"]
        }, 1);
        Assert.False(ssrfResult.Success);

        // Reject disabled IntegrationApplication
        var disabledAppResult = await service.CreateWebhookAsync(new CreateWebhookRequest
        {
            ApplicationId = 10,
            Name = "ERP Hook",
            TargetUrl = "https://erp.example.com/webhooks",
            SubscribedEvents = ["invoice.paid"]
        }, 1);
        Assert.False(disabledAppResult.Success);
        Assert.Contains("Disabled", disabledAppResult.Message);

        // Create valid webhook with sensitive headers
        var createResult = await service.CreateWebhookAsync(new CreateWebhookRequest
        {
            ApplicationId = 11,
            Name = "ERP Hook",
            TargetUrl = "https://erp.example.com/webhooks",
            SubscribedEvents = ["invoice.paid"],
            CustomHeaders = new Dictionary<string, string>
            {
                ["Authorization"] = "Bearer live-erp-token-9999",
                ["X-Tenant-Code"] = "ACME"
            }
        }, 1);

        Assert.True(createResult.Success);
        Assert.NotNull(storedWebhook);
        Assert.StartsWith("enc:v2:k1:", storedWebhook!.SecretKey);
        Assert.StartsWith("enc:v2:k1:", storedWebhook.CustomHeadersJson);
        Assert.Equal("Bear****9999", createResult.Data!.CustomHeaders["Authorization"]);
        Assert.Equal("ACME", createResult.Data.CustomHeaders["X-Tenant-Code"]);

        // Updating with masked Authorization placeholder must preserve existing plaintext secret in storage
        webhookRepo.Setup(r => r.GetByIdAsync(42, 1)).ReturnsAsync(storedWebhook);
        webhookRepo.Setup(r => r.UpdateAsync(It.IsAny<Webhook>())).Returns(Task.CompletedTask);

        var updateResult = await service.UpdateWebhookAsync(42, new UpdateWebhookRequest
        {
            ApplicationId = 11,
            Name = "ERP Hook Updated",
            TargetUrl = "https://erp.example.com/webhooks-v2",
            SubscribedEvents = ["invoice.paid", "payment.received"],
            CustomHeaders = new Dictionary<string, string>
            {
                ["Authorization"] = "Bear****9999",
                ["X-Tenant-Code"] = "ACME-V2"
            },
            Status = "Active"
        }, 1);

        Assert.True(updateResult.Success);
        var decryptedHeaders = JsonSerializer.Deserialize<Dictionary<string, string>>(enc.Unprotect(storedWebhook.CustomHeadersJson!)!);
        Assert.Equal("Bearer live-erp-token-9999", decryptedHeaders!["Authorization"]);
        Assert.Equal("ACME-V2", decryptedHeaders["X-Tenant-Code"]);
    }

    // =========================================================================
    // 4. WebhookDeliveryService Redaction & Disabled App Replay Block
    // =========================================================================

    [Fact]
    public async Task DeliveryService_RedactsHeadersOnRead_AndBlocksReplayForDisabledApplication()
    {
        var security = new WebhookSecurityService();
        var deliveryRepo = new Mock<IWebhookDeliveryRepository>();
        var webhookRepo = new Mock<IWebhookRepository>();
        var dispatcher = new Mock<IWebhookDispatcher>();

        var app = new IntegrationApplication
        {
            Id = 5,
            TenantId = 1,
            Name = "Blocked App",
            Status = "Active",
            FeatureFlagsJson = "{\"allowWebhooks\":false}"
        };

        var webhook = new Webhook
        {
            Id = 7,
            TenantId = 1,
            Name = "Blocked Hook",
            TargetUrl = "https://erp.example.com/hook",
            Status = "Active",
            ApplicationId = 5,
            Application = app
        };

        var delivery = new WebhookDelivery
        {
            Id = 99,
            TenantId = 1,
            WebhookId = 7,
            Webhook = webhook,
            EventId = "evt-99",
            EventType = "payment.received",
            Status = "Failed",
            RequestHeadersJson = "{\"Authorization\":\"Bearer leaked-secret-value\",\"Content-Type\":\"application/json\"}"
        };

        deliveryRepo.Setup(r => r.GetByIdAsync(99, 1)).ReturnsAsync(delivery);

        var deliveryService = new WebhookDeliveryService(
            deliveryRepo.Object,
            webhookRepo.Object,
            dispatcher.Object,
            Mock.Of<ILogger<WebhookDeliveryService>>(),
            security);

        var dtoResult = await deliveryService.GetDeliveryByIdAsync(99, 1);
        Assert.True(dtoResult.Success);
        Assert.DoesNotContain("leaked-secret-value", dtoResult.Data!.RequestHeadersJson!);
        Assert.Contains("Bear****alue", dtoResult.Data.RequestHeadersJson!);

        var replayResult = await deliveryService.ReplayDeliveryAsync(99, 1);
        Assert.False(replayResult.Success);
        Assert.Contains("allowWebhooks", replayResult.Message);
        dispatcher.Verify(d => d.DispatchDeliveryAsync(It.IsAny<WebhookDelivery>(), It.IsAny<Webhook>()), Times.Never);
    }

    // =========================================================================
    // 5. WebhookDispatcher Decryption, Redaction, Normalization & Dispatch SSRF
    // =========================================================================

    [Fact]
    public async Task Dispatcher_DecryptsSecretAndHeaders_NormalizesPaymentPayload_AndRedactsPersistedHeaders()
    {
        var enc = new AesSecretEncryptionService(BuildEncryptionConfig("k1", new Dictionary<string, string>
        {
            ["k1"] = "test-shared-webhook-encryption-key-01"
        }));
        var security = new WebhookSecurityService();
        var webhookRepo = new Mock<IWebhookRepository>();
        var deliveryRepo = new Mock<IWebhookDeliveryRepository>();

        var handler = new StubHttpMessageHandler((_, _) => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("{\"ok\":true}")
        });
        var httpClient = new HttpClient(handler);

        var dispatcher = new WebhookDispatcher(
            httpClient,
            security,
            webhookRepo.Object,
            deliveryRepo.Object,
            Mock.Of<ILogger<WebhookDispatcher>>(),
            encryptionService: enc,
            securityOptions: new WebhookSecurityOptions { AllowLocalhostTargets = false });

        var webhook = new Webhook
        {
            Id = 15,
            TenantId = 1,
            Name = "Excel Connector Test",
            TargetUrl = "https://erp.example.com/events",
            SecretKey = enc.Protect("whsec_plain_hmac_secret")!,
            CustomHeadersJson = enc.Protect("{\"Authorization\":\"Bearer secret-downstream-token\"}"),
            PayloadFormat = "Standard",
            Status = "Active"
        };

        var delivery = new WebhookDelivery
        {
            Id = 200,
            TenantId = 1,
            WebhookId = 15,
            EventId = "evt_payment_123",
            EventType = "payment.received",
            PayloadJson = JsonSerializer.Serialize(new
            {
                PaymentId = 55,
                PaymentNumber = "PAY-2026-001",
                InvoiceNumber = "INV-2026-009",
                CustomerName = "Acme Corp",
                TotalAmount = 1500.00m,
                PaymentStatus = "Paid",
                Status = "Completed"
            }),
            AttemptNumber = 1,
            MaxAttempts = 5,
            Status = "Pending"
        };

        var result = await dispatcher.DispatchDeliveryAsync(delivery, webhook);

        Assert.Equal("Success", result.Status);
        Assert.Equal(1, handler.CallCount);

        // Outbound request received decrypted header & HMAC signature computed with plain secret
        var authHeader = handler.LastRequest!.Headers.GetValues("Authorization").Single();
        Assert.Equal("Bearer secret-downstream-token", authHeader);

        // Persisted snapshot must be redacted
        Assert.DoesNotContain("secret-downstream-token", result.RequestHeadersJson!);
        Assert.Contains("Bear****oken", result.RequestHeadersJson!);

        // Verify normalized payload carries EventId, PaymentStatus, and InvoiceNumber
        using var sentDoc = JsonDocument.Parse(handler.LastBody!);
        Assert.Equal("evt_payment_123", sentDoc.RootElement.GetProperty("EventId").GetString());
        Assert.Equal("Paid", sentDoc.RootElement.GetProperty("PaymentStatus").GetString());
        Assert.Equal("INV-2026-009", sentDoc.RootElement.GetProperty("InvoiceNumber").GetString());

        // Standalone payment (no InvoiceNumber) must NOT copy PaymentNumber into InvoiceNumber
        var standaloneDelivery = new WebhookDelivery
        {
            Id = 201,
            TenantId = 1,
            WebhookId = 15,
            EventId = "evt_payment_124",
            EventType = "payment.received",
            PayloadJson = JsonSerializer.Serialize(new
            {
                PaymentId = 56,
                PaymentNumber = "PAY-2026-002",
                CustomerName = "Beta LLC",
                TotalAmount = 500m,
                PaymentStatus = "Unallocated"
            }),
            AttemptNumber = 1,
            MaxAttempts = 5,
            Status = "Pending"
        };

        await dispatcher.DispatchDeliveryAsync(standaloneDelivery, webhook);
        using var standaloneDoc = JsonDocument.Parse(handler.LastBody!);
        Assert.False(standaloneDoc.RootElement.TryGetProperty("InvoiceNumber", out _));
        Assert.Equal("PAY-2026-002", standaloneDoc.RootElement.GetProperty("PaymentNumber").GetString());
        Assert.Equal("Unallocated", standaloneDoc.RootElement.GetProperty("PaymentStatus").GetString());
    }

    // =========================================================================
    // 6. OutboxService Transaction Boundary & EventId Injection
    // =========================================================================

    [Fact]
    public async Task OutboxService_InjectsEventId_AndKeepsOutboxPendingIfFanOutTransactionFails()
    {
        var outboxRepo = new Mock<IOutboxRepository>();
        var webhookRepo = new Mock<IWebhookRepository>();
        var deliveryRepo = new Mock<IWebhookDeliveryRepository>();
        var dispatcher = new Mock<IWebhookDispatcher>();

        OutboxMessage? addedMessage = null;
        outboxRepo.Setup(r => r.AddAsync(It.IsAny<OutboxMessage>()))
            .ReturnsAsync((OutboxMessage m) =>
            {
                addedMessage = m;
                return m;
            });

        var service = new OutboxService(
            outboxRepo.Object,
            webhookRepo.Object,
            deliveryRepo.Object,
            dispatcher.Object,
            Mock.Of<ILogger<OutboxService>>());

        await service.PublishEventAsync(1, "invoice.paid", new { InvoiceNumber = "INV-100", TotalAmount = 250m }, "evt_fixed_100");
        Assert.NotNull(addedMessage);
        using var payloadDoc = JsonDocument.Parse(addedMessage!.PayloadJson);
        Assert.Equal("evt_fixed_100", payloadDoc.RootElement.GetProperty("EventId").GetString());

        // Atomic fan-out failure must prevent ANY HTTP dispatch and keep message Pending
        var claimedMessage = new OutboxMessage
        {
            Id = 50,
            TenantId = 1,
            EventId = "evt_fixed_100",
            EventType = "invoice.paid",
            PayloadJson = addedMessage.PayloadJson,
            Status = "Pending"
        };

        outboxRepo.Setup(r => r.ClaimPendingMessagesAsync(It.IsAny<string>(), It.IsAny<TimeSpan>(), 50, It.IsAny<CancellationToken>()))
            .ReturnsAsync([claimedMessage]);
        webhookRepo.Setup(r => r.GetActiveByEventAsync(1, "invoice.paid"))
            .ReturnsAsync([new Webhook { Id = 1, TenantId = 1, TargetUrl = "https://erp.example.com/a", Status = "Active" }]);
        outboxRepo.Setup(r => r.FanOutAndMarkPublishedAsync(claimedMessage, It.IsAny<IReadOnlyCollection<WebhookDelivery>>(), It.IsAny<DateTime>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("Simulated DB child insert failure"));

        var processed = await service.ProcessPendingOutboxMessagesAsync();

        Assert.Equal(0, processed);
        Assert.Equal("Pending", claimedMessage.Status);
        Assert.Equal(1, claimedMessage.RetryCount);
        Assert.Null(claimedMessage.LockedByInstance);
        dispatcher.Verify(d => d.DispatchDeliveryAsync(It.IsAny<WebhookDelivery>(), It.IsAny<Webhook>()), Times.Never);
    }

    [Fact]
    public async Task OutboxService_DoesNotRevertPublishedOutboxWhenHttpDispatchThrows()
    {
        var outboxRepo = new Mock<IOutboxRepository>();
        var webhookRepo = new Mock<IWebhookRepository>();
        var deliveryRepo = new Mock<IWebhookDeliveryRepository>();
        var dispatcher = new Mock<IWebhookDispatcher>();

        var claimedMessage = new OutboxMessage
        {
            Id = 51,
            TenantId = 1,
            EventId = "evt_fixed_101",
            EventType = "payment.received",
            PayloadJson = "{\"EventId\":\"evt_fixed_101\"}",
            Status = "Pending"
        };

        var hookA = new Webhook { Id = 1, TenantId = 1, TargetUrl = "https://erp.example.com/a", Status = "Active" };
        var hookB = new Webhook { Id = 2, TenantId = 1, TargetUrl = "https://erp.example.com/b", Status = "Active" };

        outboxRepo.Setup(r => r.ClaimPendingMessagesAsync(It.IsAny<string>(), It.IsAny<TimeSpan>(), 50, It.IsAny<CancellationToken>()))
            .ReturnsAsync([claimedMessage]);
        webhookRepo.Setup(r => r.GetActiveByEventAsync(1, "payment.received"))
            .ReturnsAsync([hookA, hookB]);
        outboxRepo.Setup(r => r.FanOutAndMarkPublishedAsync(claimedMessage, It.IsAny<IReadOnlyCollection<WebhookDelivery>>(), It.IsAny<DateTime>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((OutboxMessage msg, IReadOnlyCollection<WebhookDelivery> deliveries, DateTime ts, CancellationToken _) =>
            {
                msg.Status = "Published";
                msg.ProcessedAtUtc = ts;
                return deliveries.ToList();
            });

        // hookA throws unexpected HTTP error; hookB still dispatches and outbox remains Published
        dispatcher.Setup(d => d.DispatchDeliveryAsync(It.Is<WebhookDelivery>(x => x.WebhookId == 1), hookA))
            .ThrowsAsync(new HttpRequestException("Timeout"));
        dispatcher.Setup(d => d.DispatchDeliveryAsync(It.Is<WebhookDelivery>(x => x.WebhookId == 2), hookB))
            .ReturnsAsync((WebhookDelivery d, Webhook _) => { d.Status = "Success"; return d; });

        var service = new OutboxService(
            outboxRepo.Object,
            webhookRepo.Object,
            deliveryRepo.Object,
            dispatcher.Object,
            Mock.Of<ILogger<OutboxService>>());

        var processed = await service.ProcessPendingOutboxMessagesAsync();

        Assert.Equal(1, processed);
        Assert.Equal("Published", claimedMessage.Status);
        dispatcher.Verify(d => d.DispatchDeliveryAsync(It.Is<WebhookDelivery>(x => x.WebhookId == 2), hookB), Times.Once);
        outboxRepo.Verify(r => r.UpdateAsync(It.IsAny<OutboxMessage>()), Times.Never);
    }

    // =========================================================================
    // 7. RequireIntegrationAccessAttribute Authorization Filter
    // =========================================================================

    [Theory]
    [InlineData("User", null, 1, 403)]
    [InlineData("Customer", null, 1, 403)]
    [InlineData("Viewer", "integrations.manage", 1, 403)]
    [InlineData("TenantAdmin", null, null, 401)]
    [InlineData("TenantAdmin", null, 3, 200)]
    [InlineData("User", "integrations.manage", 3, 200)]
    public void RequireIntegrationAccessAttribute_EnforcesRolePermissionAndTenantBinding(
        string role,
        string? permissionClaim,
        int? tenantId,
        int expectedStatusCode)
    {
        var claims = new List<Claim> { new(ClaimTypes.Role, role) };
        if (!string.IsNullOrWhiteSpace(permissionClaim))
        {
            claims.Add(new Claim("permissions", permissionClaim));
        }
        if (tenantId.HasValue)
        {
            claims.Add(new Claim("TenantId", tenantId.Value.ToString()));
        }

        var identity = new ClaimsIdentity(claims, "TestAuth");
        var httpContext = new DefaultHttpContext { User = new ClaimsPrincipal(identity) };
        var actionContext = new ActionContext(httpContext, new RouteData(), new ActionDescriptor());
        var authContext = new AuthorizationFilterContext(actionContext, new List<IFilterMetadata>());

        var attr = new RequireIntegrationAccessAttribute();
        attr.OnAuthorization(authContext);

        if (expectedStatusCode == 200)
        {
            Assert.Null(authContext.Result);
        }
        else if (expectedStatusCode == 401)
        {
            Assert.IsType<UnauthorizedObjectResult>(authContext.Result);
        }
        else
        {
            var objResult = Assert.IsType<ObjectResult>(authContext.Result);
            Assert.Equal(403, objResult.StatusCode);
        }
    }
}
