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
            UserId = "usr_test",
            UserName = "Prathap",
            Timestamp = DateTime.UtcNow,
            Changes = "{\"phone\":\"+12345\"}",
            IpAddress = "127.0.0.1"
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
        Assert.True(root.TryGetProperty("userId", out _));
        Assert.True(root.TryGetProperty("userName", out _));
        Assert.True(root.TryGetProperty("timestamp", out _));
        Assert.True(root.TryGetProperty("changes", out _));
        Assert.True(root.TryGetProperty("ipAddress", out _));
    }
}
