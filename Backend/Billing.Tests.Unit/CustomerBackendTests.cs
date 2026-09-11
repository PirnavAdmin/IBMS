using Billing.Application.Interfaces;
using Billing.Application.Services;
using Billing.Contracts;
using Billing.Domain.Entities;
using Billing.Tests.Unit.Fakes;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Billing.Tests.Unit;

/// <summary>
/// Phase 3 - Task 4 (IBMSBE-Test-01): Backend Tests
/// Acceptance Criteria: Test CRUD, duplicate code, tenant isolation, filters, pagination, deactivation, audit and concurrency.
/// </summary>
public class CustomerBackendTests
{
    private readonly FakeCustomerRepository _customerRepo;
    private readonly CustomerService _customerService;
    private readonly FakeAuditLogRepository _auditRepo;
    private readonly AuditService _auditService;

    public CustomerBackendTests()
    {
        _customerRepo = new FakeCustomerRepository();
        _customerService = new CustomerService(_customerRepo);
        _auditRepo = new FakeAuditLogRepository();
        _auditService = new AuditService(_auditRepo, NullLogger<AuditService>.Instance);
    }

    private class FakeAuditLogRepository : IAuditLogRepository
    {
        public List<AuditLog> Logs { get; } = new();

        public Task AddAsync(AuditLog log, CancellationToken cancellationToken = default)
        {
            log.Id = Logs.Count + 1;
            Logs.Add(log);
            return Task.CompletedTask;
        }

        public Task<List<AuditLog>> GetByCustomerIdAsync(int tenantId, int customerId, CancellationToken cancellationToken = default)
        {
            return Task.FromResult(Logs.Where(l => l.TenantId == tenantId && l.CustomerId == customerId).ToList());
        }

        public Task<List<AuditLog>> GetByEntityAsync(int tenantId, string entityName, string entityId, CancellationToken cancellationToken = default)
        {
            return Task.FromResult(Logs.Where(l => l.TenantId == tenantId && l.EntityName == entityName && l.EntityId == entityId).ToList());
        }

        public Task<(List<AuditLog> Items, int TotalCount)> GetPagedAsync(int tenantId, int page, int pageSize, CancellationToken cancellationToken = default)
        {
            var filtered = Logs.Where(l => l.TenantId == tenantId).ToList();
            return Task.FromResult((filtered.Skip((page - 1) * pageSize).Take(pageSize).ToList(), filtered.Count));
        }
    }

    #region 1. CRUD Operations

    [Fact]
    public async Task Crud_CompleteLifecycle_CreateReadUpdateDeactivate()
    {
        // 1. CREATE
        var createReq = new CreateCustomerRequest
        {
            CustomerCode = "CUST-CRUD-01",
            Name = "John Doe Enterprises",
            Email = "john@enterprise.com",
            Phone = "+1234567890",
            CompanyName = "Enterprise Inc",
            TaxId = "TAX-12345",
            Address = "100 Main St",
            City = "Dallas",
            State = "TX",
            PostalCode = "75001",
            Country = "USA",
            Currency = "USD",
            PaymentTerms = "Net 30"
        };

        var createRes = await _customerService.CreateCustomerAsync(createReq, tenantId: 1);
        Assert.True(createRes.Success);
        Assert.NotNull(createRes.Data);
        var customerId = createRes.Data.Id;
        Assert.True(customerId > 0);
        Assert.Equal("CUST-CRUD-01", createRes.Data.CustomerCode);
        Assert.True(createRes.Data.IsActive);

        // 2. READ (GetById)
        var readRes = await _customerService.GetCustomerByIdAsync(customerId, tenantId: 1);
        Assert.True(readRes.Success);
        Assert.Equal("John Doe Enterprises", readRes.Data!.Name);
        Assert.Equal("Dallas", readRes.Data.City);

        // 3. UPDATE
        var updateReq = new UpdateCustomerRequest
        {
            Name = "John Doe Enterprises Global",
            Email = "john.updated@enterprise.com",
            City = "Austin",
            PaymentTerms = "Net 60"
        };

        var updateRes = await _customerService.UpdateCustomerAsync(customerId, updateReq, tenantId: 1);
        Assert.True(updateRes.Success);
        Assert.Equal("John Doe Enterprises Global", updateRes.Data!.Name);
        Assert.Equal("Austin", updateRes.Data.City);
        Assert.Equal("Net 60", updateRes.Data.PaymentTerms);

        // 4. DEACTIVATE (Soft-Delete)
        var deactivateReq = new UpdateCustomerRequest
        {
            Name = "John Doe Enterprises Global",
            Email = "john.updated@enterprise.com",
            IsActive = false
        };

        var deactRes = await _customerService.UpdateCustomerAsync(customerId, deactivateReq, tenantId: 1);
        Assert.True(deactRes.Success);
        Assert.False(deactRes.Data!.IsActive);

        // Verify still exists in DB as inactive
        var finalRead = await _customerService.GetCustomerByIdAsync(customerId, tenantId: 1);
        Assert.True(finalRead.Success);
        Assert.False(finalRead.Data!.IsActive);
    }

