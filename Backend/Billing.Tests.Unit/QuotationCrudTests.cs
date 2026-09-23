using System.Security.Claims;
using Billing.API.Controllers;
using Billing.Application.Services;
using Billing.Contracts;
using Billing.Contracts.Quotation;
using Billing.Domain.Entities;
using Billing.Domain.Enums;
using Billing.Tests.Unit.Fakes;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Billing.Tests.Unit;

public class QuotationCrudTests
{
    private readonly FakeQuotationRepository _quotationRepo;
    private readonly FakeCustomerRepository _customerRepo;
    private readonly FakeNumberingRepository _numberingRepo;
    private readonly NumberGenerationService _numberGenerationService;
    private readonly QuotationService _quotationService;
    private readonly QuotationsController _controller;

    public QuotationCrudTests()
    {
        _quotationRepo = new FakeQuotationRepository();
        _customerRepo = new FakeCustomerRepository();
        _numberingRepo = new FakeNumberingRepository();

        // Seed customer for Tenant 1
        _customerRepo.Customers.Add(new Customer
        {
            Id = 10,
            TenantId = 1,
            Name = "Acme Corp",
            Email = "contact@acme.com",
            CustomerCode = "CUST-001"
        });

        // Seed customer for Tenant 2
        _customerRepo.Customers.Add(new Customer
        {
            Id = 20,
            TenantId = 2,
            Name = "Beta LLC",
            Email = "contact@beta.com",
            CustomerCode = "CUST-002"
        });

        _numberGenerationService = new NumberGenerationService(_numberingRepo);
        _quotationService = new QuotationService(_quotationRepo, _customerRepo, _numberGenerationService);
        _controller = new QuotationsController(_quotationService, NullLogger<QuotationsController>.Instance);

        SetUserContext(_controller, tenantId: 1);
    }

