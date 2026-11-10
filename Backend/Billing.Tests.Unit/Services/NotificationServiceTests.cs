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
    public async Task SendInvoiceNotificationAsync_PartialPaymentReminder_IncludesRecentlyPaidPayNowOnlyAndAttachesPdf()
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
            It.Is<string>(b => b.Contains("Recently Paid") && b.Contains("200.00") && b.Contains("350.00") && b.Contains("650.00") && b.Contains("allowPartial=0&payNowOnly=1") && b.Contains("Pay Now")),
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
}
