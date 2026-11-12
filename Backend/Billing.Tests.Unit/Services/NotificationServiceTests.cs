using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Billing.Application.Interfaces;
using Billing.Application.Services;
using Billing.Contracts;
using Billing.Contracts.Notification;
using Billing.Domain.Entities;
using Billing.Domain.Enums;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace Billing.Tests.Unit.Services;

public class NotificationServiceTests
{
    private readonly Mock<INotificationTemplateRepository> _templateRepoMock;
    private readonly Mock<INotificationLogRepository> _logRepoMock;
    private readonly Mock<ITemplateEngineService> _templateEngineMock;
    private readonly Mock<IEmailService> _emailMock;
    private readonly Mock<IInvoiceRepository> _invoiceRepoMock;
    private readonly Mock<IPaymentRepository> _paymentRepoMock;
    private readonly Mock<IQuotationRepository> _quotationRepoMock;
    private readonly Mock<ICreditNoteRepository> _creditNoteRepoMock;
    private readonly Mock<ITenantRepository> _tenantRepoMock;
    private readonly Mock<IAuditLogRepository> _auditLogRepoMock;
    private readonly Mock<ILogger<NotificationService>> _loggerMock;
    private readonly NotificationService _sut;

    public NotificationServiceTests()
    {
        _templateRepoMock = new Mock<INotificationTemplateRepository>();
        _logRepoMock = new Mock<INotificationLogRepository>();
        _templateEngineMock = new Mock<ITemplateEngineService>();
        _emailMock = new Mock<IEmailService>();
        _invoiceRepoMock = new Mock<IInvoiceRepository>();
        _paymentRepoMock = new Mock<IPaymentRepository>();
        _quotationRepoMock = new Mock<IQuotationRepository>();
        _creditNoteRepoMock = new Mock<ICreditNoteRepository>();
        _tenantRepoMock = new Mock<ITenantRepository>();
        _auditLogRepoMock = new Mock<IAuditLogRepository>();
        _loggerMock = new Mock<ILogger<NotificationService>>();

        _sut = new NotificationService(
            _templateRepoMock.Object,
            _logRepoMock.Object,
            _templateEngineMock.Object,
            _emailMock.Object,
            _invoiceRepoMock.Object,
            _paymentRepoMock.Object,
            _quotationRepoMock.Object,
            _creditNoteRepoMock.Object,
            _tenantRepoMock.Object,
            _auditLogRepoMock.Object,
            _loggerMock.Object);
    }

    [Fact]
    public async Task GetNotificationHistoryAsync_ReturnsPagedResults()
    {
        var queryParams = new NotificationLogQueryParameters { PageNumber = 1, PageSize = 10 };
        var logs = new List<NotificationLog>
        {
            new() { Id = 1, TenantId = 1, EventType = "InvoiceSent", Status = "Sent", Recipient = "cust@example.com", SentAtUtc = DateTime.UtcNow }
        };
        var pagedResult = new PagedResult<NotificationLog>(logs, 1, 1, 10);
        _logRepoMock.Setup(r => r.QueryLogsAsync(1, queryParams)).ReturnsAsync(pagedResult);

        var result = await _sut.GetNotificationHistoryAsync(1, queryParams);

        Assert.True(result.Success);
        Assert.Single(result.Data!.Items);
        Assert.Equal("InvoiceSent", result.Data.Items[0].EventType);
        Assert.Equal("cust@example.com", result.Data.Items[0].Recipient);
    }

    [Fact]
    public async Task RetryNotificationAsync_WhenSuccess_UpdatesStatusToSentAndIncrementsRetryCount()
    {
        var log = new NotificationLog
        {
            Id = 10,
            TenantId = 1,
            EventType = "PaymentReceived",
            Recipient = "client@example.com",
            Subject = "Receipt",
            Message = "Thank you",
            Status = "Failed",
            RetryCount = 1,
            FailureReason = "SMTP timeout"
        };
        _logRepoMock.Setup(r => r.GetByIdAsync(10, 1)).ReturnsAsync(log);

        var result = await _sut.RetryNotificationAsync(10, 1, "Admin");

        Assert.True(result.Success);
        Assert.Equal("Sent", log.Status);
        Assert.Equal(2, log.RetryCount);
        Assert.Null(log.FailureReason);
        Assert.Null(log.NextRetryAtUtc);
        _emailMock.Verify(e => e.SendEmailAsync("client@example.com", "Receipt", "Thank you", null, null), Times.Once);
        _logRepoMock.Verify(r => r.UpdateAsync(log), Times.Once);
    }

