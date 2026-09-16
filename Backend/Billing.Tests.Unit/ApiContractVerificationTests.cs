using System.Text.Json;
using Billing.Contracts;
using Billing.Domain.Entities;
using Xunit;

namespace Billing.Tests.Unit;

/// <summary>
/// Phase 3 - Task 5 (IBMSBE-Int-01): API Contract Verification
/// Verifies frontend/backend contracts match in structure, property naming (camelCase),
/// casing, endpoints, and response envelopes.
/// </summary>
public class ApiContractVerificationTests
{
    private readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    [Fact]
    public void CreateCustomerRequest_SerializesWithExpectedCamelCaseProperties()
    {
        var request = new CreateCustomerRequest
        {
            Name = "Acme Global",
            Email = "acme@global.com",
            CustomerCode = "CUST-001",
            Phone = "+1234567890",
            CompanyName = "Acme Inc",
            TaxId = "TAX-999",
            Address = "100 Innovation Way",
            City = "San Jose",
            State = "CA",
            PostalCode = "95110",
            Country = "USA",
            Website = "https://acme.com",
            Notes = "Strategic partner",
            Currency = "USD",
            PaymentTerms = "Net 30",
            Addresses = new List<CustomerAddressDto>
            {
                new()
                {
                    Id = 1,
                    CustomerId = 10,
                    TenantId = 1,
                    AddressType = "Billing",
                    AddressLine1 = "100 Innovation Way",
                    City = "San Jose",
                    Country = "USA",
                    IsDefault = true
                }
            }
        };

        var json = JsonSerializer.Serialize(request, _jsonOptions);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        Assert.True(root.TryGetProperty("name", out var nameProp));
        Assert.Equal("Acme Global", nameProp.GetString());

        Assert.True(root.TryGetProperty("email", out var emailProp));
        Assert.Equal("acme@global.com", emailProp.GetString());

        Assert.True(root.TryGetProperty("customerCode", out var codeProp));
        Assert.Equal("CUST-001", codeProp.GetString());

        Assert.True(root.TryGetProperty("addresses", out var addressesProp));
        Assert.Equal(JsonValueKind.Array, addressesProp.ValueKind);
        Assert.Equal(1, addressesProp.GetArrayLength());

        var addr0 = addressesProp[0];
        Assert.True(addr0.TryGetProperty("addressType", out _));
        Assert.True(addr0.TryGetProperty("addressLine1", out _));
        Assert.True(addr0.TryGetProperty("isDefault", out _));
    }

    [Fact]
    public void UpdateCustomerRequest_SerializesWithExpectedCamelCaseProperties()
    {
        var request = new UpdateCustomerRequest
        {
            Name = "Updated Name",
            Email = "updated@test.com",
            IsActive = false,
            RowVersion = new DateTime(2026, 9, 8, 12, 0, 0, DateTimeKind.Utc)
        };

        var json = JsonSerializer.Serialize(request, _jsonOptions);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        Assert.True(root.TryGetProperty("name", out _));
        Assert.True(root.TryGetProperty("email", out _));
        Assert.True(root.TryGetProperty("isActive", out var activeProp));
        Assert.False(activeProp.GetBoolean());

        Assert.True(root.TryGetProperty("rowVersion", out _));
    }

    [Fact]
    public void ApiResponse_EnvelopeMatchesFrontendExpectations()
    {
        var response = ApiResponse<CustomerDto>.Ok(new CustomerDto
        {
            Id = 5,
            TenantId = 1,
            CustomerCode = "CUST-05",
            Name = "Test Client",
            Email = "test@client.com",
            IsActive = true
        }, "Customer created successfully.");

        var json = JsonSerializer.Serialize(response, _jsonOptions);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        Assert.True(root.TryGetProperty("success", out var successProp));
        Assert.True(successProp.GetBoolean());

        Assert.True(root.TryGetProperty("data", out var dataProp));
        Assert.True(dataProp.TryGetProperty("id", out var idProp));
        Assert.Equal(5, idProp.GetInt32());
        Assert.True(dataProp.TryGetProperty("customerCode", out _));

        Assert.True(root.TryGetProperty("message", out var msgProp));
        Assert.Equal("Customer created successfully.", msgProp.GetString());

        Assert.True(root.TryGetProperty("errors", out var errorsProp));
        Assert.True(errorsProp.ValueKind == JsonValueKind.Null || errorsProp.ValueKind == JsonValueKind.Array);
    }

