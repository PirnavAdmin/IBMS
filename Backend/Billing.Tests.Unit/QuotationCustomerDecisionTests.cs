using Billing.Application.Interfaces;
using Billing.Application.Services;
using Billing.Contracts.Quotation;
using Billing.Domain.Entities;
using Billing.Domain.Enums;
using Moq;
using Xunit;

namespace Billing.Tests.Unit;

public class QuotationCustomerDecisionTests
{
    private readonly Mock<IQuotationRepository> _mockQuotationRepo = new();
    private readonly Mock<IInvoiceRepository> _mockInvoiceRepo = new();
    private readonly Mock<IUnitOfWork> _mockUnitOfWork = new();
    private readonly Mock<IFinancialCalculationEngine> _mockFinancialEngine = new();
    private readonly Mock<INumberGenerationService> _mockNumberService = new();
    private readonly Mock<IAuditLogRepository> _mockAuditRepo = new();
    private readonly Mock<IEmailService> _mockEmail = new();
    private readonly Mock<IOutboxService> _mockOutbox = new();
    private readonly Mock<ITenantRepository> _mockTenantRepo = new();
    private readonly Mock<IInAppNotificationService> _mockInAppNotif = new();
    private readonly QuotationActionService _service;

    public QuotationCustomerDecisionTests()
    {
        _service = new QuotationActionService(
            _mockQuotationRepo.Object,
            _mockInvoiceRepo.Object,
            _mockUnitOfWork.Object,
            _mockFinancialEngine.Object,
            _mockNumberService.Object,
            _mockAuditRepo.Object,
            _mockEmail.Object,
            _mockOutbox.Object,
            null,
            _mockTenantRepo.Object,
            null,
            null,
            _mockInAppNotif.Object);
    }

    [Fact]
    public async Task ProcessCustomerDecision_Approve_MarksQuotationApproved_AndSetsDecision()
    {
        // Arrange
        const string token = "token123";
        var q = new Quotation
        {
            Id = 10,
            TenantId = 1,
            Status = QuotationStatus.Sent,
            QuoteNumber = "QT-100",
            PublicActionToken = token,
            CustomerId = 200,
            Customer = new Customer { Id = 200, Name = "Alice", Email = "alice@example.com", Currency = "INR" },
            TotalAmount = 1500m
        };

        _mockQuotationRepo.Setup(r => r.GetByPublicActionTokenAsync(token, 1)).ReturnsAsync(q);
        _mockTenantRepo.Setup(r => r.GetByIdAsync(1)).ReturnsAsync(new Tenant { Id = 1, Name = "Test Company" });

        // Act
        var result = await _service.ProcessCustomerDecisionAsync(token, "approve", 1);

        // Assert
        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.False(result.Data.IsAlreadyRecorded);
        Assert.Equal("Approved", result.Data.Decision);
        Assert.Equal(QuotationStatus.Approved, q.Status);
        Assert.Equal("Approved", q.CustomerDecision);
        Assert.NotNull(q.CustomerRespondedAtUtc);

        _mockQuotationRepo.Verify(r => r.UpdateAsync(q), Times.Once);
        _mockAuditRepo.Verify(a => a.AddAsync(It.Is<AuditLog>(l => l.Action == "Approved"), default), Times.Once);
    }

    [Fact]
    public async Task ProcessCustomerDecision_Decline_MarksQuotationCancelled_AndSetsDecision()
    {
        // Arrange
        const string token = "token456";
        var q = new Quotation
        {
            Id = 20,
            TenantId = 1,
            Status = QuotationStatus.Sent,
            QuoteNumber = "QT-200",
            PublicActionToken = token,
            CustomerId = 200,
            Customer = new Customer { Id = 200, Name = "Bob", Email = "bob@example.com", Currency = "INR" },
            TotalAmount = 2500m
        };

        _mockQuotationRepo.Setup(r => r.GetByPublicActionTokenAsync(token, 1)).ReturnsAsync(q);
        _mockTenantRepo.Setup(r => r.GetByIdAsync(1)).ReturnsAsync(new Tenant { Id = 1, Name = "Test Company" });

        // Act
        var result = await _service.ProcessCustomerDecisionAsync(token, "decline", 1);

        // Assert
        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.False(result.Data.IsAlreadyRecorded);
        Assert.Equal("Declined", result.Data.Decision);
        Assert.Equal(QuotationStatus.Cancelled, q.Status);
        Assert.Equal("Declined", q.CustomerDecision);
        Assert.NotNull(q.CustomerRespondedAtUtc);
        Assert.Contains("Declined by customer", q.Notes);

        _mockQuotationRepo.Verify(r => r.UpdateAsync(q), Times.Once);
    }

    [Fact]
    public async Task ProcessCustomerDecision_SecondClick_IsSingleUseLocked_DoesNotChangeStatus()
    {
        // Arrange - quotation already approved
        const string token = "token789";
        var initialRespondedAt = DateTime.UtcNow.AddMinutes(-10);
        var q = new Quotation
        {
            Id = 30,
            TenantId = 1,
            Status = QuotationStatus.Approved,
            QuoteNumber = "QT-300",
            PublicActionToken = token,
            CustomerId = 300,
            Customer = new Customer { Id = 300, Name = "Charlie", Email = "charlie@example.com", Currency = "INR" },
            TotalAmount = 3000m,
            CustomerDecision = "Approved",
            CustomerRespondedAtUtc = initialRespondedAt
        };

        _mockQuotationRepo.Setup(r => r.GetByPublicActionTokenAsync(token, 1)).ReturnsAsync(q);
        _mockTenantRepo.Setup(r => r.GetByIdAsync(1)).ReturnsAsync(new Tenant { Id = 1, Name = "Test Company" });

        // Act - Customer clicks "decline" button after having already approved
        var result = await _service.ProcessCustomerDecisionAsync(token, "decline", 1);

        // Assert
        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.True(result.Data.IsAlreadyRecorded); // LOCKED
        Assert.Equal("Approved", result.Data.Decision); // Preserves first decision
        Assert.Equal(QuotationStatus.Approved, q.Status); // Status must NOT change to Cancelled!
        Assert.Equal(initialRespondedAt, q.CustomerRespondedAtUtc);

        // UpdateAsync must NOT have been called on second click!
        _mockQuotationRepo.Verify(r => r.UpdateAsync(It.IsAny<Quotation>()), Times.Never);
    }

    [Fact]
    public async Task ProcessCustomerDecision_InvalidToken_Fails()
    {
        // Arrange
        _mockQuotationRepo.Setup(r => r.GetByPublicActionTokenAsync("invalid", 1)).ReturnsAsync((Quotation?)null);

        // Act
        var result = await _service.ProcessCustomerDecisionAsync("invalid", "approve", 1);

        // Assert
        Assert.False(result.Success);
        Assert.Equal("NOT_FOUND", result.ErrorCode);
    }
}
