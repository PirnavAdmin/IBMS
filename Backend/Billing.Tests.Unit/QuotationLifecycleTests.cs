using Billing.Application.Interfaces;
using Billing.Application.Services;
using Billing.Contracts;
using Billing.Domain.Entities;
using Billing.Domain.Enums;
using Moq;
using Xunit;

namespace Billing.Tests.Unit;

public class QuotationLifecycleTests
{
    private readonly Mock<IQuotationRepository> _mockQuotationRepo;
    private readonly Mock<IInvoiceRepository> _mockInvoiceRepo;
    private readonly Mock<IUnitOfWork> _mockUow;
    private readonly Mock<IFinancialCalculationEngine> _mockFinanceEngine;
    private readonly Mock<INumberGenerationService> _mockNumberGen;
    private readonly Mock<IAuditLogRepository> _mockAudit;
    private readonly Mock<IEmailService> _mockEmail;
    
    private readonly QuotationActionService _service;

    public QuotationLifecycleTests()
    {
        _mockQuotationRepo = new Mock<IQuotationRepository>();
        _mockInvoiceRepo = new Mock<IInvoiceRepository>();
        _mockUow = new Mock<IUnitOfWork>();
        _mockFinanceEngine = new Mock<IFinancialCalculationEngine>();
        _mockNumberGen = new Mock<INumberGenerationService>();
        _mockAudit = new Mock<IAuditLogRepository>();
        _mockEmail = new Mock<IEmailService>();
        _mockEmail
            .Setup(e => e.SendEmailAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<byte[]?>(), It.IsAny<string?>()))
            .Returns(Task.CompletedTask);