    #endregion

    #region 2. Duplicate Code Enforcement

    [Fact]
    public async Task DuplicateCode_InSameTenant_IsRejected()
    {
        var req1 = new CreateCustomerRequest
        {
            CustomerCode = "CUST-UNIQUE-99",
            Name = "First Company",
            Email = "first@comp.com"
        };
        var res1 = await _customerService.CreateCustomerAsync(req1, tenantId: 1);
        Assert.True(res1.Success);

        var req2 = new CreateCustomerRequest
        {
            CustomerCode = "CUST-UNIQUE-99", // Duplicate code in same tenant
            Name = "Second Company",
            Email = "second@comp.com"
        };
        var res2 = await _customerService.CreateCustomerAsync(req2, tenantId: 1);
        Assert.False(res2.Success);
        Assert.Equal("Customer code conflict", res2.Message);
    }

    [Fact]
    public async Task DuplicateCode_InDifferentTenant_IsAllowed()
    {
        var req1 = new CreateCustomerRequest
        {
            CustomerCode = "CUST-CODE-SHARED",
            Name = "Tenant 1 Company",
            Email = "t1@shared.com"
        };
        var res1 = await _customerService.CreateCustomerAsync(req1, tenantId: 1);
        Assert.True(res1.Success);

        var req2 = new CreateCustomerRequest
        {
            CustomerCode = "CUST-CODE-SHARED", // Same code, different tenant
            Name = "Tenant 2 Company",
            Email = "t2@shared.com"
        };
        var res2 = await _customerService.CreateCustomerAsync(req2, tenantId: 2);
        Assert.True(res2.Success);
        Assert.Equal(2, res2.Data!.TenantId);
    }

    [Fact]
    public async Task CustomerCode_AutoGenerated_WhenNotProvided()
    {
        var req = new CreateCustomerRequest
        {
            Name = "Code Generator Test",
            Email = "autocode@test.com"
        };
        var res = await _customerService.CreateCustomerAsync(req, tenantId: 1);
        Assert.True(res.Success);
        Assert.False(string.IsNullOrWhiteSpace(res.Data!.CustomerCode));
        Assert.StartsWith("CUST-", res.Data.CustomerCode);
    }

    #endregion

    #region 3. Multi-Tenant Isolation

    [Fact]
    public async Task TenantIsolation_TenantCannotAccessOtherTenantData()
    {
        // Setup customer in Tenant 1
        var t1Req = new CreateCustomerRequest { CustomerCode = "CUST-T1", Name = "Tenant 1 Client", Email = "t1@client.com" };
        var t1Res = await _customerService.CreateCustomerAsync(t1Req, tenantId: 1);
        var t1Id = t1Res.Data!.Id;

        // Setup customer in Tenant 2
        var t2Req = new CreateCustomerRequest { CustomerCode = "CUST-T2", Name = "Tenant 2 Client", Email = "t2@client.com" };
        var t2Res = await _customerService.CreateCustomerAsync(t2Req, tenantId: 2);
        var t2Id = t2Res.Data!.Id;

        // Tenant 1 cannot read Tenant 2's customer
        var crossRead = await _customerService.GetCustomerByIdAsync(t2Id, tenantId: 1);
        Assert.False(crossRead.Success);
        Assert.Equal("Customer not found", crossRead.Message);

        // Tenant 2 cannot read Tenant 1's customer
        var crossRead2 = await _customerService.GetCustomerByIdAsync(t1Id, tenantId: 2);
        Assert.False(crossRead2.Success);
        Assert.Equal("Customer not found", crossRead2.Message);

        // Tenant 1 cannot update Tenant 2's customer
        var crossUpdate = await _customerService.UpdateCustomerAsync(t2Id, new UpdateCustomerRequest { Name = "Hacked Name", Email = "hacked@test.com" }, tenantId: 1);
        Assert.False(crossUpdate.Success);
        Assert.Equal("Customer not found", crossUpdate.Message);

        // Tenant 1 search results only contain Tenant 1 customers
        var searchRes = await _customerService.GetCustomersAsync(new CustomerQueryParameters(), tenantId: 1);
        Assert.True(searchRes.Success);
        Assert.All(searchRes.Data!.Items, c => Assert.Equal(1, c.TenantId));
    }

