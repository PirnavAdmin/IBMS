using Billing.Application.Services;
using Billing.Contracts;
using Billing.Domain.Entities;
using Billing.Tests.Unit.Fakes;

namespace Billing.Tests.Unit;

public class CustomerServiceTests
{
    private readonly FakeCustomerRepository _fakeRepo;
    private readonly CustomerService _service;

    public CustomerServiceTests()
    {
        _fakeRepo = new FakeCustomerRepository();
        _service = new CustomerService(_fakeRepo);
    }

    #region IBMSBE-001: POST Create Customer Tests

    [Fact]
    public async Task CreateCustomer_WithValidData_ReturnsSuccessAndDto()
    {
        // Arrange
        var request = new CreateCustomerRequest
        {
            Name = "Acme Corporation",
            Email = "billing@acme.com",
            Phone = "+1234567890",
            CompanyName = "Acme Corp Ltd",
            TaxId = "TAX-998877",
            Address = "123 Business St",
            City = "Metropolis",
            State = "NY",
            PostalCode = "10001",
            Country = "USA",
            Currency = "USD",
            PaymentTerms = "Net 30"
        };

        // Act
        var response = await _service.CreateCustomerAsync(request, tenantId: 1);

        // Assert
        Assert.True(response.Success);
        Assert.NotNull(response.Data);
        Assert.Equal("Acme Corporation", response.Data.Name);
        Assert.Equal("billing@acme.com", response.Data.Email);
        Assert.Equal(1, response.Data.TenantId);
        Assert.True(response.Data.IsActive);
        Assert.Single(_fakeRepo.Customers);
    }

    [Theory]
    [InlineData("")]
    [InlineData(" ")]
    [InlineData("A")]
    public async Task CreateCustomer_WithInvalidName_ReturnsValidationFailure(string invalidName)
    {
        // Arrange
        var request = new CreateCustomerRequest
        {
            Name = invalidName,
            Email = "test@example.com"
        };

        // Act
        var response = await _service.CreateCustomerAsync(request, tenantId: 1);

        // Assert
        Assert.False(response.Success);
        Assert.NotNull(response.Errors);
        Assert.Contains(response.Errors, e => e.Contains("name", StringComparison.OrdinalIgnoreCase));
    }