        _service = new QuotationActionService(
            _mockQuotationRepo.Object,
            _mockInvoiceRepo.Object,
            _mockUow.Object,
            _mockFinanceEngine.Object,
            _mockNumberGen.Object,
            _mockAudit.Object,
            _mockEmail.Object
        );
    }

    [Fact]
    public async Task SendQuotation_ValidDraft_TransitionsToSent()
    {
        // Arrange
        var q = new Quotation 
        { 
            Id = 1, 
            TenantId = 1, 
            Status = QuotationStatus.Draft, 
            CustomerId = 100,
            Customer = new Customer { Id = 100, Name = "Test Customer", Email = "customer@example.com", Currency = "INR" },
            ValidUntil = DateTime.UtcNow.AddDays(15),
            QuoteNumber = "QT-001",
            Subtotal = 500m,
            TotalAmount = 500m,
            Items = new List<QuotationItem>
            {
                new() { Description = "Test Item", Quantity = 1, UnitPrice = 500, TotalAmount = 500 }
            }
        };
        _mockQuotationRepo.Setup(r => r.GetByIdForUpdateAsync(1, 1)).ReturnsAsync(q);
        _mockQuotationRepo.Setup(r => r.GetByIdAsync(1, 1)).ReturnsAsync(q);

        // Act
        var result = await _service.SendQuotationAsync(1, 1, "user1");

        // Assert
        Assert.True(result.Success);
        Assert.Equal(QuotationStatus.Sent, q.Status);
        _mockEmail.Verify(e => e.SendEmailAsync(
            "customer@example.com",
            "Quotation QT-001",
            It.Is<string>(body => body.Contains("QT-001") && body.Contains("500.00 INR")),
            null,
            null), Times.Once);
        _mockQuotationRepo.Verify(r => r.UpdateAsync(q), Times.Once);
        _mockAudit.Verify(a => a.AddAsync(It.IsAny<AuditLog>(), default), Times.Once);
    }

    [Fact]
    public async Task SendQuotation_MissingCustomerEmail_FailsWithoutChangingStatus()
    {
        var q = new Quotation
        {
            Id = 1,
            TenantId = 1,
            Status = QuotationStatus.Draft,
            CustomerId = 100,
            Customer = new Customer { Id = 100, Name = "Test Customer", Email = "" },
            ValidUntil = DateTime.UtcNow.AddDays(15),
            TotalAmount = 500m,
            Items = new List<QuotationItem> { new() { Description = "Test Item", Quantity = 1, UnitPrice = 500, TotalAmount = 500 } }
        };
        _mockQuotationRepo.Setup(r => r.GetByIdForUpdateAsync(1, 1)).ReturnsAsync(q);

        var result = await _service.SendQuotationAsync(1, 1, "user1");

        Assert.False(result.Success);
        Assert.Contains("valid email", result.Message);
        Assert.Equal(QuotationStatus.Draft, q.Status);
        _mockEmail.Verify(e => e.SendEmailAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<byte[]?>(), It.IsAny<string?>()), Times.Never);
    }

    [Fact]
    public async Task SendQuotation_EmailFailure_DoesNotMarkQuotationAsSent()
    {
        var q = new Quotation
        {
            Id = 1,
            TenantId = 1,
            Status = QuotationStatus.Draft,
            CustomerId = 100,
            Customer = new Customer { Id = 100, Name = "Test Customer", Email = "customer@example.com" },
            ValidUntil = DateTime.UtcNow.AddDays(15),
            TotalAmount = 500m,
            Items = new List<QuotationItem> { new() { Description = "Test Item", Quantity = 1, UnitPrice = 500, TotalAmount = 500 } }
        };
        _mockQuotationRepo.Setup(r => r.GetByIdForUpdateAsync(1, 1)).ReturnsAsync(q);
        _mockEmail
            .Setup(e => e.SendEmailAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<byte[]?>(), It.IsAny<string?>()))
            .ThrowsAsync(new InvalidOperationException("SMTP unavailable"));

        var result = await _service.SendQuotationAsync(1, 1, "user1");

        Assert.False(result.Success);
        Assert.Contains("SMTP unavailable", result.Message);
        Assert.Equal(QuotationStatus.Draft, q.Status);
        Assert.Empty(q.Communications);
        _mockQuotationRepo.Verify(r => r.UpdateAsync(It.IsAny<Quotation>()), Times.Never);
        _mockAudit.Verify(a => a.AddAsync(It.IsAny<AuditLog>(), default), Times.Never);
    }

    [Fact]
    public async Task SendQuotation_EmptyItems_Fails()
    {
        // Arrange
        var q = new Quotation 
        { 
            Id = 1, 
            TenantId = 1, 
            Status = QuotationStatus.Draft, 
            CustomerId = 100,
            ValidUntil = DateTime.UtcNow.AddDays(15),
            TotalAmount = 500m,
            Items = new List<QuotationItem>()
        };
        _mockQuotationRepo.Setup(r => r.GetByIdAsync(1, 1)).ReturnsAsync(q);

        // Act
        var result = await _service.SendQuotationAsync(1, 1, "user1");

        // Assert
        Assert.False(result.Success);
        Assert.Equal("EMPTY_ITEMS", result.ErrorCode);
    }

    [Fact]
    public async Task SendQuotation_ZeroTotal_Fails()
    {
        // Arrange
        var q = new Quotation 
        { 
            Id = 1, 
            TenantId = 1, 
            Status = QuotationStatus.Draft, 
            CustomerId = 100,
            ValidUntil = DateTime.UtcNow.AddDays(15),
            TotalAmount = 0m,
            Items = new List<QuotationItem> { new() { Description = "Item", Quantity = 1 } }
        };
        _mockQuotationRepo.Setup(r => r.GetByIdAsync(1, 1)).ReturnsAsync(q);

        // Act
        var result = await _service.SendQuotationAsync(1, 1, "user1");

        // Assert
        Assert.False(result.Success);
        Assert.Equal("INVALID_TOTAL", result.ErrorCode);
    }

    [Fact]
    public async Task SendQuotation_ExpiredValidity_Fails()
    {
        // Arrange
        var q = new Quotation 
        { 
            Id = 1, 
            TenantId = 1, 
            Status = QuotationStatus.Draft, 
            CustomerId = 100,
            ValidUntil = DateTime.UtcNow.AddDays(-2),
            TotalAmount = 500m,
            Items = new List<QuotationItem> { new() { Description = "Item", Quantity = 1, UnitPrice = 500, TotalAmount = 500 } }
        };
        _mockQuotationRepo.Setup(r => r.GetByIdAsync(1, 1)).ReturnsAsync(q);

        // Act
        var result = await _service.SendQuotationAsync(1, 1, "user1");

        // Assert
        Assert.False(result.Success);
        Assert.Equal("EXPIRED_VALIDITY", result.ErrorCode);
    }

    [Fact]
    public async Task ApproveQuotation_NotSent_Fails()
    {
        // Arrange
        var q = new Quotation { Id = 1, TenantId = 1, Status = QuotationStatus.Draft };
        _mockQuotationRepo.Setup(r => r.GetByIdAsync(1, 1)).ReturnsAsync(q);

        // Act
        var result = await _service.ApproveQuotationAsync(1, 1, "user1");

        // Assert
        Assert.False(result.Success);
        Assert.Equal("Only Sent quotes can be approved.", result.Message);
    }

    [Fact]
    public async Task ApproveQuotation_UnauthorizedRole_Fails()
    {
        // Act
        var result = await _service.ApproveQuotationAsync(1, 1, "user1", "Viewer");

        // Assert
        Assert.False(result.Success);
        Assert.Equal("FORBIDDEN", result.ErrorCode);
    }

    [Fact]
    public async Task ApproveQuotation_AuthorizedRole_Succeeds()
    {
        // Arrange
        var q = new Quotation { Id = 1, TenantId = 1, Status = QuotationStatus.Sent, CustomerId = 100 };
        _mockQuotationRepo.Setup(r => r.GetByIdForUpdateAsync(1, 1)).ReturnsAsync(q);
        _mockQuotationRepo.Setup(r => r.GetByIdAsync(1, 1)).ReturnsAsync(q);

        // Act
        var result = await _service.ApproveQuotationAsync(1, 1, "user1", "Manager");

        // Assert
        Assert.True(result.Success);
        Assert.Equal(QuotationStatus.Approved, q.Status);
    }

    [Fact]
    public async Task CancelQuotation_NoReason_Fails()
    {
        // Act
        var result = await _service.CancelQuotationAsync(1, 1, "", "user1");

        // Assert
        Assert.False(result.Success);
        Assert.Contains("mandatory", result.Message);
    }

    [Fact]
    public async Task CancelQuotation_AlreadyCancelled_Fails()
    {
        // Arrange
        var q = new Quotation { Id = 1, TenantId = 1, Status = QuotationStatus.Cancelled };
        _mockQuotationRepo.Setup(r => r.GetByIdAsync(1, 1)).ReturnsAsync(q);

        // Act
        var result = await _service.CancelQuotationAsync(1, 1, "Cancelled again", "user1");

        // Assert
        Assert.False(result.Success);
        Assert.Equal("ALREADY_CANCELLED", result.ErrorCode);
    }

    [Fact]
    public async Task CancelQuotation_Converted_Fails()
    {
        // Arrange
        var q = new Quotation { Id = 1, TenantId = 1, Status = QuotationStatus.Converted };
        _mockQuotationRepo.Setup(r => r.GetByIdAsync(1, 1)).ReturnsAsync(q);

        // Act
        var result = await _service.CancelQuotationAsync(1, 1, "Attempting cancel", "user1");

        // Assert
        Assert.False(result.Success);
        Assert.Contains("Converted quotes cannot be cancelled", result.Message);
    }

    [Fact]
    public async Task SendQuotation_WithPdfEngine_AttachesGeneratedQuotationPdfAndSendsHtmlEmail()
    {
        // Arrange
        var mockPdfEngine = new Mock<IQuotationPdfEngine>();
        var fakePdfBytes = System.Text.Encoding.ASCII.GetBytes("%PDF-1.4 Mock Quotation PDF Bytes");
        mockPdfEngine
            .Setup(e => e.GenerateQuotationPdf(It.IsAny<Quotation>(), It.IsAny<Tenant?>()))
            .Returns(fakePdfBytes);

        var serviceWithPdf = new QuotationActionService(
            _mockQuotationRepo.Object,
            _mockInvoiceRepo.Object,
            _mockUow.Object,
            _mockFinanceEngine.Object,
            _mockNumberGen.Object,
            _mockAudit.Object,
            _mockEmail.Object,
            outboxService: null,
            quotationPdfEngine: mockPdfEngine.Object
        );

        var q = new Quotation 
        { 
            Id = 1, 
            TenantId = 1, 
            Status = QuotationStatus.Draft, 
            CustomerId = 100,
            Customer = new Customer { Id = 100, Name = "Test Customer", Email = "customer@example.com", Currency = "INR" },
            ValidUntil = DateTime.UtcNow.AddDays(15),
            QuoteNumber = "QT-2026-10-0096",
            Subtotal = 54000m,
            DiscountAmount = 2700m,
            TaxAmount = 6156m,
            TotalAmount = 57456m,
            Items = new List<QuotationItem>
            {
                new() { Description = "sdhfnn", Quantity = 1, UnitPrice = 54000, TotalAmount = 57456 }
            }
        };
        _mockQuotationRepo.Setup(r => r.GetByIdForUpdateAsync(1, 1)).ReturnsAsync(q);

        // Act
        var result = await serviceWithPdf.SendQuotationAsync(1, 1, "user1");

        // Assert
        Assert.True(result.Success);
        Assert.Equal(QuotationStatus.Sent, q.Status);
        mockPdfEngine.Verify(e => e.GenerateQuotationPdf(q, It.IsAny<Tenant?>()), Times.Once);
        _mockEmail.Verify(e => e.SendEmailAsync(
            "customer@example.com",
            "Quotation QT-2026-10-0096",
            It.Is<string>(body => body.Contains("QT-2026-10-0096") && body.Contains("57456.00 INR")),
            fakePdfBytes,
            "QT-2026-10-0096.pdf"), Times.Once);
    }

    [Fact]
    public void QuestPdfQuotationEngine_ProducesValidPdfBinaryMatchingTemplate()
    {
        // Arrange
        var engine = new Billing.Infrastructure.Services.QuestPdfQuotationEngine();
        var q = new Quotation 
        { 
            Id = 96, 
            TenantId = 1, 
            Status = QuotationStatus.Draft, 
            CustomerId = 100,
            Customer = new Customer 
            { 
                Id = 100, 
                Name = "sudheep", 
                Email = "customer@example.com", 
                Phone = "+91 3457789987",
                Address = "Hyderabad, India",
                TaxId = "BNTPL4133c",
                Currency = "INR" 
            },
            ValidUntil = DateTime.UtcNow.AddDays(30),
            QuoteNumber = "QT-2026-10-0096",
            Subtotal = 54000m,
            DiscountAmount = 2700m,
            TaxAmount = 6156m,
            TotalAmount = 57456m,
            Items = new List<QuotationItem>
            {
                new() { Description = "sdhfnn", Quantity = 1, UnitPrice = 54000, DiscountAmount = 2700, TaxRate = 12, TaxAmount = 6156, TotalAmount = 57456 }
            }
        };
        var tenant = new Tenant
        {
            Id = 1,
            Name = "Acme STORE",
            CompanyEmail = "info@acmetech.com",
            Phone = "+91 9876543210",
            Address = "Hyderabad, Telangana",
            TaxId = "GSTIN12345"
        };

        // Act
        var pdfBytes = engine.GenerateQuotationPdf(q, tenant);

        // Assert
        Assert.NotNull(pdfBytes);
        Assert.True(pdfBytes.Length > 1000, "Quotation PDF bytes should be non-empty");
        var header = System.Text.Encoding.ASCII.GetString(pdfBytes.Take(5).ToArray());
        Assert.Equal("%PDF-", header);
    }
}

