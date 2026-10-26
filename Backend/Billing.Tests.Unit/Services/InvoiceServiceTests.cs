using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Billing.Application.Interfaces;
using Billing.Application.Services;
using Billing.Contracts;
using Billing.Contracts.Financial;
using Billing.Contracts.Numbering;
using Billing.Domain.Entities;
using Moq;
using Xunit;

namespace Billing.Tests.Unit.Services;

public class InvoiceServiceTests
{
    private readonly Mock<IInvoiceRepository> _invoiceRepoMock;
    private readonly Mock<INumberGenerationService> _numberGenMock;
    private readonly Mock<IFinancialCalculationEngine> _calcEngineMock;
    private readonly Mock<IUnitOfWork> _uowMock;
    private readonly Mock<IAuditLogRepository> _auditMock;
    private readonly Mock<IEmailService> _emailMock;
    private readonly Mock<IInvoiceCommunicationRepository> _commMock;
    private readonly Mock<IInvoiceTemplateService> _templateMock;
    private readonly InvoiceService _sut;

    public InvoiceServiceTests()
    {
        _invoiceRepoMock = new Mock<IInvoiceRepository>();
        _numberGenMock = new Mock<INumberGenerationService>();
        _calcEngineMock = new Mock<IFinancialCalculationEngine>();
        _uowMock = new Mock<IUnitOfWork>();
        _auditMock = new Mock<IAuditLogRepository>();
        _emailMock = new Mock<IEmailService>();
        _commMock = new Mock<IInvoiceCommunicationRepository>();
        _templateMock = new Mock<IInvoiceTemplateService>();

        _sut = new InvoiceService(
            _invoiceRepoMock.Object,
            _numberGenMock.Object,
            _calcEngineMock.Object,
            _uowMock.Object,
            _auditMock.Object,
            _emailMock.Object,
            _commMock.Object,
            _templateMock.Object);
    }

    [Fact]
    public async Task IssueInvoiceAsync_ShouldSucceed_AndAssignNumber()
    {
        // Arrange
        int invoiceId = 1;
        int tenantId = 1;
        var draftInvoice = new Invoice
        {
            Id = invoiceId,
            TenantId = tenantId,
            Status = "Draft",
            Items = new List<InvoiceItem>
            {
                new InvoiceItem { UnitPrice = 100, Quantity = 1 }
            }
        };

        _invoiceRepoMock.Setup(r => r.GetByIdForUpdateAsync(invoiceId, tenantId))
            .ReturnsAsync(draftInvoice);

        _calcEngineMock.Setup(c => c.CalculateAsync(It.IsAny<FinancialCalculationRequest>(), tenantId))
            .ReturnsAsync(ApiResponse<FinancialCalculationResultDto>.Ok(new FinancialCalculationResultDto
            {
                GrandTotal = 100,
                GrossSubtotal = 100,
                Items = new List<CalculatedFinancialLineDto> { new CalculatedFinancialLineDto { LineTotal = 100 } }
            }));

        _numberGenMock.Setup(n => n.GenerateNextNumberAsync(It.IsAny<GenerateNumberRequest>(), tenantId))
            .ReturnsAsync(ApiResponse<GenerateNumberResponseDto>.Ok(new GenerateNumberResponseDto { GeneratedNumber = "INV-001" }));

        // Act
        var result = await _sut.IssueInvoiceAsync(invoiceId, tenantId);

        // Assert
        Assert.True(result.Success);
        Assert.Equal("Issued", result.Data!.Status);
        Assert.Equal("INV-001", result.Data.InvoiceNumber);
        Assert.Equal(100, result.Data.TotalAmount);
        Assert.Equal(100, result.Data.BalanceAmount);

        _uowMock.Verify(u => u.BeginTransactionAsync(), Times.Once);
        _uowMock.Verify(u => u.CommitTransactionAsync(), Times.Once);
        _invoiceRepoMock.Verify(r => r.UpdateAsync(It.IsAny<Invoice>()), Times.Once);
        _auditMock.Verify(a => a.AddAsync(It.IsAny<AuditLog>()), Times.Once);
    }

