using System.Security.Cryptography;
using System.Text;
using Billing.Application.Interfaces;
using Billing.Contracts.Payment;
using Billing.Domain.Entities;
using Billing.Domain.Enums;
using Billing.Infrastructure.Data;
using Billing.Infrastructure.Repositories;
using Billing.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Billing.Tests.Integration;

public class PaymentGatewayModeIntegrationTests
{
    private static BillingDbContext CreateDb(string name)
    {
        var opts = new DbContextOptionsBuilder<BillingDbContext>()
            .UseInMemoryDatabase(name)
            .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
            .Options;
        return new BillingDbContext(opts);
    }

    private static PaymentGatewayService CreateGatewayService(BillingDbContext db, out Invoice seededInvoice)
    {
        var cust = new Customer { Id = 1, TenantId = 2, Name = "Acme Customer", Email = "cust@acme.com" };
        db.Customers.Add(cust);
        seededInvoice = new Invoice
        {
            Id = 55,
            TenantId = 2,
            CustomerId = 1,
            Customer = cust,
            InvoiceNumber = "INV-2026-0055",
            Currency = "INR",
            TotalAmount = 1500m,
            PaidAmount = 0m,
            BalanceAmount = 1500m,
            AllowPartialPayments = true,
            Status = "Sent"
        };
        db.Invoices.Add(seededInvoice);
        db.SaveChanges();

        var invoiceRepo = new InvoiceRepository(db);
        var templateRepo = new InvoiceTemplateRepository(db);
        var paymentServiceMock = new Mock<IPaymentService>();
        paymentServiceMock
            .Setup(s => s.CreatePaymentAsync(It.IsAny<int>(), It.IsAny<CreatePaymentRequest>(), It.IsAny<string>(), It.IsAny<IEnumerable<string>?>(), It.IsAny<IEnumerable<string>?>(), It.IsAny<int?>()))
            .ReturnsAsync(PaymentOperationResult<PaymentDetailDto>.Success(new PaymentDetailDto { Id = 101, PaymentNumber = "PAY-101", Method = "Gateway", Amount = 1500m }));

        var cfg = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["JwtSettings:SecretKey"] = "TestGatewayEncryptionSecretKeyWithAtLeast32Bytes!!",
                ["AppUrls:ApiBaseUrl"] = "https://example.test"
            })
            .Build();

        return new PaymentGatewayService(
            invoiceRepo,
            paymentServiceMock.Object,
            templateRepo,
            NullLogger<PaymentGatewayService>.Instance,
            ledgerService: null,
            dbContext: db,
            configuration: cfg);
    }

    [Fact]
    public async Task LiveModeRequiresLiveCredentials_AndHidesTestSimulationControlsWhenDisabled()
    {
        using var db = CreateDb(Guid.NewGuid().ToString());
        var service = CreateGatewayService(db, out var invoice);

        // Reject Live mode when Live keys are missing
        var failLive = await service.UpdateGatewaySettingsAsync(2, new UpdatePaymentGatewaySettingsRequest
        {
            IsSandbox = false,
            AllowTestSimulationTools = true
        }, "Admin");
        Assert.False(failLive.Success);

        // Save Sandbox with test simulation tools toggled OFF
        var hideTools = await service.UpdateGatewaySettingsAsync(2, new UpdatePaymentGatewaySettingsRequest
        {
            IsSandbox = true,
            AllowTestSimulationTools = false
        }, "Admin");
        Assert.True(hideTools.Success);
        Assert.True(hideTools.Data!.IsSandbox);
        Assert.False(hideTools.Data.AllowTestSimulationTools);
        Assert.False(await service.IsTestSimulationAllowedAsync(2));

        var orderResp = await service.CreateOrderAsync(2, new CreatePaymentOrderRequest { InvoiceId = invoice.Id });
        Assert.True(orderResp.Success);
        Assert.True(orderResp.Data!.IsSandbox);
        Assert.False(orderResp.Data.AllowTestSimulationTools);

        // Simulated Card / NetBanking / UPI must all be rejected when Test Mode toggle is OFF
        foreach (var gw in new[] { "UPI_Simulated", "Card", "InternetBanking" })
        {
            var blocked = await service.VerifyAndProcessPaymentAsync(2, new VerifyGatewayPaymentRequest
            {
                InvoiceId = invoice.Id,
                Gateway = gw,
                OrderId = "order_local_1",
                PaymentId = "pay_local_1",
                Amount = 1500m
            }, "Customer");
            Assert.False(blocked.Success);
        }
    }

    [Fact]
    public async Task LiveModeEncryptsSecrets_RejectsTamperedSignaturesAndAllowsValidRazorpayHmac()
    {
        var dbName = Guid.NewGuid().ToString();
        using var db = CreateDb(dbName);
        var service = CreateGatewayService(db, out var invoice);

        const string liveSecret = "live_secret_super_value_12345";
        const string webhookSecret = "wh_secret_987654";

        var saved = await service.UpdateGatewaySettingsAsync(2, new UpdatePaymentGatewaySettingsRequest
        {
            IsSandbox = false,
            AllowTestSimulationTools = true, // Live mode still disables checkout simulation!
            RazorpayLiveKeyId = "rzp_live_1234567890",
            RazorpayLiveKeySecret = liveSecret,
            RazorpayLiveWebhookSecret = webhookSecret
        }, "Admin");

        Assert.True(saved.Success);
        Assert.False(saved.Data!.IsSandbox);
        Assert.True(saved.Data.LiveModeReady);
        Assert.True(saved.Data.HasLiveKeySecret);
        Assert.True(saved.Data.HasLiveWebhookSecret);

        // Secrets must be AES-GCM encrypted at rest in DB
        var entity = await db.PaymentGatewaySettings.FirstAsync(x => x.TenantId == 2);
        Assert.StartsWith("enc:v1:", entity.RazorpayLiveKeySecretProtected);
        Assert.DoesNotContain(liveSecret, entity.RazorpayLiveKeySecretProtected);

        // AuditLog must redact secrets
        var audit = await db.AuditLogs.OrderByDescending(a => a.Id).FirstAsync(a => a.EntityName == nameof(PaymentGatewaySetting));
        Assert.Contains("[REDACTED]", audit.NewValues);
        Assert.DoesNotContain(liveSecret, audit.NewValues);

        // Live mode disables test simulation tools & simulated payment verification
        Assert.False(await service.IsTestSimulationAllowedAsync(2));
        var simVerify = await service.VerifyAndProcessPaymentAsync(2, new VerifyGatewayPaymentRequest
        {
            InvoiceId = invoice.Id,
            Gateway = "UPI_Simulated",
            OrderId = "order_1",
            PaymentId = "pay_1",
            Amount = 1500m
        }, "Customer");
        Assert.False(simVerify.Success);

        // Reject invalid signature in Live Mode
        var badSigVerify = await service.VerifyAndProcessPaymentAsync(2, new VerifyGatewayPaymentRequest
        {
            InvoiceId = invoice.Id,
            Gateway = "Razorpay",
            OrderId = "order_live_99",
            PaymentId = "pay_live_88",
            Signature = "0000invalid",
            Amount = 1500m
        }, "Customer");
        Assert.False(badSigVerify.Success);

        // Accept valid HMAC-SHA256 signature in Live Mode
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(liveSecret));
        var validSig = Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes("order_live_99|pay_live_88"))).ToLowerInvariant();
        var goodSigVerify = await service.VerifyAndProcessPaymentAsync(2, new VerifyGatewayPaymentRequest
        {
            InvoiceId = invoice.Id,
            Gateway = "Razorpay",
            OrderId = "order_live_99",
            PaymentId = "pay_live_88",
            Signature = validSig,
            Amount = 1500m
        }, "Customer");
        Assert.True(goodSigVerify.Success);

        // Verify Webhook HMAC-SHA256 validation
        const string webhookBody = "{\"event\":\"payment.captured\"}";
        using var whHmac = new HMACSHA256(Encoding.UTF8.GetBytes(webhookSecret));
        var validWhSig = Convert.ToHexString(whHmac.ComputeHash(Encoding.UTF8.GetBytes(webhookBody))).ToLowerInvariant();
        Assert.True(await service.VerifyWebhookSignatureAsync(2, webhookBody, validWhSig));
        Assert.False(await service.VerifyWebhookSignatureAsync(2, webhookBody, "tampered_sig"));
    }
}
