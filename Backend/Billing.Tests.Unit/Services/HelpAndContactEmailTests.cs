using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Billing.Application.Common;
using Billing.Application.Interfaces;
using Billing.Application.Services;
using Billing.Contracts.Notification;
using Billing.Domain.Entities;
using Billing.Infrastructure.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace Billing.Tests.Unit.Services;

public class HelpAndContactEmailTests
{
    private readonly Mock<INotificationTemplateRepository> _templateRepoMock = new();
    private readonly Mock<INotificationLogRepository> _logRepoMock = new();
    private readonly Mock<ITemplateEngineService> _templateEngineMock = new();
    private readonly Mock<IEmailService> _emailMock = new();
    private readonly Mock<IInvoiceRepository> _invoiceRepoMock = new();
    private readonly Mock<IPaymentRepository> _paymentRepoMock = new();
    private readonly Mock<IQuotationRepository> _quotationRepoMock = new();
    private readonly Mock<ICreditNoteRepository> _creditNoteRepoMock = new();
    private readonly Mock<ITenantRepository> _tenantRepoMock = new();
    private readonly Mock<IAuditLogRepository> _auditLogRepoMock = new();
    private readonly Mock<ILogger<NotificationService>> _loggerMock = new();
    private readonly NotificationService _notificationService;