    [Fact]
    public async Task CancelInvoiceAsync_WithActivePayments_ShouldFail()
    {
        // Arrange
        int invoiceId = 2;
        int tenantId = 1;
        var issuedInvoice = new Invoice
        {
            Id = invoiceId,
            TenantId = tenantId,
            Status = "Issued",
            PaymentAllocations = new List<InvoicePaymentAllocation>
            {
                new InvoicePaymentAllocation { IsReversed = false, AllocatedAmount = 50 }
            }
        };

        _invoiceRepoMock.Setup(r => r.GetByIdAsync(invoiceId, tenantId, default))
            .ReturnsAsync(issuedInvoice);

        // Act
        var result = await _sut.CancelInvoiceAsync(invoiceId, tenantId, "Customer requested");

        // Assert
        Assert.False(result.Success);
        Assert.Contains("active payments", result.Message);
        
        _invoiceRepoMock.Verify(r => r.UpdateAsync(It.IsAny<Invoice>()), Times.Never);
        _auditMock.Verify(a => a.AddAsync(It.IsAny<AuditLog>()), Times.Never);
    }

    [Fact]
    public async Task IssueInvoiceAsync_WithLineAndInvoiceDiscounts_DoesNotDoubleCountLineDiscounts()
    {
        // Arrange
        int invoiceId = 3;
        int tenantId = 1;
        var draftInvoice = new Invoice
        {
            Id = invoiceId,
            TenantId = tenantId,
            Status = "Draft",
            DiscountAmount = 30m, // 10 line discount + 20 invoice discount already persisted
            Items = new List<InvoiceItem>
            {
                new InvoiceItem { UnitPrice = 100m, Quantity = 1m, DiscountType = "Percentage", DiscountRate = 10m, DiscountAmount = 10m }
            }
        };

        _invoiceRepoMock.Setup(r => r.GetByIdForUpdateAsync(invoiceId, tenantId))
            .ReturnsAsync(draftInvoice);

        FinancialCalculationRequest? capturedRequest = null;
        _calcEngineMock.Setup(c => c.CalculateAsync(It.IsAny<FinancialCalculationRequest>(), tenantId, It.IsAny<string?>(), It.IsAny<string?>()))
            .Callback<FinancialCalculationRequest, int, string?, string?>((req, t, r, u) => capturedRequest = req)
            .ReturnsAsync(ApiResponse<FinancialCalculationResultDto>.Ok(new FinancialCalculationResultDto
            {
                GrossSubtotal = 100m,
                TotalLineDiscounts = 10m,
                InvoiceDiscountAmount = 20m,
                GrandTotal = 70m,
                Items = new List<CalculatedFinancialLineDto> { new CalculatedFinancialLineDto { LineTotal = 90m, DiscountAmount = 10m } }
            }));

        _numberGenMock.Setup(n => n.GenerateNextNumberAsync(It.IsAny<GenerateNumberRequest>(), tenantId))
            .ReturnsAsync(ApiResponse<GenerateNumberResponseDto>.Ok(new GenerateNumberResponseDto { GeneratedNumber = "INV-003" }));

        // Act
        var result = await _sut.IssueInvoiceAsync(invoiceId, tenantId);

        // Assert
        Assert.True(result.Success);
        Assert.NotNull(capturedRequest);
        // InvoiceDiscount should be strictly the header discount portion (30 - 10 = 20), NOT 30!
        Assert.NotNull(capturedRequest!.InvoiceDiscount);
        Assert.Equal(20m, capturedRequest.InvoiceDiscount!.Value);
        Assert.Equal(30m, result.Data!.DiscountAmount);
        Assert.Equal(70m, result.Data.TotalAmount);
    }