    #endregion

    #region 4. Filters and Sorting

    [Fact]
    public async Task Filters_SearchAcrossNameEmailCodeAndCompany()
    {
        _customerRepo.Customers.Add(new Customer { Id = 1, TenantId = 1, CustomerCode = "CUST-ALPHA", Name = "Alpha Tech", Email = "alpha@domain.com", CompanyName = "Alpha Global" });
        _customerRepo.Customers.Add(new Customer { Id = 2, TenantId = 1, CustomerCode = "CUST-BETA", Name = "Beta Solutions", Email = "beta@domain.com", CompanyName = "Beta Global" });
        _customerRepo.Customers.Add(new Customer { Id = 3, TenantId = 1, CustomerCode = "CUST-GAMMA", Name = "Gamma Corp", Email = "gamma@domain.com", CompanyName = "Alpha Partner" });

        // Search by Company "Alpha"
        var alphaSearch = await _customerService.GetCustomersAsync(new CustomerQueryParameters { Search = "Alpha" }, tenantId: 1);
        Assert.Equal(2, alphaSearch.Data!.Items.Count);

        // Search by Code "BETA"
        var betaSearch = await _customerService.GetCustomersAsync(new CustomerQueryParameters { Search = "CUST-BETA" }, tenantId: 1);
        Assert.Single(betaSearch.Data!.Items);
        Assert.Equal("Beta Solutions", betaSearch.Data.Items[0].Name);
    }

    [Fact]
    public async Task Filters_ByIsActiveStatus()
    {
        _customerRepo.Customers.Add(new Customer { Id = 1, TenantId = 1, Name = "Active Client 1", Email = "a1@test.com", IsActive = true });
        _customerRepo.Customers.Add(new Customer { Id = 2, TenantId = 1, Name = "Active Client 2", Email = "a2@test.com", IsActive = true });
        _customerRepo.Customers.Add(new Customer { Id = 3, TenantId = 1, Name = "Inactive Client 1", Email = "i1@test.com", IsActive = false });

        var activeOnly = await _customerService.GetCustomersAsync(new CustomerQueryParameters { IsActive = true }, tenantId: 1);
        Assert.Equal(2, activeOnly.Data!.Items.Count);
        Assert.All(activeOnly.Data.Items, c => Assert.True(c.IsActive));

        var inactiveOnly = await _customerService.GetCustomersAsync(new CustomerQueryParameters { IsActive = false }, tenantId: 1);
        Assert.Single(inactiveOnly.Data!.Items);
        Assert.False(inactiveOnly.Data.Items[0].IsActive);
    }

    [Fact]
    public async Task Filters_SortingByNameAscendingAndDescending()
    {
        _customerRepo.Customers.Add(new Customer { Id = 1, TenantId = 1, Name = "Zara Fashion", Email = "zara@test.com" });
        _customerRepo.Customers.Add(new Customer { Id = 2, TenantId = 1, Name = "Apple Services", Email = "apple@test.com" });
        _customerRepo.Customers.Add(new Customer { Id = 3, TenantId = 1, Name = "Microsoft Tech", Email = "msft@test.com" });

        var ascSort = await _customerService.GetCustomersAsync(new CustomerQueryParameters { SortBy = "name", SortOrder = "asc" }, tenantId: 1);
        Assert.Equal("Apple Services", ascSort.Data!.Items[0].Name);
        Assert.Equal("Zara Fashion", ascSort.Data.Items[2].Name);

        var descSort = await _customerService.GetCustomersAsync(new CustomerQueryParameters { SortBy = "name", SortOrder = "desc" }, tenantId: 1);
        Assert.Equal("Zara Fashion", descSort.Data!.Items[0].Name);
        Assert.Equal("Apple Services", descSort.Data.Items[2].Name);
    }

