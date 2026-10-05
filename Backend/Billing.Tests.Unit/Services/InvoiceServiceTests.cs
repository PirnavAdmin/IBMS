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
}


