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
    
    private readonly QuotationActionService _service;

    public QuotationLifecycleTests()
    {
        _mockQuotationRepo = new Mock<IQuotationRepository>();
        _mockInvoiceRepo = new Mock<IInvoiceRepository>();
        _mockUow = new Mock<IUnitOfWork>();
        _mockFinanceEngine = new Mock<IFinancialCalculationEngine>();
        _mockNumberGen = new Mock<INumberGenerationService>();
        _mockAudit = new Mock<IAuditLogRepository>();

        _service = new QuotationActionService(
            _mockQuotationRepo.Object,
            _mockInvoiceRepo.Object,
            _mockUow.Object,
            _mockFinanceEngine.Object,
            _mockNumberGen.Object,
            _mockAudit.Object
        );
    }

    [Fact]
    public async Task SendQuotation_ValidDraft_TransitionsToSent()
    {
        // Arrange
        var q = new Quotation { Id = 1, TenantId = 1, Status = QuotationStatus.Draft, CustomerId = 100 };
        _mockQuotationRepo.Setup(r => r.GetByIdAsync(1, 1)).ReturnsAsync(q);

        // Act
        var result = await _service.SendQuotationAsync(1, 1, "user1");

        // Assert
        Assert.True(result.Success);
        Assert.Equal(QuotationStatus.Sent, q.Status);
        _mockQuotationRepo.Verify(r => r.UpdateAsync(q), Times.Once);
        _mockAudit.Verify(a => a.AddAsync(It.IsAny<AuditLog>(), default), Times.Once);
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
    public async Task CancelQuotation_NoReason_Fails()
    {
        // Act
        var result = await _service.CancelQuotationAsync(1, 1, "", "user1");

        // Assert
        Assert.False(result.Success);
        Assert.Contains("mandatory", result.Message);
    }
}
