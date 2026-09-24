using Billing.Application.Interfaces;
using Billing.Application.Services;
using Billing.Contracts;
using Billing.Contracts.Numbering;
using Billing.Domain.Entities;
using Billing.Domain.Enums;
using Moq;
using Xunit;

namespace Billing.Tests.Unit;

public class QuotationConversionTests
{
    private readonly Mock<IQuotationRepository> _mockQuotationRepo;
    private readonly Mock<IInvoiceRepository> _mockInvoiceRepo;
    private readonly Mock<IUnitOfWork> _mockUow;
    private readonly Mock<IFinancialCalculationEngine> _mockFinanceEngine;
    private readonly Mock<INumberGenerationService> _mockNumberGen;
    private readonly Mock<IAuditLogRepository> _mockAudit;
    
    private readonly QuotationActionService _service;

    public QuotationConversionTests()
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
    public async Task ConvertToInvoice_ValidApprovedQuotation_ConvertsAndCommitsTransaction()
    {
        // Arrange
        var q = new Quotation 
        { 
            Id = 1, TenantId = 1, Status = QuotationStatus.Approved, CustomerId = 100,
            Subtotal = 100, TaxAmount = 10, TotalAmount = 110,
            Items = new List<QuotationItem> { new QuotationItem { ProductId = 5, UnitPrice = 100, Quantity = 1, TotalAmount = 110 } }
        };
        
        _mockQuotationRepo.Setup(r => r.GetByIdForUpdateAsync(1, 1)).ReturnsAsync(q);
        
        var numResp = ApiResponse<GenerateNumberResponseDto>.Ok(new GenerateNumberResponseDto { GeneratedNumber = "INV-001" }, "Success");
        _mockNumberGen.Setup(n => n.GenerateNextNumberAsync(It.IsAny<GenerateNumberRequest>(), 1)).ReturnsAsync(numResp);

        var savedInvoice = new Invoice { Id = 500 };
        _mockInvoiceRepo.Setup(r => r.AddAsync(It.IsAny<Invoice>())).ReturnsAsync(savedInvoice);

        // Act
        var result = await _service.ConvertToInvoiceAsync(1, 1, "user1");

        // Assert
        Assert.True(result.Success);
        Assert.Equal(500, result.Data);
        Assert.Equal(QuotationStatus.Converted, q.Status);
        Assert.Equal(500, q.ConvertedInvoiceId);
        
        _mockUow.Verify(u => u.BeginTransactionAsync(), Times.Once);
        _mockInvoiceRepo.Verify(r => r.AddAsync(It.IsAny<Invoice>()), Times.Once);
        _mockQuotationRepo.Verify(r => r.UpdateAsync(q), Times.Once);
        _mockUow.Verify(u => u.CommitTransactionAsync(), Times.Once);
        _mockUow.Verify(u => u.RollbackTransactionAsync(), Times.Never);
    }

    [Fact]
    public async Task ConvertToInvoice_NotApproved_RollsBackTransaction()
    {
        // Arrange
        var q = new Quotation { Id = 1, TenantId = 1, Status = QuotationStatus.Sent };
        _mockQuotationRepo.Setup(r => r.GetByIdForUpdateAsync(1, 1)).ReturnsAsync(q);

        // Act
        var result = await _service.ConvertToInvoiceAsync(1, 1, "user1");

        // Assert
        Assert.False(result.Success);
        _mockUow.Verify(u => u.BeginTransactionAsync(), Times.Once);
        _mockUow.Verify(u => u.RollbackTransactionAsync(), Times.Once);
        _mockUow.Verify(u => u.CommitTransactionAsync(), Times.Never);
    }
}