    private static void SetUserContext(ControllerBase controller, int tenantId, string role = "TenantAdmin", string email = "admin@tenant.com")
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, "1"),
            new(ClaimTypes.Email, email),
            new(ClaimTypes.Name, "Test User"),
            new(ClaimTypes.Role, role),
            new("TenantId", tenantId.ToString()),
            new("tenant_id", tenantId.ToString())
        };

        var identity = new ClaimsIdentity(claims, "TestAuth");
        var principal = new ClaimsPrincipal(identity);

        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = principal }
        };
    }

    [Fact]
    public async Task CreateDraftQuotation_ValidPayload_ReturnsCreatedAndSetsDraftStatus()
    {
        // Arrange
        var request = new CreateQuotationRequest
        {
            CustomerId = 10,
            QuoteNumber = "QT-2026-0001",
            QuotationDate = DateTime.UtcNow,
            ValidUntil = DateTime.UtcNow.AddDays(30),
            Reference = "REF-100",
            Items = new List<CreateQuotationItemRequest>
            {
                new()
                {
                    Description = "Product A",
                    Quantity = 2m,
                    UnitPrice = 500m,
                    DiscountType = "Percentage",
                    DiscountRate = 10m,
                    TaxRate = 18m
                }
            }
        };

        // Act
        var result = await _controller.CreateDraftQuotation(request);

        // Assert
        var created = Assert.IsType<CreatedAtActionResult>(result);
        var response = Assert.IsType<ApiResponse<QuotationDetailResponse>>(created.Value);
        Assert.True(response.Success);
        Assert.NotNull(response.Data);
        Assert.Equal("QT-2026-0001", response.Data.QuoteNumber);
        Assert.Equal("Draft", response.Data.Status);
        Assert.Equal(10, response.Data.CustomerId);

        // Financial Calculation assertions:
        // Gross = 2 * 500 = 1000. Discount 10% = 100. Taxable = 900. Tax 18% = 162. Total = 1062.
        Assert.Equal(1000m, response.Data.Subtotal);
        Assert.Equal(100m, response.Data.DiscountAmount);
        Assert.Equal(162m, response.Data.TaxAmount);
        Assert.Equal(1062m, response.Data.TotalAmount);
    }

    [Fact]
    public async Task CreateDraftQuotation_AutoGeneratesQuoteNumberWhenMissing()
    {
        // Arrange
        var request = new CreateQuotationRequest
        {
            CustomerId = 10,
            ValidUntil = DateTime.UtcNow.AddDays(15),
            Items = new List<CreateQuotationItemRequest>
            {
                new() { Description = "Consulting", Quantity = 1m, UnitPrice = 2000m }
            }
        };

        // Act
        var result = await _controller.CreateDraftQuotation(request);

        // Assert
        var created = Assert.IsType<CreatedAtActionResult>(result);
        var response = Assert.IsType<ApiResponse<QuotationDetailResponse>>(created.Value);
        Assert.True(response.Success);
        Assert.NotNull(response.Data);
        Assert.False(string.IsNullOrWhiteSpace(response.Data.QuoteNumber));
    }

    [Fact]
    public async Task CreateDraftQuotation_DuplicateQuoteNumber_ReturnsBadRequest()
    {
        // Arrange
        var quote = new Quotation
        {
            Id = 1,
            TenantId = 1,
            QuoteNumber = "QT-EXISTING-001",
            CustomerId = 10,
            Status = QuotationStatus.Draft
        };
        await _quotationRepo.AddAsync(quote);

        var request = new CreateQuotationRequest
        {
            CustomerId = 10,
            QuoteNumber = "QT-EXISTING-001",
            ValidUntil = DateTime.UtcNow.AddDays(10),
            Items = new List<CreateQuotationItemRequest>
            {
                new() { Description = "Item", Quantity = 1m, UnitPrice = 100m }
            }
        };

        // Act
        var result = await _controller.CreateDraftQuotation(request);

        // Assert
        var badRequest = Assert.IsType<BadRequestObjectResult>(result);
        var response = Assert.IsType<ApiResponse<QuotationDetailResponse>>(badRequest.Value);
        Assert.False(response.Success);
        Assert.Contains("already exists", response.Message);
    }

    [Fact]
    public async Task GetQuotationById_TenantIsolation_ReturnsNotFoundForDifferentTenant()
    {
        // Arrange - Quotation belongs to Tenant 2
        var quote = new Quotation
        {
            Id = 55,
            TenantId = 2,
            QuoteNumber = "QT-T2-001",
            CustomerId = 20,
            Status = QuotationStatus.Draft
        };
        await _quotationRepo.AddAsync(quote);

        // Act - Controller is authenticated as Tenant 1
        var result = await _controller.GetQuotationById(55);

        // Assert
        var notFound = Assert.IsType<NotFoundObjectResult>(result);
        var response = Assert.IsType<ApiResponse<QuotationDetailResponse>>(notFound.Value);
        Assert.False(response.Success);
        Assert.Contains("not found", response.Message);
    }

    [Fact]
    public async Task GetQuotationById_SameTenant_ReturnsOkWithDetailsAndSnapshot()
    {
        // Arrange
        var quote = new Quotation
        {
            Id = 99,
            TenantId = 1,
            QuoteNumber = "QT-T1-099",
            CustomerId = 10,
            Status = QuotationStatus.Draft,
            Subtotal = 1000m,
            TotalAmount = 1000m,
            Items = new List<QuotationItem>
            {
                new() { Id = 1, Description = "Item 1", Quantity = 1m, UnitPrice = 1000m, TotalAmount = 1000m }
            }
        };
        await _quotationRepo.AddAsync(quote);

        // Act
        var result = await _controller.GetQuotationById(99);

        // Assert
        var ok = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<ApiResponse<QuotationDetailResponse>>(ok.Value);
        Assert.True(response.Success);
        Assert.NotNull(response.Data);
        Assert.Equal(99, response.Data.Id);
        Assert.Single(response.Data.Items);
    }

    [Fact]
    public async Task GetPagedList_TenantIsolation_DoesNotLeakOtherTenantQuotations()
    {
        // Arrange
        await _quotationRepo.AddAsync(new Quotation { Id = 1, TenantId = 1, QuoteNumber = "QT-1", CustomerId = 10, QuotationDate = DateTime.UtcNow });
        await _quotationRepo.AddAsync(new Quotation { Id = 2, TenantId = 1, QuoteNumber = "QT-2", CustomerId = 10, QuotationDate = DateTime.UtcNow });
        await _quotationRepo.AddAsync(new Quotation { Id = 3, TenantId = 2, QuoteNumber = "QT-3-T2", CustomerId = 20, QuotationDate = DateTime.UtcNow });

        // Act - Controller is on Tenant 1
        var result = await _controller.GetQuotations(new QuotationListFilterRequest { PageNumber = 1, PageSize = 10 });

        // Assert
        var ok = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<ApiResponse<PagedResult<QuotationResponse>>>(ok.Value);
        Assert.True(response.Success);
        Assert.NotNull(response.Data);
        Assert.Equal(2, response.Data.TotalCount);
        Assert.All(response.Data.Items, item => Assert.Equal(1, item.TenantId));
    }

    [Fact]
    public async Task UpdateDraft_WhenInDraftStatus_UpdatesSuccessfullyAndBumpsRowVersion()
    {
        // Arrange
        var quote = new Quotation
        {
            Id = 101,
            TenantId = 1,
            QuoteNumber = "QT-UPDATE-101",
            CustomerId = 10,
            Status = QuotationStatus.Draft,
            RowVersion = DateTime.UtcNow.AddMinutes(-10),
            Subtotal = 500m,
            TotalAmount = 500m
        };
        await _quotationRepo.AddAsync(quote);

        var initialTicks = quote.RowVersion.Ticks;

        var updateRequest = new UpdateQuotationRequest
        {
            CustomerId = 10,
            QuotationDate = DateTime.UtcNow,
            ValidUntil = DateTime.UtcNow.AddDays(20),
            Reference = "NEW-REF",
            RowVersion = Convert.ToBase64String(BitConverter.GetBytes(initialTicks)),
            Items = new List<CreateQuotationItemRequest>
            {
                new() { Description = "Updated Item", Quantity = 3m, UnitPrice = 200m }
            }
        };

        // Act
        var result = await _controller.UpdateDraftQuotation(101, updateRequest);

        // Assert
        var ok = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<ApiResponse<QuotationDetailResponse>>(ok.Value);
        Assert.True(response.Success);
        Assert.NotNull(response.Data);
        Assert.Equal(600m, response.Data.Subtotal);
        Assert.Equal(600m, response.Data.TotalAmount);
        Assert.NotEqual(initialTicks, quote.RowVersion.Ticks);
    }

    [Theory]
    [InlineData(QuotationStatus.Sent)]
    [InlineData(QuotationStatus.Approved)]
    [InlineData(QuotationStatus.Converted)]
    [InlineData(QuotationStatus.Cancelled)]
    public async Task UpdateDraft_WhenStatusIsNotDraft_ReturnsBadRequestDraftImmutability(QuotationStatus status)
    {
        // Arrange
        var quote = new Quotation
        {
            Id = 200 + (int)status,
            TenantId = 1,
            QuoteNumber = $"QT-IMMUTABLE-{status}",
            CustomerId = 10,
            Status = status,
            RowVersion = DateTime.UtcNow
        };
        await _quotationRepo.AddAsync(quote);

        var updateRequest = new UpdateQuotationRequest
        {
            CustomerId = 10,
            QuotationDate = DateTime.UtcNow,
            ValidUntil = DateTime.UtcNow.AddDays(10),
            Items = new List<CreateQuotationItemRequest>
            {
                new() { Description = "Tampered Item", Quantity = 1m, UnitPrice = 100m }
            }
        };

        // Act
        var result = await _controller.UpdateDraftQuotation(quote.Id, updateRequest);

        // Assert
        var badRequest = Assert.IsType<BadRequestObjectResult>(result);
        var response = Assert.IsType<ApiResponse<QuotationDetailResponse>>(badRequest.Value);
        Assert.False(response.Success);
        Assert.Equal("INVALID_STATUS", response.ErrorCode);
        Assert.Contains("Only Draft quotations can be edited", response.Message);
    }

    [Fact]
    public async Task UpdateDraft_WithMismatchedRowVersion_ReturnsConflict()
    {
        // Arrange
        var quote = new Quotation
        {
            Id = 301,
            TenantId = 1,
            QuoteNumber = "QT-CONCURRENCY-301",
            CustomerId = 10,
            Status = QuotationStatus.Draft,
            RowVersion = DateTime.UtcNow
        };
        await _quotationRepo.AddAsync(quote);

        var staleRowVersion = Convert.ToBase64String(BitConverter.GetBytes(DateTime.UtcNow.AddMinutes(-5).Ticks));

        var updateRequest = new UpdateQuotationRequest
        {
            CustomerId = 10,
            QuotationDate = DateTime.UtcNow,
            ValidUntil = DateTime.UtcNow.AddDays(10),
            RowVersion = staleRowVersion,
            Items = new List<CreateQuotationItemRequest>
            {
                new() { Description = "Concurrent Item", Quantity = 1m, UnitPrice = 100m }
            }
        };

        // Act
        var result = await _controller.UpdateDraftQuotation(301, updateRequest);

        // Assert
        var conflict = Assert.IsType<ConflictObjectResult>(result);
        var response = Assert.IsType<ApiResponse<QuotationDetailResponse>>(conflict.Value);
        Assert.False(response.Success);
        Assert.Equal("CONCURRENCY_CONFLICT", response.ErrorCode);
    }
}