    #endregion

    #region 5. Pagination

    [Fact]
    public async Task Pagination_NavigationAndPageCalculation()
    {
        for (int i = 1; i <= 25; i++)
        {
            _customerRepo.Customers.Add(new Customer
            {
                Id = i,
                TenantId = 1,
                Name = $"Customer {i:D2}",
                Email = $"cust{i:D2}@page.com",
                CreatedAtUtc = DateTime.UtcNow.AddMinutes(i)
            });
        }

        // Page 1 of 10 items
        var page1 = await _customerService.GetCustomersAsync(new CustomerQueryParameters { PageNumber = 1, PageSize = 10 }, tenantId: 1);
        Assert.Equal(25, page1.Data!.TotalCount);
        Assert.Equal(10, page1.Data.Items.Count);
        Assert.Equal(3, page1.Data.TotalPages);
        Assert.True(page1.Data.HasNextPage);
        Assert.False(page1.Data.HasPreviousPage);

        // Page 2 of 10 items
        var page2 = await _customerService.GetCustomersAsync(new CustomerQueryParameters { PageNumber = 2, PageSize = 10 }, tenantId: 1);
        Assert.Equal(10, page2.Data!.Items.Count);
        Assert.True(page2.Data.HasNextPage);
        Assert.True(page2.Data.HasPreviousPage);

        // Page 3 (final page)
        var page3 = await _customerService.GetCustomersAsync(new CustomerQueryParameters { PageNumber = 3, PageSize = 10 }, tenantId: 1);
        Assert.Equal(5, page3.Data!.Items.Count);
        Assert.False(page3.Data.HasNextPage);
        Assert.True(page3.Data.HasPreviousPage);

        // Out of bounds page
        var page99 = await _customerService.GetCustomersAsync(new CustomerQueryParameters { PageNumber = 99, PageSize = 10 }, tenantId: 1);
        Assert.Empty(page99.Data!.Items);
        Assert.Equal(25, page99.Data.TotalCount);
    }

    #endregion

    #region 6. Deactivation and Historical Data Preservation

    [Fact]
    public async Task Deactivation_SoftDelete_PreservesAddressesAndHistoricalData()
    {
        var req = new CreateCustomerRequest
        {
            Name = "Preserved Client",
            Email = "preserved@client.com",
            Addresses = new List<CustomerAddressDto>
            {
                new() { AddressType = "Billing", AddressLine1 = "123 Vault St", City = "Denver", Country = "USA" }
            }
        };

        var created = await _customerService.CreateCustomerAsync(req, tenantId: 1);
        var customerId = created.Data!.Id;

        // Deactivate customer
        var deactRes = await _customerService.UpdateCustomerAsync(customerId, new UpdateCustomerRequest
        {
            Name = "Preserved Client",
            Email = "preserved@client.com",
            IsActive = false
        }, tenantId: 1);
        Assert.True(deactRes.Success);
        Assert.False(deactRes.Data!.IsActive);

        // Retrieve deactivated customer: addresses and fields remain intact
        var readBack = await _customerService.GetCustomerByIdAsync(customerId, tenantId: 1);
        Assert.True(readBack.Success);
        Assert.False(readBack.Data!.IsActive);
        Assert.Equal("Preserved Client", readBack.Data.Name);
        Assert.Single(readBack.Data.Addresses);
        Assert.Equal("123 Vault St", readBack.Data.Addresses[0].AddressLine1);
    }

    #endregion

    #region 7. Audit Trail Integration

    [Fact]
    public async Task AuditTrail_RecordsCreateUpdateAndDeactivateEvents()
    {
        var tenantId = 1;
        var customerId = 55;

        // 1. Audit event for Create
        await _auditService.RecordCustomerCreatedAsync(
            tenantId, customerId, "Audit Customer", "Prathap",
            new { Name = "Audit Customer", Email = "audit@test.com" });

        // 2. Audit event for Update
        await _auditService.RecordCustomerUpdatedAsync(
            tenantId, customerId, "Audit Customer", "Prathap",
            new { Phone = "+1999888777" });

        // 3. Audit event for Deactivate
        await _auditService.RecordCustomerDeactivatedAsync(
            tenantId, customerId, "Audit Customer", "Prathap",
            "Business relationship terminated");

        // Verify audit history
        var history = await _auditService.GetCustomerAuditHistoryAsync(tenantId, customerId);
        Assert.Equal(3, history.Count);

        var createLog = history.First(h => h.Action == "CREATE");
        Assert.Equal("Prathap", createLog.UserName);
        Assert.Equal("Customer created", createLog.Changes);

        var updateLog = history.First(h => h.Action == "UPDATE");
        Assert.Equal("Phone updated", updateLog.Changes);

        var deactLog = history.First(h => h.Action == "DEACTIVATE");
        Assert.Contains("Business relationship terminated", deactLog.Changes);
    }