    [Fact]
    public void PagedResult_MatchesFrontendPaginationContract()
    {
        var items = new List<CustomerDto>
        {
            new() { Id = 1, Name = "Client A", Email = "a@test.com" },
            new() { Id = 2, Name = "Client B", Email = "b@test.com" }
        };

        var paged = new PagedResult<CustomerDto>(items, 20, 1, 10);

        var json = JsonSerializer.Serialize(paged, _jsonOptions);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        Assert.True(root.TryGetProperty("items", out var itemsProp));
        Assert.Equal(2, itemsProp.GetArrayLength());

        Assert.True(root.TryGetProperty("totalCount", out var total));
        Assert.Equal(20, total.GetInt32());

        Assert.True(root.TryGetProperty("pageNumber", out var pageNum));
        Assert.Equal(1, pageNum.GetInt32());

        Assert.True(root.TryGetProperty("pageSize", out var pageSize));
        Assert.Equal(10, pageSize.GetInt32());

        Assert.True(root.TryGetProperty("totalPages", out var totalPages));
        Assert.Equal(2, totalPages.GetInt32());

        Assert.True(root.TryGetProperty("hasPreviousPage", out var hasPrev));
        Assert.False(hasPrev.GetBoolean());

        Assert.True(root.TryGetProperty("hasNextPage", out var hasNext));
        Assert.True(hasNext.GetBoolean());
    }

    [Fact]
    public void AuditLog_SerializesWithExpectedCamelCaseProperties()
    {
        var log = new AuditLog
        {
            Id = 1,
            TenantId = 1,
            CustomerId = 10,
            EntityName = "Customer",
            EntityId = "10",
            Action = "UPDATE",
            UserName = "Prathap",
            Timestamp = DateTime.UtcNow,
            Changes = "Phone updated"
        };

        var json = JsonSerializer.Serialize(log, _jsonOptions);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        Assert.True(root.TryGetProperty("id", out _));
        Assert.True(root.TryGetProperty("tenantId", out _));
        Assert.True(root.TryGetProperty("customerId", out _));
        Assert.True(root.TryGetProperty("entityName", out _));
        Assert.True(root.TryGetProperty("entityId", out _));
        Assert.True(root.TryGetProperty("action", out _));
        Assert.True(root.TryGetProperty("userName", out _));
        Assert.True(root.TryGetProperty("timestamp", out _));
        Assert.True(root.TryGetProperty("changes", out _));
    }

    [Fact]
    public void CustomerKpiSummaryDto_SerializesWithExpectedCamelCaseProperties()
    {
        var summary = new CustomerKpiSummaryDto
        {
            TotalCustomers = 120,
            ActiveCustomers = 100,
            InactiveCustomers = 20,
            TotalOutstanding = 1500.50m,
            Currency = "INR"
        };

        var response = ApiResponse<CustomerKpiSummaryDto>.Ok(summary, "Customer summary retrieved successfully.");
        var json = JsonSerializer.Serialize(response, _jsonOptions);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        Assert.True(root.TryGetProperty("success", out var successProp));
        Assert.True(successProp.GetBoolean());

        Assert.True(root.TryGetProperty("message", out _));

        Assert.True(root.TryGetProperty("data", out var dataProp));
        Assert.True(dataProp.TryGetProperty("totalCustomers", out var totalProp));
        Assert.Equal(120, totalProp.GetInt32());

        Assert.True(dataProp.TryGetProperty("activeCustomers", out var activeProp));
        Assert.Equal(100, activeProp.GetInt32());

        Assert.True(dataProp.TryGetProperty("inactiveCustomers", out var inactiveProp));
        Assert.Equal(20, inactiveProp.GetInt32());

        Assert.True(dataProp.TryGetProperty("totalOutstanding", out var outstandingProp));
        Assert.Equal(1500.50m, outstandingProp.GetDecimal());

        Assert.True(dataProp.TryGetProperty("currency", out var currencyProp));
        Assert.Equal("INR", currencyProp.GetString());
    }

