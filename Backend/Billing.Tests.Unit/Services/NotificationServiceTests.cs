using Billing.Application.Interfaces;
using Billing.Application.Services;
using Billing.Contracts.Notification;
using Billing.Domain.Entities;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace Billing.Tests.Unit.Services;

public class NotificationServiceTests
{
    private readonly TemplateEngineService _templateEngine;
    private readonly Mock<INotificationTemplateRepository> _templateRepoMock;
    private readonly Mock<INotificationLogRepository> _logRepoMock;
    private readonly Mock<IEmailService> _emailServiceMock;
    private readonly Mock<IInvoiceRepository> _invoiceRepoMock;
    private readonly Mock<IPaymentRepository> _paymentRepoMock;
    private readonly Mock<IQuotationRepository> _quotationRepoMock;
    private readonly Mock<ICreditNoteRepository> _creditNoteRepoMock;
    private readonly Mock<ITenantRepository> _tenantRepoMock;
    private readonly Mock<IAuditLogRepository> _auditRepoMock;
    private readonly Mock<ILogger<NotificationService>> _loggerMock;
    private readonly NotificationService _notificationService;

    public NotificationServiceTests()
    {
        _templateEngine = new TemplateEngineService();
        _templateRepoMock = new Mock<INotificationTemplateRepository>();
        _logRepoMock = new Mock<INotificationLogRepository>();
        _emailServiceMock = new Mock<IEmailService>();
        _invoiceRepoMock = new Mock<IInvoiceRepository>();
        _paymentRepoMock = new Mock<IPaymentRepository>();
        _quotationRepoMock = new Mock<IQuotationRepository>();
        _creditNoteRepoMock = new Mock<ICreditNoteRepository>();
        _tenantRepoMock = new Mock<ITenantRepository>();
        _auditRepoMock = new Mock<IAuditLogRepository>();
        _loggerMock = new Mock<ILogger<NotificationService>>();

        _notificationService = new NotificationService(
            _templateRepoMock.Object,
            _logRepoMock.Object,
            _templateEngine,
            _emailServiceMock.Object,
            _invoiceRepoMock.Object,
            _paymentRepoMock.Object,
            _quotationRepoMock.Object,
            _creditNoteRepoMock.Object,
            _tenantRepoMock.Object,
            _auditRepoMock.Object,
            _loggerMock.Object);
    }

    [Fact]
    public void TemplateEngine_RendersTokens_AndStripsUnsafeScripts()
    {
        var template = "Hello {{CustomerName}}, please pay {{TotalAmount}}.<script>alert('hack');</script>";
        var variables = new Dictionary<string, string>
        {
            ["CustomerName"] = "Acme Inc",
            ["TotalAmount"] = "₹5,000.00"
        };

        var rendered = _templateEngine.Render(template, variables);

        Assert.Equal("Hello Acme Inc, please pay ₹5,000.00.", rendered);
        Assert.DoesNotContain("<script>", rendered);
    }

    [Fact]
    public void TemplateEngine_GetAvailableVariables_ReturnsDefinitionsForAllEvents()
    {
        var invoiceVars = _templateEngine.GetAvailableVariables("InvoiceSent");
        var paymentVars = _templateEngine.GetAvailableVariables("PaymentReceived");
        var quoteVars = _templateEngine.GetAvailableVariables("QuotationSent");
        var creditVars = _templateEngine.GetAvailableVariables("CreditNoteIssued");

        Assert.Contains(invoiceVars, v => v.Token == "{{InvoiceNumber}}");
        Assert.Contains(paymentVars, v => v.Token == "{{PaymentNumber}}");
        Assert.Contains(quoteVars, v => v.Token == "{{QuotationNumber}}");
        Assert.Contains(creditVars, v => v.Token == "{{CreditNoteNumber}}");
    }