    [Fact]
    public async Task DeliverInvoiceAsync_WhenNotificationLogRepoProvided_LogsSentStatusToNotificationLogs()
    {
        // Arrange
        int invoiceId = 1;
        int tenantId = 1;
        var invoice = new Invoice
        {
            Id = invoiceId,
            TenantId = tenantId,
            InvoiceNumber = "INV-2026-001",
            Status = "Issued",
            TotalAmount = 500m,
            Customer = new Customer { Id = 10, Name = "Test Customer", Email = "customer@example.com" }
        };

        _invoiceRepoMock.Setup(r => r.GetByIdAsync(invoiceId, tenantId, default)).ReturnsAsync(invoice);
        _templateMock.Setup(t => t.GenerateInvoicePdfAsync(It.IsAny<Billing.Contracts.InvoiceTemplate.GenerateInvoicePdfRequest>(), tenantId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Billing.Contracts.InvoiceTemplate.InvoicePdfResponse { InvoiceId = invoiceId });
        _templateMock.Setup(t => t.GetInvoicePdfAsync(invoiceId, tenantId, It.IsAny<CancellationToken>()))
            .ReturnsAsync((new byte[] { 1, 2, 3 }, "INV-2026-001.pdf", "application/pdf"));

        var logRepoMock = new Mock<INotificationLogRepository>();

        var sut = new InvoiceService(
            _invoiceRepoMock.Object,
            _numberGenMock.Object,
            _calcEngineMock.Object,
            _uowMock.Object,
            _auditMock.Object,
            _emailMock.Object,
            _commMock.Object,
            _templateMock.Object,
            outboxService: null,
            notificationLogRepository: logRepoMock.Object);

        // Act
        var result = await sut.DeliverInvoiceAsync(invoiceId, tenantId, "Admin");

        // Assert
        Assert.True(result.Success);
        logRepoMock.Verify(r => r.AddAsync(It.Is<NotificationLog>(l =>
            l.EventType == "InvoiceSent" &&
            l.EntityId == invoiceId &&
            l.Status == "Sent" &&
            l.Recipient == "customer@example.com")), Times.Once);
    }
    [Fact]
    public async Task CreateDraftAsync_ShouldGenerateSequentialInvoiceNumber()
    {
        // Arrange
        int tenantId = 1;
        var invoice = new Invoice
        {
            TenantId = tenantId,
            InvoiceDate = new DateTime(2026, 10, 22),
            Items = new List<InvoiceItem>
            {
                new InvoiceItem { UnitPrice = 100, Quantity = 1 }
            }
        };

        _calcEngineMock.Setup(c => c.CalculateAsync(It.IsAny<FinancialCalculationRequest>(), tenantId))
            .ReturnsAsync(ApiResponse<FinancialCalculationResultDto>.Ok(new FinancialCalculationResultDto
            {
                GrandTotal = 100,
                GrossSubtotal = 100,
                Items = new List<CalculatedFinancialLineDto> { new CalculatedFinancialLineDto { LineTotal = 100 } }
            }));

        _numberGenMock.Setup(n => n.GenerateNextNumberAsync(It.IsAny<GenerateNumberRequest>(), tenantId))
            .ReturnsAsync(ApiResponse<GenerateNumberResponseDto>.Ok(new GenerateNumberResponseDto { GeneratedNumber = "INV-2026-10-000036" }));

        _invoiceRepoMock.Setup(r => r.GetByInvoiceNumberAsync("INV-2026-10-000036", tenantId))
            .ReturnsAsync((Invoice?)null);

        _invoiceRepoMock.Setup(r => r.AddAsync(It.IsAny<Invoice>()))
            .ReturnsAsync((Invoice inv) => { inv.Id = 42; return inv; });

        // Act
        var result = await _sut.CreateDraftAsync(invoice, tenantId, "TestUser");

        // Assert
        Assert.True(result.Success);
        Assert.Equal("Draft", result.Data!.Status);
        Assert.Equal("INV-2026-10-000036", result.Data.InvoiceNumber);
        _numberGenMock.Verify(n => n.GenerateNextNumberAsync(It.Is<GenerateNumberRequest>(req => req.DocumentType == "Invoice"), tenantId), Times.Once);
        _invoiceRepoMock.Verify(r => r.AddAsync(It.Is<Invoice>(i => i.InvoiceNumber == "INV-2026-10-000036")), Times.Once);
    }

    [Fact]
    public async Task IssueInvoiceAsync_WhenAlreadyHasSequentialInvoiceNumber_PreservesExistingInvoiceNumber()
    {
        // Arrange
        int invoiceId = 10;
        int tenantId = 1;
        var draftInvoice = new Invoice
        {
            Id = invoiceId,
            TenantId = tenantId,
            Status = "Draft",
            InvoiceNumber = "INV-2026-10-000036",
            Items = new List<InvoiceItem>
            {
                new InvoiceItem { UnitPrice = 100, Quantity = 1 }
            }
        };

        _invoiceRepoMock.Setup(r => r.GetByIdForUpdateAsync(invoiceId, tenantId))
            .ReturnsAsync(draftInvoice);

        _calcEngineMock.Setup(c => c.CalculateAsync(It.IsAny<FinancialCalculationRequest>(), tenantId))
            .ReturnsAsync(ApiResponse<FinancialCalculationResultDto>.Ok(new FinancialCalculationResultDto
            {
                GrandTotal = 100,
                GrossSubtotal = 100,
                Items = new List<CalculatedFinancialLineDto> { new CalculatedFinancialLineDto { LineTotal = 100 } }
            }));

        // Act
        var result = await _sut.IssueInvoiceAsync(invoiceId, tenantId);

        // Assert
        Assert.True(result.Success);
        Assert.Equal("Issued", result.Data!.Status);
        Assert.Equal("INV-2026-10-000036", result.Data.InvoiceNumber);

        // Verify that number generator was NOT called because it already had a valid invoice number
        _numberGenMock.Verify(n => n.GenerateNextNumberAsync(It.IsAny<GenerateNumberRequest>(), tenantId), Times.Never);
    }
    [Fact]
    public async Task IssueInvoiceAsync_WhenNotificationServiceProvided_DispatchesInvoiceIssuedNotification()
    {
        // Arrange
        int invoiceId = 20;
        int tenantId = 1;
        var draftInvoice = new Invoice
        {
            Id = invoiceId,
            TenantId = tenantId,
            Status = "Draft",
            InvoiceNumber = "INV-2026-10-000041",
            Items = new List<InvoiceItem>
            {
                new InvoiceItem { UnitPrice = 1000, Quantity = 1 }
            }
        };

        _invoiceRepoMock.Setup(r => r.GetByIdForUpdateAsync(invoiceId, tenantId)).ReturnsAsync(draftInvoice);
        _calcEngineMock.Setup(c => c.CalculateAsync(It.IsAny<FinancialCalculationRequest>(), tenantId))
            .ReturnsAsync(ApiResponse<FinancialCalculationResultDto>.Ok(new FinancialCalculationResultDto
            {
                GrandTotal = 1000,
                GrossSubtotal = 1000,
                Items = new List<CalculatedFinancialLineDto> { new CalculatedFinancialLineDto { LineTotal = 1000 } }
            }));
        _uowMock.Setup(u => u.BeginTransactionAsync()).Returns(Task.CompletedTask);
        _uowMock.Setup(u => u.CommitTransactionAsync()).Returns(Task.CompletedTask);
        _invoiceRepoMock.Setup(r => r.UpdateAsync(It.IsAny<Invoice>())).ReturnsAsync((Invoice i, System.Threading.CancellationToken ct) => i);

        var notifMock = new Mock<INotificationService>();
        notifMock.Setup(n => n.SendInvoiceNotificationAsync(invoiceId, tenantId, "InvoiceIssued", "Admin", null, null))
                 .ReturnsAsync(ApiResponse<Billing.Contracts.Notification.NotificationLogDto>.Ok(new Billing.Contracts.Notification.NotificationLogDto { Id = 1, Status = "Sent" }));

        var invoiceService = new InvoiceService(
            _invoiceRepoMock.Object,
            _numberGenMock.Object,
            _calcEngineMock.Object,
            _uowMock.Object,
            _auditMock.Object,
            _emailMock.Object,
            _commMock.Object,
            _templateMock.Object,
            outboxService: null,
            notificationLogRepository: null,
            notificationService: notifMock.Object);

        // Act
        var result = await invoiceService.IssueInvoiceAsync(invoiceId, tenantId, "Admin");

        // Assert
        Assert.True(result.Success);
        Assert.Equal("Issued", result.Data!.Status);
        notifMock.Verify(n => n.SendInvoiceNotificationAsync(invoiceId, tenantId, "InvoiceIssued", "Admin", null, null), Times.Once);
    }
}