    [Fact]
    public void ProductDto_SerializesWithExpectedCamelCaseProperties()
    {
        var product = new ProductDto
        {
            Id = 1,
            TenantId = 1,
            ProductCode = "PRD-001",
            Name = "ERP Billing",
            Description = "Full Suite",
            Type = "Product",
            CategoryId = 5,
            CategoryName = "Software",
            Unit = "License",
            Price = 999.99m,
            Currency = "INR",
            TaxCategory = "GST 18%",
            HsnSacCode = "998314",
            DiscountAllowed = true,
            Status = "Active",
            IsActive = true,
            CreatedAtUtc = DateTime.UtcNow
        };

        var response = ApiResponse<ProductDto>.Ok(product, "Product created");
        var json = JsonSerializer.Serialize(response, _jsonOptions);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        Assert.True(root.TryGetProperty("success", out _));
        Assert.True(root.TryGetProperty("data", out var data));
        Assert.True(data.TryGetProperty("id", out _));
        Assert.True(data.TryGetProperty("tenantId", out _));
        Assert.True(data.TryGetProperty("productCode", out var codeProp));
        Assert.Equal("PRD-001", codeProp.GetString());
        Assert.True(data.TryGetProperty("name", out _));
        Assert.True(data.TryGetProperty("categoryId", out _));
        Assert.True(data.TryGetProperty("categoryName", out _));
        Assert.True(data.TryGetProperty("price", out _));
        Assert.True(data.TryGetProperty("currency", out _));
        Assert.True(data.TryGetProperty("taxCategory", out _));
        Assert.True(data.TryGetProperty("hsnSacCode", out _));
        Assert.True(data.TryGetProperty("hsnSac", out _));
        Assert.True(data.TryGetProperty("category", out _));
        Assert.True(data.TryGetProperty("discountAllowed", out _));
        Assert.True(data.TryGetProperty("status", out _));
        Assert.True(data.TryGetProperty("isActive", out _));
    }

    [Fact]
    public void CreateProductRequest_DeserializesWithHsnSacCode()
    {
        var json = """
        {
            "productCode": "PRD-STANDARD",
            "name": "Widget X",
            "price": 49.99,
            "category": "Gadgets",
            "hsnSacCode": "8471"
        }
        """;

        var request = JsonSerializer.Deserialize<CreateProductRequest>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        Assert.NotNull(request);
        Assert.Equal("PRD-STANDARD", request.ProductCode);
        Assert.Equal("Widget X", request.Name);
        Assert.Equal(49.99m, request.Price);
        Assert.Equal("Gadgets", request.Category);
        Assert.Equal("8471", request.HsnSacCode);
    }

    [Fact]
    public void CreateProductRequest_DeserializesWithHsnSac_FrontendAlias()
    {
        var json = """
        {
            "productCode": "PRD-FRONTEND",
            "name": "Widget Frontend",
            "price": 99.99,
            "category": "Electronics",
            "hsnSac": "8528"
        }
        """;

        var request = JsonSerializer.Deserialize<CreateProductRequest>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        Assert.NotNull(request);
        Assert.Equal("8528", request.HsnSacCode);
        Assert.Equal("8528", request.HsnSac);
    }

    [Fact]
    public void UpdateProductRequest_DeserializesWithHsnSac_FrontendAlias()
    {
        var json = """
        {
            "productCode": "PRD-UPDATE",
            "name": "Widget Updated",
            "price": 149.99,
            "category": "Electronics",
            "hsnSac": "8528"
        }
        """;

        var request = JsonSerializer.Deserialize<UpdateProductRequest>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        Assert.NotNull(request);
        Assert.Equal("8528", request.HsnSacCode);
        Assert.Equal("8528", request.HsnSac);
    }

    [Fact]
    public void ProductCategoryDto_SerializesWithExpectedCamelCaseProperties()
    {
        var category = new ProductCategoryDto
        {
            Id = 1,
            TenantId = 1,
            Name = "Hardware",
            Description = "Computer peripherals",
            Status = "Active",
            IsActive = true,
            ProductCount = 5,
            CreatedAtUtc = DateTime.UtcNow
        };

        var response = ApiResponse<ProductCategoryDto>.Ok(category, "Category retrieved");
        var json = JsonSerializer.Serialize(response, _jsonOptions);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        Assert.True(root.TryGetProperty("success", out _));
        Assert.True(root.TryGetProperty("data", out var data));
        Assert.True(data.TryGetProperty("id", out var idProp));
        Assert.Equal(1, idProp.GetInt32());
        Assert.True(data.TryGetProperty("name", out var nameProp));
        Assert.Equal("Hardware", nameProp.GetString());
        Assert.True(data.TryGetProperty("productCount", out var countProp));
        Assert.Equal(5, countProp.GetInt32());
        Assert.True(data.TryGetProperty("status", out var statusProp));
        Assert.Equal("Active", statusProp.GetString());
        Assert.True(data.TryGetProperty("isActive", out var activeProp));
        Assert.True(activeProp.GetBoolean());
    }

    [Fact]
    public void CreateCategoryRequest_DeserializesCorrectly()
    {
        var json = """
        {
            "name": "Cloud Infrastructure",
            "description": "AWS and Azure servers",
            "status": "Active"
        }
        """;

        var request = JsonSerializer.Deserialize<CreateCategoryRequest>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        Assert.NotNull(request);
        Assert.Equal("Cloud Infrastructure", request.Name);
        Assert.Equal("AWS and Azure servers", request.Description);
        Assert.Equal("Active", request.Status);
    }
}