    #endregion

    #region 8. Concurrency Control

    [Fact]
    public async Task Concurrency_StaleRowVersion_RejectedWithConflict()
    {
        var initialTime = DateTime.UtcNow.AddHours(-1);
        var updatedTime = DateTime.UtcNow;

        _customerRepo.Customers.Add(new Customer
        {
            Id = 77,
            TenantId = 1,
            CustomerCode = "CUST-CONC-01",
            Name = "Concurrent Client",
            Email = "concurrent@test.com",
            RowVersion = updatedTime // Current DB state
        });

        // Caller submits with stale version
        var request = new UpdateCustomerRequest
        {
            Name = "Concurrent Client",
            Email = "concurrent@test.com",
            RowVersion = initialTime
        };

        var result = await _customerService.UpdateCustomerAsync(77, request, tenantId: 1);
        Assert.False(result.Success);
        Assert.Equal("Concurrency conflict", result.Message);
    }

    [Fact]
    public async Task Concurrency_MatchingRowVersion_Succeeds()
    {
        var currentTime = DateTime.UtcNow;

        _customerRepo.Customers.Add(new Customer
        {
            Id = 88,
            TenantId = 1,
            CustomerCode = "CUST-CONC-02",
            Name = "Matching Client",
            Email = "matching@test.com",
            RowVersion = currentTime
        });

        var request = new UpdateCustomerRequest
        {
            Name = "Updated Client",
            Email = "matching@test.com",
            RowVersion = currentTime // Exactly matching version
        };

        var result = await _customerService.UpdateCustomerAsync(88, request, tenantId: 1);
        Assert.True(result.Success);
        Assert.Equal("Updated Client", result.Data!.Name);
    }

    #endregion

    #region 7. CustomerType & TaxId Filter Tests

    [Fact]
    public async Task CreateCustomer_CustomerType_ExplicitOrInferred_WorksCorrectly()
    {
        // 1. Explicit Individual
        var res1 = await _customerService.CreateCustomerAsync(new CreateCustomerRequest
        {
            Name = "John Individual",
            Email = "john.ind@test.com",
            CustomerType = "Individual"
        }, tenantId: 1);
        Assert.True(res1.Success);
        Assert.Equal("Individual", res1.Data!.CustomerType);

        // 2. Inferred Business via CompanyName
        var res2 = await _customerService.CreateCustomerAsync(new CreateCustomerRequest
        {
            Name = "Jane Business",
            Email = "jane.biz@test.com",
            CompanyName = "Enterprise Inc"
        }, tenantId: 1);
        Assert.True(res2.Success);
        Assert.Equal("Business", res2.Data!.CustomerType);

        // 3. Default without CompanyName -> Individual
        var res3 = await _customerService.CreateCustomerAsync(new CreateCustomerRequest
        {
            Name = "Bob Solo",
            Email = "bob.solo@test.com"
        }, tenantId: 1);
        Assert.True(res3.Success);
        Assert.Equal("Individual", res3.Data!.CustomerType);
    }