    [Theory]
    [InlineData("")]
    [InlineData("invalid-email")]
    [InlineData("@missingusername.com")]
    [InlineData("missingdomain@")]
    public async Task CreateCustomer_WithInvalidEmail_ReturnsValidationFailure(string invalidEmail)
    {
        // Arrange
        var request = new CreateCustomerRequest
        {
            Name = "Valid Name",
            Email = invalidEmail
        };

        // Act
        var response = await _service.CreateCustomerAsync(request, tenantId: 1);

        // Assert
        Assert.False(response.Success);
        Assert.NotNull(response.Errors);
        Assert.Contains(response.Errors, e => e.Contains("email", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task CreateCustomer_WithDuplicateEmailInSameTenant_ReturnsFailure()
    {
        // Arrange
        _fakeRepo.Customers.Add(new Customer
        {
            Id = 1,
            TenantId = 1,
            Name = "Existing Customer",
            Email = "duplicate@company.com"
        });

        var request = new CreateCustomerRequest
        {
            Name = "New Customer",
            Email = "duplicate@company.com"
        };

        // Act
        var response = await _service.CreateCustomerAsync(request, tenantId: 1);

        // Assert
        Assert.False(response.Success);
        Assert.Contains("already exists", response.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task CreateCustomer_WithSameEmailInDifferentTenant_Succeeds()
    {
        // Arrange
        _fakeRepo.Customers.Add(new Customer
        {
            Id = 1,
            TenantId = 1,
            Name = "Existing Customer Tenant 1",
            Email = "common@client.com"
        });

        var request = new CreateCustomerRequest
        {
            Name = "Customer Tenant 2",
            Email = "common@client.com"
        };

        // Act
        var response = await _service.CreateCustomerAsync(request, tenantId: 2);

        // Assert
        Assert.True(response.Success);
        Assert.Equal(2, response.Data!.TenantId);
        Assert.Equal(2, _fakeRepo.Customers.Count);
    }

    #endregion

    #region IBMSBE-002: GET Customer List Tests

    [Fact]
    public async Task GetCustomers_WithPaginationAndSearch_ReturnsFilteredResult()
    {
        // Arrange
        for (var i = 1; i <= 15; i++)
        {
            _fakeRepo.Customers.Add(new Customer
            {
                Id = i,
                TenantId = 1,
                Name = $"Customer {i:D2}",
                Email = $"cust{i:D2}@test.com",
                CompanyName = i % 2 == 0 ? "Tech Corp" : "Retail Inc",
                IsActive = i % 3 != 0,
                CreatedAtUtc = DateTime.UtcNow.AddDays(-i)
            });
        }

        var query = new CustomerQueryParameters
        {
            PageNumber = 1,
            PageSize = 5,
            Search = "Tech Corp",
            SortBy = "name",
            SortOrder = "asc"
        };

        // Act
        var response = await _service.GetCustomersAsync(query, tenantId: 1);

        // Assert
        Assert.True(response.Success);
        Assert.NotNull(response.Data);
        Assert.Equal(7, response.Data.TotalCount); // 7 even numbers between 1 and 15
        Assert.Equal(5, response.Data.Items.Count);
        Assert.Equal(2, response.Data.TotalPages);
        Assert.True(response.Data.HasNextPage);
        Assert.False(response.Data.HasPreviousPage);
    }

    [Fact]
    public async Task GetCustomers_WithIsActiveFilter_FiltersByStatus()
    {
        // Arrange
        _fakeRepo.Customers.Add(new Customer { Id = 1, TenantId = 1, Name = "Active Client", Email = "active@test.com", IsActive = true });
        _fakeRepo.Customers.Add(new Customer { Id = 2, TenantId = 1, Name = "Inactive Client", Email = "inactive@test.com", IsActive = false });

        var query = new CustomerQueryParameters { IsActive = false };

        // Act
        var response = await _service.GetCustomersAsync(query, tenantId: 1);

        // Assert
        Assert.True(response.Success);
        Assert.Single(response.Data!.Items);
        Assert.Equal("Inactive Client", response.Data.Items[0].Name);
    }

    [Fact]
    public async Task GetCustomers_IsolateByTenant_DoesNotExposeOtherTenants()
    {
        // Arrange
        _fakeRepo.Customers.Add(new Customer { Id = 1, TenantId = 1, Name = "Tenant 1 Customer", Email = "t1@test.com" });
        _fakeRepo.Customers.Add(new Customer { Id = 2, TenantId = 2, Name = "Tenant 2 Customer", Email = "t2@test.com" });

        var query = new CustomerQueryParameters();

        // Act
        var response = await _service.GetCustomersAsync(query, tenantId: 1);

        // Assert
        Assert.True(response.Success);
        Assert.Single(response.Data!.Items);
        Assert.Equal("Tenant 1 Customer", response.Data.Items[0].Name);
    }

    #endregion

    #region IBMSBE-003: GET Customer Details Tests

    [Fact]
    public async Task GetCustomerById_WhenCustomerExists_ReturnsCompleteProfile()
    {
        // Arrange
        var customer = new Customer
        {
            Id = 42,
            TenantId = 1,
            Name = "Full Profile Customer",
            Email = "full@profile.com",
            Phone = "+15551234",
            CompanyName = "Full Corp",
            TaxId = "TAX-42",
            Address = "42 Galaxy Way",
            City = "Sector 7",
            State = "California",
            PostalCode = "90210",
            Country = "USA",
            Website = "https://galaxy.com",
            Notes = "VIP Customer",
            Currency = "EUR",
            PaymentTerms = "Net 15",
            IsActive = true,
            CreatedAtUtc = DateTime.UtcNow
        };
        _fakeRepo.Customers.Add(customer);

        // Act
        var response = await _service.GetCustomerByIdAsync(42, tenantId: 1);

        // Assert
        Assert.True(response.Success);
        Assert.NotNull(response.Data);
        Assert.Equal(42, response.Data.Id);
        Assert.Equal("Full Profile Customer", response.Data.Name);
        Assert.Equal("full@profile.com", response.Data.Email);
        Assert.Equal("+15551234", response.Data.Phone);
        Assert.Equal("Full Corp", response.Data.CompanyName);
        Assert.Equal("EUR", response.Data.Currency);
        Assert.Equal("VIP Customer", response.Data.Notes);
    }

    [Fact]
    public async Task GetCustomerById_WhenCustomerNotFound_ReturnsFailure()
    {
        // Act
        var response = await _service.GetCustomerByIdAsync(999, tenantId: 1);

        // Assert
        Assert.False(response.Success);
        Assert.Equal("Customer not found", response.Message);
    }

    [Fact]
    public async Task GetCustomerById_WhenInDifferentTenant_ReturnsNotFound()
    {
        // Arrange
        _fakeRepo.Customers.Add(new Customer
        {
            Id = 10,
            TenantId = 2,
            Name = "Tenant 2 Client",
            Email = "t2@example.com"
        });

        // Act
        var response = await _service.GetCustomerByIdAsync(10, tenantId: 1);

        // Assert
        Assert.False(response.Success);
        Assert.Equal("Customer not found", response.Message);
    }

    #endregion

    #region IBMSBE-004: PUT Customer Tests

    [Fact]
    public async Task UpdateCustomer_WithValidData_UpdatesCustomerAndReturnsDto()
    {
        // Arrange
        _fakeRepo.Customers.Add(new Customer
        {
            Id = 5,
            TenantId = 1,
            Name = "Old Name",
            Email = "old@example.com",
            Phone = "12345",
            IsActive = true
        });

        var request = new UpdateCustomerRequest
        {
            Name = "Updated Name",
            Email = "updated@example.com",
            Phone = "+9876543210",
            City = "New York",
            IsActive = false,
            PaymentTerms = "Due on Receipt"
        };

        // Act
        var response = await _service.UpdateCustomerAsync(5, request, tenantId: 1);

        // Assert
        Assert.True(response.Success);
        Assert.NotNull(response.Data);
        Assert.Equal("Updated Name", response.Data.Name);
        Assert.Equal("updated@example.com", response.Data.Email);
        Assert.Equal("+9876543210", response.Data.Phone);
        Assert.Equal("New York", response.Data.City);
        Assert.False(response.Data.IsActive);
        Assert.NotNull(response.Data.UpdatedAtUtc);
    }

    [Fact]
    public async Task UpdateCustomer_WhenCustomerNotFound_ReturnsNotFound()
    {
        // Arrange
        var request = new UpdateCustomerRequest
        {
            Name = "Non-existent",
            Email = "nonexistent@example.com"
        };

        // Act
        var response = await _service.UpdateCustomerAsync(999, request, tenantId: 1);

        // Assert
        Assert.False(response.Success);
        Assert.Equal("Customer not found", response.Message);
    }

    [Fact]
    public async Task UpdateCustomer_WithDuplicateEmailOfAnotherCustomer_ReturnsConflict()
    {
        // Arrange
        _fakeRepo.Customers.Add(new Customer { Id = 1, TenantId = 1, Name = "Client One", Email = "one@test.com" });
        _fakeRepo.Customers.Add(new Customer { Id = 2, TenantId = 1, Name = "Client Two", Email = "two@test.com" });

        var request = new UpdateCustomerRequest
        {
            Name = "Client Two Renamed",
            Email = "one@test.com" // Conflicts with Client One
        };

        // Act
        var response = await _service.UpdateCustomerAsync(2, request, tenantId: 1);

        // Assert
        Assert.False(response.Success);
        Assert.Equal("Email conflict", response.Message);
    }

    [Fact]
    public async Task UpdateCustomer_KeepingSameEmail_SucceedsWithoutConflict()
    {
        // Arrange
        _fakeRepo.Customers.Add(new Customer { Id = 1, TenantId = 1, Name = "Client One", Email = "one@test.com" });

        var request = new UpdateCustomerRequest
        {
            Name = "Client One Modified",
            Email = "one@test.com"
        };

        // Act
        var response = await _service.UpdateCustomerAsync(1, request, tenantId: 1);

        // Assert
        Assert.True(response.Success);
        Assert.Equal("Client One Modified", response.Data!.Name);
    }

    #endregion

    #region IBMSBE-005 to IBMSBE-008: Database, Addresses, and Concurrency Tests

    [Fact]
    public async Task CreateCustomer_GeneratesCustomerCode_WhenNotProvided()
    {
        // Arrange
        var request = new CreateCustomerRequest
        {
            Name = "Auto Code Customer",
            Email = "autocode@example.com"
        };

        // Act
        var response = await _service.CreateCustomerAsync(request, tenantId: 1);

        // Assert
        Assert.True(response.Success);
        Assert.NotNull(response.Data);
        Assert.StartsWith("CUST-", response.Data.CustomerCode);
    }

    [Fact]
    public async Task CreateCustomer_WithDuplicateCodeInSameTenant_Fails()
    {
        // Arrange
        _fakeRepo.Customers.Add(new Customer
        {
            Id = 1,
            TenantId = 1,
            CustomerCode = "CUST-DUPLICATE",
            Name = "Existing Customer",
            Email = "existing@example.com"
        });

        var request = new CreateCustomerRequest
        {
            Name = "New Customer",
            Email = "new@example.com",
            CustomerCode = "CUST-DUPLICATE"
        };

        // Act
        var response = await _service.CreateCustomerAsync(request, tenantId: 1);

        // Assert
        Assert.False(response.Success);
        Assert.Equal("Customer code conflict", response.Message);
    }

    [Fact]
    public async Task CreateCustomer_WithBillingAndShippingAddresses_SavesBothAddresses()
    {
        // Arrange
        var request = new CreateCustomerRequest
        {
            Name = "Multi Address Customer",
            Email = "multiaddr@example.com",
            Addresses = new List<CustomerAddressDto>
            {
                new() { AddressType = "Billing", AddressLine1 = "100 Finance St", City = "New York", Country = "USA", IsDefault = true },
                new() { AddressType = "Shipping", AddressLine1 = "200 Warehouse Blvd", City = "Newark", Country = "USA", IsDefault = false }
            }
        };

        // Act
        var response = await _service.CreateCustomerAsync(request, tenantId: 1);

        // Assert
        Assert.True(response.Success);
        Assert.NotNull(response.Data);
        Assert.Equal(2, response.Data.Addresses.Count);
        Assert.Contains(response.Data.Addresses, a => a.AddressType == "Billing" && a.City == "New York");
        Assert.Contains(response.Data.Addresses, a => a.AddressType == "Shipping" && a.City == "Newark");
    }

    [Fact]
    public async Task UpdateCustomer_WithConcurrencyMismatch_ReturnsConcurrencyConflict()
    {
        // Arrange
        var originalTimestamp = new DateTime(2026, 9, 8, 12, 0, 0, DateTimeKind.Utc);
        var modifiedTimestamp = new DateTime(2026, 9, 8, 12, 30, 0, DateTimeKind.Utc);

        _fakeRepo.Customers.Add(new Customer
        {
            Id = 10,
            TenantId = 1,
            CustomerCode = "CUST-1000",
            Name = "Concurrency Customer",
            Email = "concurrent@example.com",
            RowVersion = modifiedTimestamp // DB has been updated by another transaction
        });

        var request = new UpdateCustomerRequest
        {
            Name = "Stale Update",
            Email = "concurrent@example.com",
            RowVersion = originalTimestamp // Caller holds stale timestamp
        };

        // Act
        var response = await _service.UpdateCustomerAsync(10, request, tenantId: 1);

        // Assert
        Assert.False(response.Success);
        Assert.Equal("Concurrency conflict", response.Message);
    }

    [Fact]
    public async Task GetCustomers_SearchByCustomerCode_ReturnsMatchedCustomer()
    {
        // Arrange
        _fakeRepo.Customers.Add(new Customer
        {
            Id = 1,
            TenantId = 1,
            CustomerCode = "CUST-TARGET",
            Name = "Specific Client",
            Email = "target@example.com"
        });
        _fakeRepo.Customers.Add(new Customer
        {
            Id = 2,
            TenantId = 1,
            CustomerCode = "CUST-OTHER",
            Name = "Other Client",
            Email = "other@example.com"
        });

        var query = new CustomerQueryParameters { Search = "CUST-TARGET" };

        // Act
        var response = await _service.GetCustomersAsync(query, tenantId: 1);

        // Assert
        Assert.True(response.Success);
        Assert.Single(response.Data!.Items);
        Assert.Equal("CUST-TARGET", response.Data.Items[0].CustomerCode);
    }

    #endregion
}