    public HelpAndContactEmailTests()
    {
        _notificationService = new NotificationService(
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
    public void HelpAndContactEmailHelper_GeneratesCorrectMailtoAndTelLinks()
    {
        var mailto = HelpAndContactEmailHelper.GetMailtoLink("support@acme.com", "Acme Tech", "Invoice", "INV-1001");
        var tel = HelpAndContactEmailHelper.GetTelLink("+91 98765 43210");

        Assert.Contains("mailto:support@acme.com", mailto);
        Assert.Contains(Uri.EscapeDataString("Support Inquiry - Acme Tech (Invoice INV-1001)"), mailto);
        Assert.Equal("tel:+919876543210", tel);
    }

    [Fact]
    public void HelpAndContactEmailHelper_BuildsHtmlWithPhoneAndAddress()
    {
        var html = HelpAndContactEmailHelper.BuildHelpAndContactHtml(
            companyName: "Acme Tech",
            supportEmail: "support@acme.com",
            phone: "+91 98765 43210",
            address: "123 Tech Park, Hyderabad",
            documentType: "Invoice",
            referenceNumber: "INV-2026-01");

        Assert.Contains("Need Help or Have Questions?", html);
        Assert.Contains("support@acme.com", html);
        Assert.Contains("+91 98765 43210", html);
        Assert.Contains("123 Tech Park, Hyderabad", html);
        Assert.Contains("mailto:support@acme.com", html);
        Assert.Contains("tel:+919876543210", html);
    }

    [Fact]
    public async Task SendInvoiceNotificationAsync_IncludesHelpAndContactDetails()
    {
        const int tenantId = 1;
        const int invoiceId = 42;

        var invoice = new Invoice
        {
            Id = invoiceId,
            TenantId = tenantId,
            InvoiceNumber = "INV-2026-0042",
            Customer = new Customer { Name = "John Doe", Email = "john@example.com" },
            TotalAmount = 5000m,
            BalanceAmount = 5000m,
            PaidAmount = 0m
        };

        var tenant = new Tenant
        {
            Id = tenantId,
            Name = "Acme Technologies",
            CompanyEmail = "billing@acmetechnologies.com",
            Phone = "+91 8001234567",
            Address = "Cyber City, Tower B, Hyderabad"
        };

        _invoiceRepoMock.Setup(r => r.GetByIdAsync(invoiceId, tenantId)).ReturnsAsync(invoice);
        _tenantRepoMock.Setup(r => r.GetByIdAsync(tenantId)).ReturnsAsync(tenant);
        _templateRepoMock.Setup(r => r.GetActiveTemplateAsync(tenantId, "InvoiceSent", "Email")).ReturnsAsync((NotificationTemplate?)null);

        string? capturedBody = null;
        _emailMock.Setup(e => e.SendEmailAsync(
                "john@example.com",
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<byte[]?>(),
                It.IsAny<string?>()))
            .Callback<string, string, string, byte[]?, string?>((to, subj, body, bytes, name) => capturedBody = body)
            .Returns(Task.CompletedTask);

        var result = await _notificationService.SendInvoiceNotificationAsync(invoiceId, tenantId, "InvoiceSent");

        Assert.True(result.Success);
        Assert.NotNull(capturedBody);
        Assert.Contains("Need Help or Have Questions?", capturedBody);
        Assert.Contains("billing@acmetechnologies.com", capturedBody);
        Assert.Contains("+91 8001234567", capturedBody);
        Assert.Contains("Cyber City, Tower B, Hyderabad", capturedBody);
        Assert.Contains("mailto:billing@acmetechnologies.com", capturedBody);
        Assert.Contains("tel:+918001234567", capturedBody);
    }

    [Fact]
    public async Task SendQuotationNotificationAsync_IncludesHelpAndContactDetails()
    {
        const int tenantId = 1;
        const int quoteId = 15;

        var quotation = new Quotation
        {
            Id = quoteId,
            TenantId = tenantId,
            QuoteNumber = "QT-2026-0015",
            Customer = new Customer { Name = "Jane Smith", Email = "jane@example.com" },
            TotalAmount = 12000m,
            ValidUntil = DateTime.UtcNow.AddDays(14)
        };

        var tenant = new Tenant
        {
            Id = tenantId,
            Name = "Vertex Global",
            CompanyEmail = "sales@vertexglobal.com",
            Phone = "+91 9988776655",
            Address = "FinTech District, Bangalore"
        };

        _quotationRepoMock.Setup(r => r.GetByIdAsync(quoteId, tenantId)).ReturnsAsync(quotation);
        _tenantRepoMock.Setup(r => r.GetByIdAsync(tenantId)).ReturnsAsync(tenant);
        _templateRepoMock.Setup(r => r.GetActiveTemplateAsync(tenantId, "QuotationSent", "Email")).ReturnsAsync((NotificationTemplate?)null);

        string? capturedBody = null;
        _emailMock.Setup(e => e.SendEmailAsync(
                "jane@example.com",
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<byte[]?>(),
                It.IsAny<string?>()))
            .Callback<string, string, string, byte[]?, string?>((to, subj, body, bytes, name) => capturedBody = body)
            .Returns(Task.CompletedTask);

        var result = await _notificationService.SendQuotationNotificationAsync(quoteId, tenantId);

        Assert.True(result.Success);
        Assert.NotNull(capturedBody);
        Assert.Contains("Need Help or Have Questions?", capturedBody);
        Assert.Contains("sales@vertexglobal.com", capturedBody);
        Assert.Contains("+91 9988776655", capturedBody);
        Assert.Contains("mailto:sales@vertexglobal.com", capturedBody);
    }

    [Fact]
    public async Task SendCreditNoteNotificationAsync_IncludesHelpAndContactDetails()
    {
        const int tenantId = 1;
        const int cnId = 5;

        var creditNote = new CreditNote
        {
            Id = cnId,
            TenantId = tenantId,
            CreditNoteNumber = "CN-2026-0005",
            Customer = new Customer { Name = "Robert Taylor", Email = "robert@example.com" },
            TotalAmount = 750m,
            Reason = "Defective item returned"
        };

        var tenant = new Tenant
        {
            Id = tenantId,
            Name = "Prime Retailers",
            CompanyEmail = "care@primeretailers.com",
            Phone = "+91 9123456789"
        };

        _creditNoteRepoMock.Setup(r => r.GetByIdAsync(cnId, tenantId)).ReturnsAsync(creditNote);
        _tenantRepoMock.Setup(r => r.GetByIdAsync(tenantId)).ReturnsAsync(tenant);
        _templateRepoMock.Setup(r => r.GetActiveTemplateAsync(tenantId, "CreditNoteIssued", "Email")).ReturnsAsync((NotificationTemplate?)null);

        string? capturedBody = null;
        _emailMock.Setup(e => e.SendEmailAsync(
                "robert@example.com",
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<byte[]?>(),
                It.IsAny<string?>()))
            .Callback<string, string, string, byte[]?, string?>((to, subj, body, bytes, name) => capturedBody = body)
            .Returns(Task.CompletedTask);

        var result = await _notificationService.SendCreditNoteNotificationAsync(cnId, tenantId);

        Assert.True(result.Success);
        Assert.NotNull(capturedBody);
        Assert.Contains("Need Help or Have Questions?", capturedBody);
        Assert.Contains("care@primeretailers.com", capturedBody);
        Assert.Contains("+91 9123456789", capturedBody);
    }
}