    [Fact]
    public async Task RetryNotificationAsync_WhenEmailThrows_UpdatesStatusToFailedWithExponentialBackoff()
    {
        var log = new NotificationLog
        {
            Id = 10,
            TenantId = 1,
            EventType = "PaymentReceived",
            Recipient = "client@example.com",
            Subject = "Receipt",
            Message = "Thank you",
            Status = "Failed",
            RetryCount = 1
        };
        _logRepoMock.Setup(r => r.GetByIdAsync(10, 1)).ReturnsAsync(log);
        _emailMock.Setup(e => e.SendEmailAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), null, null))
            .ThrowsAsync(new InvalidOperationException("Connection refused"));

        var result = await _sut.RetryNotificationAsync(10, 1, "Admin");

        Assert.False(result.Success);
        Assert.Equal("Failed", log.Status);
        Assert.Equal(2, log.RetryCount);
        Assert.Contains("Connection refused", log.FailureReason);
        Assert.NotNull(log.NextRetryAtUtc);
        _logRepoMock.Verify(r => r.UpdateAsync(log), Times.Once);
    }

    [Fact]
    public async Task SendPaymentNotificationAsync_WhenTemplateExists_RendersAndSendsEmail()
    {
        int paymentId = 5;
        int tenantId = 1;
        var payment = new Payment
        {
            Id = paymentId,
            TenantId = tenantId,
            PaymentNumber = "PAY-001",
            Amount = 250m,
            PaymentDate = DateTime.UtcNow,
            Method = PaymentMethod.BankTransfer,
            Customer = new Customer { Id = 1, Name = "Alice", Email = "alice@example.com" },
            Allocations = new List<InvoicePaymentAllocation>
            {
                new()
                {
                    Invoice = new Invoice { Id = 2, InvoiceNumber = "INV-001", BalanceAmount = 0m, Currency = "INR" }
                }
            }
        };
        _paymentRepoMock.Setup(r => r.GetByIdAsync(tenantId, paymentId)).ReturnsAsync(payment);
        _tenantRepoMock.Setup(r => r.GetByIdAsync(tenantId)).ReturnsAsync(new Tenant { Id = tenantId, Name = "My Corp" });
        _templateRepoMock.Setup(r => r.GetActiveTemplateAsync(tenantId, "PaymentReceived", "Email"))
            .ReturnsAsync(new NotificationTemplate { SubjectTemplate = "Receipt {{PaymentNumber}}", BodyTemplate = "Dear {{CustomerName}}" });
        _templateEngineMock.Setup(t => t.Render("Receipt {{PaymentNumber}}", It.IsAny<IDictionary<string, string>>()))
            .Returns("Receipt PAY-001");
        _templateEngineMock.Setup(t => t.Render("Dear {{CustomerName}}", It.IsAny<IDictionary<string, string>>()))
            .Returns("Dear Alice");

        var result = await _sut.SendPaymentNotificationAsync(paymentId, tenantId, "PaymentReceived", "Admin");

        Assert.True(result.Success);
        _emailMock.Verify(e => e.SendEmailAsync("alice@example.com", "Receipt PAY-001", "Dear Alice", null, null), Times.Once);
        _logRepoMock.Verify(r => r.AddAsync(It.Is<NotificationLog>(l =>
            l.EventType == "PaymentReceived" &&
            l.Status == "Sent" &&
            l.Recipient == "alice@example.com")), Times.Once);
    }

    [Fact]
    public async Task SendInvoiceNotificationAsync_PartialPaymentReminder_IncludesRecentlyPaidPayNowLinkAndAttachesPdf()
    {
        var invoiceId = 55;
        var tenantId = 2;
        var invoice = new Invoice
        {
            Id = invoiceId,
            TenantId = tenantId,
            InvoiceNumber = "INV-0055",
            Currency = "INR",
            TotalAmount = 1000m,
            PaidAmount = 350m,
            BalanceAmount = 650m,
            AllowPartialPayments = true,
            DueDate = DateTime.UtcNow.Date.AddDays(5),
            Customer = new Customer { Id = 9, Name = "Neha", Email = "neha@example.com" }
        };

        _invoiceRepoMock.Setup(r => r.GetByIdAsync(invoiceId, tenantId, default)).ReturnsAsync(invoice);
        _tenantRepoMock.Setup(r => r.GetByIdAsync(tenantId)).ReturnsAsync(new Tenant { Id = tenantId, Name = "Acme Tech", CompanyEmail = "support@acme.test" });
        _paymentRepoMock.Setup(r => r.GetPagedListAsync(tenantId, It.IsAny<Billing.Contracts.Payment.PaymentListFilterRequest>(), null))
            .ReturnsAsync(new PagedResult<Payment>(new List<Payment>
            {
                new()
                {
                    Id = 77,
                    Amount = 200m,
                    PaymentDate = DateTime.UtcNow.Date,
                    Status = PaymentStatus.Completed,
                    Allocations = new List<InvoicePaymentAllocation> { new() { InvoiceId = invoiceId, AllocatedAmount = 200m } }
                }
            }, 1, 1, 1));

        var pdfService = new Mock<IInvoiceTemplateService>();
        var samplePdf = new byte[] { 1, 2, 3, 4 };
        pdfService.Setup(p => p.GetInvoicePdfAsync(invoiceId, tenantId, true, It.IsAny<CancellationToken>()))
            .ReturnsAsync((samplePdf, "INV-0055-updated.pdf", "v1"));

        var sut = new NotificationService(
            _templateRepoMock.Object,
            _logRepoMock.Object,
            _templateEngineMock.Object,
            _emailMock.Object,
            _invoiceRepoMock.Object,
            _paymentRepoMock.Object,
            _quotationRepoMock.Object,
            _creditNoteRepoMock.Object,
            _tenantRepoMock.Object,
            _auditLogRepoMock.Object,
            _loggerMock.Object,
            null,
            pdfService.Object);

        var result = await sut.SendInvoiceNotificationAsync(invoiceId, tenantId, "PartialPaymentReminder", "SystemReminderJob");

        Assert.True(result.Success);
        _emailMock.Verify(e => e.SendEmailAsync(
            "neha@example.com",
            It.Is<string>(s => s.Contains("650.00") && s.Contains("INV-0055")),
            It.Is<string>(b => b.Contains("Recently Paid") && b.Contains("Total Paid") && b.Contains("200.00") && b.Contains("350.00") && b.Contains("650.00") && b.Contains("allowPartial=1&source=reminder") && b.Contains("Click Here to Pay Online")),
            samplePdf,
            "INV-0055-updated.pdf"), Times.Once);
    }

    [Fact]
    public async Task SendCreditNoteNotificationAsync_SendsEmailAndLogsNotification()
    {
        int creditNoteId = 8;
        int tenantId = 1;
        var creditNote = new CreditNote
        {
            Id = creditNoteId,
            TenantId = tenantId,
            CreditNoteNumber = "CN-001",
            TotalAmount = 100m,
            CreditDate = DateTime.UtcNow,
            Reason = "Defective goods",
            Customer = new Customer { Id = 1, Name = "Bob", Email = "bob@example.com" },
            Invoice = new Invoice { Id = 2, InvoiceNumber = "INV-002", Currency = "INR" }
        };
        _creditNoteRepoMock.Setup(r => r.GetByIdAsync(creditNoteId, tenantId, default)).ReturnsAsync(creditNote);
        _tenantRepoMock.Setup(r => r.GetByIdAsync(tenantId)).ReturnsAsync(new Tenant { Id = tenantId, Name = "My Corp" });

        var result = await _sut.SendCreditNoteNotificationAsync(creditNoteId, tenantId, "Admin");

        Assert.True(result.Success);
        _emailMock.Verify(e => e.SendEmailAsync("bob@example.com", It.IsAny<string>(), It.IsAny<string>(), null, "CN-001.pdf"), Times.Once);
        _logRepoMock.Verify(r => r.AddAsync(It.Is<NotificationLog>(l =>
            l.EventType == "CreditNoteIssued" &&
            l.Status == "Sent" &&
            l.Recipient == "bob@example.com")), Times.Once);
    }

    [Fact]
    public async Task SendInvoiceNotificationAsync_WithActiveTemplateAndPayOnlineDisabled_StripsPaymentLinkCtaBlock()
    {
        var invoice = new Invoice
        {
            Id = 42,
            TenantId = 2,
            InvoiceNumber = "INV-042",
            Currency = "INR",
            TotalAmount = 500m,
            BalanceAmount = 500m,
            AllowPartialPayments = false,
            Customer = new Customer { Id = 1, Name = "Raj", Email = "raj@example.com" }
        };
        const string dbBodyTemplate = "<p>Hi {{CustomerName}},</p><p><a href=\"{{PaymentLink}}\" style=\"display:inline-block;padding:10px 18px;background:#5A2508;color:#ffffff;\">Pay Online Now</a></p><p>Thanks</p>";
        _invoiceRepoMock.Setup(r => r.GetByIdAsync(42, 2)).ReturnsAsync(invoice);
        _tenantRepoMock.Setup(r => r.GetByIdAsync(2)).ReturnsAsync(new Tenant { Id = 2, Name = "Pirnav" });
        _templateRepoMock.Setup(r => r.GetActiveTemplateAsync(2, "InvoiceSent", "Email"))
            .ReturnsAsync(new NotificationTemplate { SubjectTemplate = "Invoice {{InvoiceNumber}}", BodyTemplate = dbBodyTemplate });

        string? renderedTemplateInput = null;
        string? capturedPaymentLinkVar = null;
        _templateEngineMock.Setup(t => t.Render("Invoice {{InvoiceNumber}}", It.IsAny<IDictionary<string, string>>()))
            .Returns("Invoice INV-042");
        _templateEngineMock.Setup(t => t.Render(It.IsAny<string>(), It.IsAny<IDictionary<string, string>>()))
            .Callback<string, IDictionary<string, string>>((tpl, vars) =>
            {
                if (tpl != "Invoice {{InvoiceNumber}}")
                {
                    renderedTemplateInput = tpl;
                    vars.TryGetValue("PaymentLink", out capturedPaymentLinkVar);
                }
            })
            .Returns("<p>Hi Raj,</p><p>Thanks</p>");

        var result = await _sut.SendInvoiceNotificationAsync(42, 2, "InvoiceSent", "Admin", null, null, includePayOnlineButton: false);

        Assert.True(result.Success);
        Assert.NotNull(renderedTemplateInput);
        Assert.DoesNotContain("Pay Online Now", renderedTemplateInput);
        Assert.DoesNotContain("{{PaymentLink}}", renderedTemplateInput);
        Assert.Contains("<p>Hi {{CustomerName}},</p>", renderedTemplateInput);
        Assert.Contains("<p>Thanks</p>", renderedTemplateInput);
        Assert.Equal(string.Empty, capturedPaymentLinkVar);
    }

    [Fact]
    public async Task SendInvoiceNotificationAsync_WithActiveTemplateAndPayOnlineEnabled_PreservesPaymentLinkCtaBlock()
    {
        var invoice = new Invoice
        {
            Id = 42,
            TenantId = 2,
            InvoiceNumber = "INV-042",
            Currency = "INR",
            TotalAmount = 500m,
            BalanceAmount = 500m,
            AllowPartialPayments = true,
            Customer = new Customer { Id = 1, Name = "Raj", Email = "raj@example.com" }
        };
        const string dbBodyTemplate = "<p>Hi {{CustomerName}},</p><p><a href=\"{{PaymentLink}}\" style=\"display:inline-block;\">Pay Online Now</a></p>";
        _invoiceRepoMock.Setup(r => r.GetByIdAsync(42, 2)).ReturnsAsync(invoice);
        _tenantRepoMock.Setup(r => r.GetByIdAsync(2)).ReturnsAsync(new Tenant { Id = 2, Name = "Pirnav" });
        _templateRepoMock.Setup(r => r.GetActiveTemplateAsync(2, "InvoiceSent", "Email"))
            .ReturnsAsync(new NotificationTemplate { SubjectTemplate = "Invoice {{InvoiceNumber}}", BodyTemplate = dbBodyTemplate });

        string? renderedTemplateInput = null;
        string? capturedPaymentLinkVar = null;
        _templateEngineMock.Setup(t => t.Render(It.IsAny<string>(), It.IsAny<IDictionary<string, string>>()))
            .Callback<string, IDictionary<string, string>>((tpl, vars) =>
            {
                if (tpl != "Invoice {{InvoiceNumber}}")
                {
                    renderedTemplateInput = tpl;
                    vars.TryGetValue("PaymentLink", out capturedPaymentLinkVar);
                }
            })
            .Returns((string tpl, IDictionary<string, string> _) => tpl);

        var result = await _sut.SendInvoiceNotificationAsync(42, 2, "InvoiceSent", "Admin", null, null, includePayOnlineButton: true);

        Assert.True(result.Success);
        Assert.Equal(dbBodyTemplate, renderedTemplateInput);
        Assert.Contains("/pay/42?tenantId=2&allowPartial=1", capturedPaymentLinkVar);
    }

    [Fact]
    public async Task SendInvoiceNotificationAsync_FallbackHtmlWhenPayOnlineDisabled_OmitsPayNowOnlineButton()
    {
        var invoice = new Invoice
        {
            Id = 43,
            TenantId = 2,
            InvoiceNumber = "INV-043",
            Currency = "INR",
            TotalAmount = 800m,
            BalanceAmount = 800m,
            Customer = new Customer { Id = 1, Name = "Raj", Email = "raj@example.com" }
        };
        _invoiceRepoMock.Setup(r => r.GetByIdAsync(43, 2)).ReturnsAsync(invoice);
        _tenantRepoMock.Setup(r => r.GetByIdAsync(2)).ReturnsAsync(new Tenant { Id = 2, Name = "Pirnav" });
        _templateRepoMock.Setup(r => r.GetActiveTemplateAsync(2, "InvoiceSent", "Email")).ReturnsAsync((NotificationTemplate?)null);

        var result = await _sut.SendInvoiceNotificationAsync(43, 2, "InvoiceSent", "Admin", null, null, includePayOnlineButton: false);

        Assert.True(result.Success);
        _emailMock.Verify(e => e.SendEmailAsync(
            "raj@example.com",
            "Invoice INV-043 from Pirnav",
            It.Is<string>(body => body.Contains("INV-043") && !body.Contains("Click Here to Pay Online") && !body.Contains("Pay Now Online") && !body.Contains("/pay/43")),
            null,
            "INV-043.pdf"), Times.Once);
    }

    [Fact]
    public async Task SendInvoiceNotificationAsync_FallbackHtmlWhenPayOnlineEnabled_IncludesPayNowOnlineButton()
    {
        var invoice = new Invoice
        {
            Id = 43,
            TenantId = 2,
            InvoiceNumber = "INV-043",
            Currency = "INR",
            TotalAmount = 800m,
            BalanceAmount = 800m,
            Customer = new Customer { Id = 1, Name = "Raj", Email = "raj@example.com" }
        };
        _invoiceRepoMock.Setup(r => r.GetByIdAsync(43, 2)).ReturnsAsync(invoice);
        _tenantRepoMock.Setup(r => r.GetByIdAsync(2)).ReturnsAsync(new Tenant { Id = 2, Name = "Pirnav" });
        _templateRepoMock.Setup(r => r.GetActiveTemplateAsync(2, "InvoiceSent", "Email")).ReturnsAsync((NotificationTemplate?)null);

        var result = await _sut.SendInvoiceNotificationAsync(43, 2, "InvoiceSent", "Admin", null, null, includePayOnlineButton: true);

        Assert.True(result.Success);
        _emailMock.Verify(e => e.SendEmailAsync(
            "raj@example.com",
            "Invoice INV-043 from Pirnav",
            It.Is<string>(body => body.Contains("Click Here to Pay Online") && body.Contains("/pay/43?tenantId=2")),
            null,
            "INV-043.pdf"), Times.Once);
    }

    [Fact]
    public async Task SendInvoiceNotificationAsync_PartialPaymentReminderWhenPayOnlineDisabled_OmitsPayNowButtonAndHandlesZeroPaidOptionA()
    {
        var invoice = new Invoice
        {
            Id = 58,
            TenantId = 2,
            InvoiceNumber = "INV-058",
            Currency = "INR",
            TotalAmount = 1200m,
            PaidAmount = 0m,
            BalanceAmount = 1200m,
            AllowPartialPayments = true,
            IncludePayOnlineButton = false,
            Customer = new Customer { Id = 9, Name = "Kavya", Email = "kavya@example.com" }
        };
        _invoiceRepoMock.Setup(r => r.GetByIdAsync(58, 2)).ReturnsAsync(invoice);
        _tenantRepoMock.Setup(r => r.GetByIdAsync(2)).ReturnsAsync(new Tenant { Id = 2, Name = "Pirnav" });
        _templateRepoMock.Setup(r => r.GetActiveTemplateAsync(2, "PartialPaymentReminder", "Email")).ReturnsAsync((NotificationTemplate?)null);

        var result = await _sut.SendInvoiceNotificationAsync(58, 2, "PartialPaymentReminder", "SystemReminderJob");

        Assert.True(result.Success);
        _emailMock.Verify(e => e.SendEmailAsync(
            "kavya@example.com",
            It.Is<string>(s => s.Contains("1,200.00") && s.Contains("INV-058")),
            It.Is<string>(body =>
                body.Contains("Partial payments are accepted") &&
                !body.Contains("Click Here to Pay Online") &&
                !body.Contains("Pay Now") &&
                !body.Contains("/pay/58") &&
                !body.Contains("Recently Paid")),
            null,
            "INV-058.pdf"), Times.Once);
    }

    [Fact]
    public async Task SendInvoiceNotificationAsync_OverdueTemplateWhenPayOnlineDisabled_StripsPaymentPromptLineAndLink()
    {
        var invoice = new Invoice
        {
            Id = 59,
            TenantId = 2,
            InvoiceNumber = "INV-059",
            Currency = "INR",
            TotalAmount = 900m,
            BalanceAmount = 900m,
            DueDate = DateTime.UtcNow.Date.AddDays(-4),
            IncludePayOnlineButton = false,
            Customer = new Customer { Id = 10, Name = "Arjun", Email = "arjun@example.com" }
        };
        const string overdueTemplate = "<p>Dear {{CustomerName}},</p><p>Invoice {{InvoiceNumber}} is {{DaysOverdue}} days overdue.</p><p>Please arrange payment at your earliest convenience: <a href=\"{{PaymentLink}}\">Pay Outstanding Balance</a></p><p>Regards</p>";
        _invoiceRepoMock.Setup(r => r.GetByIdAsync(59, 2)).ReturnsAsync(invoice);
        _tenantRepoMock.Setup(r => r.GetByIdAsync(2)).ReturnsAsync(new Tenant { Id = 2, Name = "Pirnav" });
        _templateRepoMock.Setup(r => r.GetActiveTemplateAsync(2, "InvoiceOverdue", "Email"))
            .ReturnsAsync(new NotificationTemplate { SubjectTemplate = "Overdue {{InvoiceNumber}}", BodyTemplate = overdueTemplate });

        string? renderedTemplate = null;
        string? capturedDaysOverdue = null;
        _templateEngineMock.Setup(t => t.Render(It.IsAny<string>(), It.IsAny<IDictionary<string, string>>()))
            .Callback<string, IDictionary<string, string>>((tpl, vars) =>
            {
                if (tpl != "Overdue {{InvoiceNumber}}")
                {
                    renderedTemplate = tpl;
                    vars.TryGetValue("DaysOverdue", out capturedDaysOverdue);
                }
            })
            .Returns((string tpl, IDictionary<string, string> _) => tpl);

        var result = await _sut.SendInvoiceNotificationAsync(59, 2, "InvoiceOverdue", "SystemReminderJob");

        Assert.True(result.Success);
        Assert.NotNull(renderedTemplate);
        Assert.DoesNotContain("Pay Outstanding Balance", renderedTemplate);
        Assert.DoesNotContain("{{PaymentLink}}", renderedTemplate);
        Assert.DoesNotContain("at your earliest convenience:", renderedTemplate);
        Assert.Contains("<p>Regards</p>", renderedTemplate);
        Assert.Equal("4", capturedDaysOverdue);
    }
}