    [Fact]
    public async Task GetCustomers_FilterByCustomerType_ReturnsOnlyMatching()
    {
        _customerRepo.Customers.Add(new Customer
        {
            Id = 91,
            TenantId = 1,
            CustomerCode = "CUST-BIZ-01",
            Name = "Corp 1",
            Email = "corp1@test.com",
            CustomerType = "Business"
        });

        _customerRepo.Customers.Add(new Customer
        {
            Id = 92,
            TenantId = 1,
            CustomerCode = "CUST-IND-01",
            Name = "Individual 1",
            Email = "ind1@test.com",
            CustomerType = "Individual"
        });

        _customerRepo.Customers.Add(new Customer
        {
            Id = 95,
            TenantId = 1,
            CustomerCode = "CUST-ORG-01",
            Name = "Org 1",
            Email = "org1@test.com",
            CustomerType = "Organization"
        });

        var bizResult = await _customerService.GetCustomersAsync(new CustomerQueryParameters
        {
            CustomerType = "Business"
        }, tenantId: 1);
        Assert.Single(bizResult.Data!.Items);
        Assert.Equal("CUST-BIZ-01", bizResult.Data.Items[0].CustomerCode);

        var indResult = await _customerService.GetCustomersAsync(new CustomerQueryParameters
        {
            CustomerType = "Individual"
        }, tenantId: 1);
        Assert.Single(indResult.Data!.Items);
        Assert.Equal("CUST-IND-01", indResult.Data.Items[0].CustomerCode);

        var orgResult = await _customerService.GetCustomersAsync(new CustomerQueryParameters
        {
            CustomerType = "Organization"
        }, tenantId: 1);
        Assert.Single(orgResult.Data!.Items);
        Assert.Equal("CUST-ORG-01", orgResult.Data.Items[0].CustomerCode);
    }

    [Fact]
    public async Task GetCustomers_FilterByTaxId_ReturnsOnlyMatching()
    {
        _customerRepo.Customers.Add(new Customer
        {
            Id = 93,
            TenantId = 1,
            CustomerCode = "CUST-TAX-01",
            Name = "Taxpayer 1",
            Email = "tax1@test.com",
            TaxId = "TAX-998877"
        });

        _customerRepo.Customers.Add(new Customer
        {
            Id = 94,
            TenantId = 1,
            CustomerCode = "CUST-TAX-02",
            Name = "Taxpayer 2",
            Email = "tax2@test.com",
            TaxId = "VAT-112233"
        });

        var taxResult = await _customerService.GetCustomersAsync(new CustomerQueryParameters
        {
            TaxId = "TAX-9988"
        }, tenantId: 1);
        Assert.Single(taxResult.Data!.Items);
        Assert.Equal("CUST-TAX-01", taxResult.Data.Items[0].CustomerCode);
    }

    [Fact]
    public async Task GetCustomerSummary_ReturnsAccurateMetrics()
    {
        _customerRepo.Customers.Clear();

        _customerRepo.Customers.Add(new Customer { Id = 101, TenantId = 1, Status = "Active", Name = "A1", Email = "a1@test.com", CustomerCode = "C101" });
        _customerRepo.Customers.Add(new Customer { Id = 102, TenantId = 1, Status = "Active", Name = "A2", Email = "a2@test.com", CustomerCode = "C102" });
        _customerRepo.Customers.Add(new Customer { Id = 103, TenantId = 1, Status = "Inactive", Name = "I1", Email = "i1@test.com", CustomerCode = "C103" });

        var res = await _customerService.GetCustomerSummaryAsync(1);
        Assert.True(res.Success);
        Assert.Equal(3, res.Data!.TotalCustomers);
        Assert.Equal(2, res.Data.ActiveCustomers);
        Assert.Equal(1, res.Data.InactiveCustomers);
        Assert.Equal(0.00m, res.Data.TotalOutstanding);
        Assert.Equal("INR", res.Data.Currency);
    }

    [Fact]
    public async Task GetCustomers_FilterByTaxRegistration_Works()
    {
        _customerRepo.Customers.Clear();

        _customerRepo.Customers.Add(new Customer { Id = 111, TenantId = 1, Status = "Active", Name = "Reg", Email = "r@test.com", CustomerCode = "CR1", TaxId = "GST123" });
        _customerRepo.Customers.Add(new Customer { Id = 112, TenantId = 1, Status = "Active", Name = "Unreg", Email = "u@test.com", CustomerCode = "CU1", TaxId = null });

        var regRes = await _customerService.GetCustomersAsync(new CustomerQueryParameters { TaxRegistration = "Registered" }, 1);
        Assert.Single(regRes.Data!.Items);
        Assert.Equal("CR1", regRes.Data.Items[0].CustomerCode);

        var unregRes = await _customerService.GetCustomersAsync(new CustomerQueryParameters { TaxRegistration = "Unregistered" }, 1);
        Assert.Single(unregRes.Data!.Items);
        Assert.Equal("CU1", unregRes.Data.Items[0].CustomerCode);

        var allRes = await _customerService.GetCustomersAsync(new CustomerQueryParameters { TaxRegistration = "All" }, 1);
        Assert.Equal(2, allRes.Data!.Items.Count);
    }

    #endregion
}