    [Fact]
    public async Task SendInvoiceNotification_SuccessfulDispatch_LogsSentStatus()
    {
        int tenantId = 1;
        int invoiceId = 100;
        var invoice = new Invoice
        {
            Id = invoiceId,
            TenantId = tenantId,
            InvoiceNumber = "INV-2026-001",
            InvoiceDate = DateTime.UtcNow,
            DueDate = DateTime.UtcNow.AddDays(15),
            TotalAmount = 15000m,
            Currency = "INR",
            Customer = new Customer { Name = "Tech Corp", Email = "billing@techcorp.com" }
        };

        _invoiceRepoMock.Setup(r => r.GetByIdAsync(invoiceId, tenantId, default))
            .ReturnsAsync(invoice);

        _templateRepoMock.Setup(r => r.GetActiveTemplateAsync(tenantId, "InvoiceSent", "Email"))
            .ReturnsAsync(new NotificationTemplate
            {
                SubjectTemplate = "Invoice {{InvoiceNumber}}",
                BodyTemplate = "<p>Dear {{CustomerName}}, amount {{TotalAmount}}</p>"
            });

        _emailServiceMock.Setup(e => e.SendEmailAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<byte[]?>(), It.IsAny<string?>()))
            .Returns(Task.CompletedTask);

        _logRepoMock.Setup(r => r.AddAsync(It.IsAny<NotificationLog>()))
            .ReturnsAsync((NotificationLog l) => l);

        var response = await _notificationService.SendInvoiceNotificationAsync(invoiceId, tenantId, "InvoiceSent");

        Assert.True(response.Success);
        Assert.Equal("Sent", response.Data?.Status);
        Assert.Equal("billing@techcorp.com", response.Data?.Recipient);
        Assert.Equal(0, response.Data?.RetryCount);

        _emailServiceMock.Verify(e => e.SendEmailAsync(
            "billing@techcorp.com",
            "Invoice INV-2026-001",
            "<p>Dear Tech Corp, amount 15,000.00</p>",
            null,
            "INV-2026-001.pdf"), Times.Once);
    }

    [Fact]
    public async Task SendInvoiceNotification_WhenEmailFails_LogsFailedStatusAndFailureReason()
    {
        int tenantId = 1;
        int invoiceId = 101;
        var invoice = new Invoice
        {
            Id = invoiceId,
            TenantId = tenantId,
            InvoiceNumber = "INV-2026-002",
            Customer = new Customer { Name = "Client A", Email = "client@domain.com" }
        };

        _invoiceRepoMock.Setup(r => r.GetByIdAsync(invoiceId, tenantId, default))
            .ReturnsAsync(invoice);

        _emailServiceMock.Setup(e => e.SendEmailAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<byte[]?>(), It.IsAny<string?>()))
            .ThrowsAsync(new System.Net.Sockets.SocketException(10060)); // Connection timed out

        NotificationLog? capturedLog = null;
        _logRepoMock.Setup(r => r.AddAsync(It.IsAny<NotificationLog>()))
            .Callback<NotificationLog>(l => capturedLog = l)
            .ReturnsAsync((NotificationLog l) => l);

        var response = await _notificationService.SendInvoiceNotificationAsync(invoiceId, tenantId, "InvoiceSent");

        Assert.False(response.Success);
        Assert.NotNull(capturedLog);
        Assert.Equal("Failed", capturedLog?.Status);
        Assert.NotNull(capturedLog?.FailureReason);
        Assert.NotNull(capturedLog?.NextRetryAtUtc);
    }

    [Fact]
    public async Task RetryNotification_IncrementsRetryCount_AndSetsStatusSentOnSuccess()
    {
        int tenantId = 1;
        int logId = 55;
        var failedLog = new NotificationLog
        {
            Id = logId,
            TenantId = tenantId,
            Recipient = "client@domain.com",
            Subject = "Test Subject",
            Message = "Test Body",
            Status = "Failed",
            RetryCount = 1,
            FailureReason = "Previous timeout"
        };

        _logRepoMock.Setup(r => r.GetByIdAsync(logId, tenantId))
            .ReturnsAsync(failedLog);

        _emailServiceMock.Setup(e => e.SendEmailAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<byte[]?>(), It.IsAny<string?>()))
            .Returns(Task.CompletedTask);

        _logRepoMock.Setup(r => r.UpdateAsync(It.IsAny<NotificationLog>()))
            .ReturnsAsync((NotificationLog l) => l);

        var response = await _notificationService.RetryNotificationAsync(logId, tenantId);

        Assert.True(response.Success);
        Assert.Equal("Sent", response.Data?.Status);
        Assert.Equal(2, response.Data?.RetryCount);
        Assert.Null(response.Data?.FailureReason);
    }
}
