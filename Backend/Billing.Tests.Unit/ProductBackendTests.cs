using System.Security.Claims;
using Billing.API.Controllers;
using Billing.Application.Services;
using Billing.Contracts;
using Billing.Domain.Entities;
using Billing.Tests.Unit.Fakes;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Billing.Tests.Unit;

public class ProductBackendTests
{
    private readonly FakeProductRepository _repository;
    private readonly ProductService _service;
    private readonly ProductsController _controller;

    public ProductBackendTests()
    {
        _repository = new FakeProductRepository();
        _service = new ProductService(_repository);
        _controller = new ProductsController(_service, NullLogger<ProductsController>.Instance);
        SetUserContext(_controller, tenantId: 1, role: "TenantAdmin", email: "admin@tenant1.com");
    }

    private static void SetUserContext(ControllerBase controller, int tenantId, string role, string email)
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

    #region IBMSBE-001: POST Create Product

    [Fact]
    public async Task CreateProduct_WithValidData_ReturnsCreatedProduct()
    {
        var request = new CreateProductRequest
        {
            ProductCode = "PRD-001",
            Name = "Enterprise Billing Software",
            Description = "Full suite billing software",
            Type = "Product",
            Category = "Software",
            Unit = "License",
            Price = 4999.00m,
            Currency = "INR",
            TaxCategory = "GST 18%",
            HsnSacCode = "998314",
            DiscountAllowed = true,
            Status = "Active"
        };

        var response = await _controller.CreateProduct(request);

        var createdResult = Assert.IsType<CreatedAtActionResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<ProductDto>>(createdResult.Value);
        Assert.True(apiResponse.Success);
        Assert.NotNull(apiResponse.Data);
        Assert.Equal("PRD-001", apiResponse.Data.ProductCode);
        Assert.Equal("Enterprise Billing Software", apiResponse.Data.Name);
        Assert.Equal(4999.00m, apiResponse.Data.Price);
        Assert.Equal("Software", apiResponse.Data.CategoryName);
        Assert.Equal(1, apiResponse.Data.TenantId);
        Assert.True(apiResponse.Data.IsActive);
    }

    [Fact]
    public async Task CreateProduct_WithoutProductCode_AutoGeneratesCode()
    {
        var request = new CreateProductRequest
        {
            Name = "Consulting Service",
            Price = 1500.00m,
            Type = "Service"
        };

        var response = await _controller.CreateProduct(request);

        var createdResult = Assert.IsType<CreatedAtActionResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<ProductDto>>(createdResult.Value);
        Assert.True(apiResponse.Success);
        Assert.StartsWith("PROD-", apiResponse.Data!.ProductCode);
    }

    [Fact]
    public async Task CreateProduct_WithNegativePrice_ReturnsBadRequest()
    {
        var request = new CreateProductRequest
        {
            ProductCode = "PRD-NEG",
            Name = "Invalid Price Product",
            Price = -10.00m
        };

        var response = await _controller.CreateProduct(request);

        var badRequest = Assert.IsType<BadRequestObjectResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<ProductDto>>(badRequest.Value);
        Assert.False(apiResponse.Success);
        Assert.Contains(apiResponse.Errors!, e => e.Contains("Price"));
    }

    [Fact]
    public async Task CreateProduct_WithEmptyName_ReturnsBadRequest()
    {
        var request = new CreateProductRequest
        {
            ProductCode = "PRD-NONAME",
            Name = " ",
            Price = 100.00m
        };

        var response = await _controller.CreateProduct(request);

        var badRequest = Assert.IsType<BadRequestObjectResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<ProductDto>>(badRequest.Value);
        Assert.False(apiResponse.Success);
        Assert.Contains(apiResponse.Errors!, e => e.Contains("name is required"));
    }

    [Fact]
    public async Task CreateProduct_WithDuplicateCodeSameTenant_ReturnsConflict()
    {
        var req1 = new CreateProductRequest { ProductCode = "PRD-DUP", Name = "First Product", Price = 10.00m };
        await _controller.CreateProduct(req1);

        var req2 = new CreateProductRequest { ProductCode = "prd-dup", Name = "Second Product", Price = 20.00m };
        var response = await _controller.CreateProduct(req2);

        var badRequest = Assert.IsType<BadRequestObjectResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<ProductDto>>(badRequest.Value);
        Assert.False(apiResponse.Success);
        Assert.Contains("conflict", apiResponse.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task CreateProduct_WithSameCodeDifferentTenant_Succeeds()
    {
        var req1 = new CreateProductRequest { ProductCode = "PRD-SHARED", Name = "Tenant 1 Product", Price = 10.00m };
        await _controller.CreateProduct(req1);

        SetUserContext(_controller, tenantId: 2, role: "TenantAdmin", email: "admin@tenant2.com");
        var req2 = new CreateProductRequest { ProductCode = "PRD-SHARED", Name = "Tenant 2 Product", Price = 20.00m };
        var response = await _controller.CreateProduct(req2);

        var createdResult = Assert.IsType<CreatedAtActionResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<ProductDto>>(createdResult.Value);
        Assert.True(apiResponse.Success);
        Assert.Equal(2, apiResponse.Data!.TenantId);
    }

    [Fact]
    public async Task CreateProduct_SuperAdmin_WithXTenantIdHeader_CreatesForSpecifiedTenant()
    {
        SetUserContext(_controller, tenantId: 0, role: "SuperAdmin", email: "superadmin@ibms.com");
        _controller.HttpContext.Request.Headers["X-Tenant-Id"] = "5";

        var request = new CreateProductRequest { ProductCode = "PRD-SA", Name = "SuperAdmin Product", Price = 99.00m };
        var response = await _controller.CreateProduct(request);

        var createdResult = Assert.IsType<CreatedAtActionResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<ProductDto>>(createdResult.Value);
        Assert.True(apiResponse.Success);
        Assert.Equal(5, apiResponse.Data!.TenantId);
    }

    #endregion

    #region IBMSBE-002: GET Product List

    [Fact]
    public async Task GetProducts_ReturnsPaginatedList_ScopedToTenant()
    {
        await _repository.AddAsync(new Product { TenantId = 1, ProductCode = "P1", Name = "Prod 1", Price = 10, Status = "Active" });
        await _repository.AddAsync(new Product { TenantId = 1, ProductCode = "P2", Name = "Prod 2", Price = 20, Status = "Active" });
        await _repository.AddAsync(new Product { TenantId = 2, ProductCode = "P3", Name = "Prod 3 (Other)", Price = 30, Status = "Active" });

        var response = await _controller.GetProducts(pageNumber: 1, pageSize: 10);

        var okResult = Assert.IsType<OkObjectResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<PagedResult<ProductDto>>>(okResult.Value);
        Assert.True(apiResponse.Success);
        Assert.Equal(2, apiResponse.Data!.TotalCount);
        Assert.All(apiResponse.Data.Items, p => Assert.Equal(1, p.TenantId));
    }

    [Fact]
    public async Task GetProducts_WithSearchFilter_FiltersByNameAndCode()
    {
        await _repository.AddAsync(new Product { TenantId = 1, ProductCode = "LAPTOP-01", Name = "Dell XPS 15", Price = 1200 });
        await _repository.AddAsync(new Product { TenantId = 1, ProductCode = "MOUSE-01", Name = "Logitech MX Master", Price = 99 });

        var response = await _controller.GetProducts(search: "Dell");

        var okResult = Assert.IsType<OkObjectResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<PagedResult<ProductDto>>>(okResult.Value);
        Assert.Single(apiResponse.Data!.Items);
        Assert.Equal("LAPTOP-01", apiResponse.Data.Items[0].ProductCode);
    }

    [Fact]
    public async Task GetProducts_WithStatusFilter_FiltersActiveOrInactive()
    {
        await _repository.AddAsync(new Product { TenantId = 1, ProductCode = "P-ACT", Name = "Active Item", Price = 10, Status = "Active" });
        await _repository.AddAsync(new Product { TenantId = 1, ProductCode = "P-INA", Name = "Inactive Item", Price = 20, Status = "Inactive" });

        var response = await _controller.GetProducts(status: "Inactive");

        var okResult = Assert.IsType<OkObjectResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<PagedResult<ProductDto>>>(okResult.Value);
        Assert.Single(apiResponse.Data!.Items);
        Assert.Equal("P-INA", apiResponse.Data.Items[0].ProductCode);
    }

    [Fact]
    public async Task GetProducts_WithCategoryFilter_FiltersCorrectly()
    {
        var cat = await _repository.AddCategoryAsync(new ProductCategory { TenantId = 1, Name = "Hardware" });
        await _repository.AddAsync(new Product { TenantId = 1, ProductCode = "P-HW", Name = "Keyboard", Price = 50, CategoryId = cat.Id, Category = cat });
        await _repository.AddAsync(new Product { TenantId = 1, ProductCode = "P-SW", Name = "OS License", Price = 150 });

        var response = await _controller.GetProducts(category: "Hardware");

        var okResult = Assert.IsType<OkObjectResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<PagedResult<ProductDto>>>(okResult.Value);
        Assert.Single(apiResponse.Data!.Items);
        Assert.Equal("P-HW", apiResponse.Data.Items[0].ProductCode);
    }

    [Fact]
    public async Task GetProducts_WithSorting_OrdersAscendingAndDescending()
    {
        await _repository.AddAsync(new Product { TenantId = 1, ProductCode = "A", Name = "Product A", Price = 100 });
        await _repository.AddAsync(new Product { TenantId = 1, ProductCode = "B", Name = "Product B", Price = 50 });

        var responseAsc = await _controller.GetProducts(sortBy: "price", sortOrder: "asc");
        var okAsc = Assert.IsType<OkObjectResult>(responseAsc);
        var dataAsc = Assert.IsType<ApiResponse<PagedResult<ProductDto>>>(okAsc.Value).Data!;
        Assert.Equal(50, dataAsc.Items[0].Price);
        Assert.Equal(100, dataAsc.Items[1].Price);

        var responseDesc = await _controller.GetProducts(sortBy: "price", sortOrder: "desc");
        var okDesc = Assert.IsType<OkObjectResult>(responseDesc);
        var dataDesc = Assert.IsType<ApiResponse<PagedResult<ProductDto>>>(okDesc.Value).Data!;
        Assert.Equal(100, dataDesc.Items[0].Price);
        Assert.Equal(50, dataDesc.Items[1].Price);
    }

    #endregion

    #region IBMSBE-003: GET Product Details

    [Fact]
    public async Task GetProductById_WhenExists_ReturnsProduct()
    {
        var product = await _repository.AddAsync(new Product
        {
            TenantId = 1,
            ProductCode = "PRD-100",
            Name = "Monitor 4K",
            Price = 350.00m
        });

        var response = await _controller.GetProductById(product.Id);

        var okResult = Assert.IsType<OkObjectResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<ProductDto>>(okResult.Value);
        Assert.True(apiResponse.Success);
        Assert.Equal("PRD-100", apiResponse.Data!.ProductCode);
        Assert.Equal(350.00m, apiResponse.Data.Price);
    }

    [Fact]
    public async Task GetProductById_WhenNotFound_ReturnsNotFound404()
    {
        var response = await _controller.GetProductById(9999);

        var notFoundResult = Assert.IsType<NotFoundObjectResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<ProductDto>>(notFoundResult.Value);
        Assert.False(apiResponse.Success);
        Assert.Contains("not found", apiResponse.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task GetProductById_DifferentTenant_ReturnsNotFound404()
    {
        var otherTenantProduct = await _repository.AddAsync(new Product
        {
            TenantId = 2,
            ProductCode = "PRD-T2",
            Name = "Other Tenant Product",
            Price = 100.00m
        });

        var response = await _controller.GetProductById(otherTenantProduct.Id);

        var notFoundResult = Assert.IsType<NotFoundObjectResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<ProductDto>>(notFoundResult.Value);
        Assert.False(apiResponse.Success);
    }

    #endregion

    #region IBMSBE-004: PUT Update Product

    [Fact]
    public async Task UpdateProduct_WithValidData_UpdatesProduct()
    {
        var existing = await _repository.AddAsync(new Product
        {
            TenantId = 1,
            ProductCode = "PRD-ORIG",
            Name = "Original Name",
            Price = 100.00m,
            Unit = "Piece"
        });

        var updateRequest = new UpdateProductRequest
        {
            ProductCode = "PRD-UPDATED",
            Name = "Updated Name",
            Price = 150.00m,
            Description = "New description",
            Category = "Peripherals",
            Unit = "Box",
            Status = "Inactive"
        };

        var response = await _controller.UpdateProduct(existing.Id, updateRequest);

        var okResult = Assert.IsType<OkObjectResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<ProductDto>>(okResult.Value);
        Assert.True(apiResponse.Success);
        Assert.Equal("PRD-UPDATED", apiResponse.Data!.ProductCode);
        Assert.Equal("Updated Name", apiResponse.Data.Name);
        Assert.Equal(150.00m, apiResponse.Data.Price);
        Assert.Equal("Peripherals", apiResponse.Data.CategoryName);
        Assert.Equal("Inactive", apiResponse.Data.Status);
        Assert.False(apiResponse.Data.IsActive);
        Assert.NotNull(apiResponse.Data.UpdatedAtUtc);
    }

    [Fact]
    public async Task UpdateProduct_WhenNotFound_ReturnsNotFound404()
    {
        var updateRequest = new UpdateProductRequest
        {
            Name = "Does Not Exist",
            Price = 100
        };

        var response = await _controller.UpdateProduct(9999, updateRequest);

        var notFoundResult = Assert.IsType<NotFoundObjectResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<ProductDto>>(notFoundResult.Value);
        Assert.False(apiResponse.Success);
    }

    [Fact]
    public async Task UpdateProduct_WithDuplicateCode_ReturnsConflict()
    {
        await _repository.AddAsync(new Product { TenantId = 1, ProductCode = "TAKEN-CODE", Name = "Prod 1", Price = 10 });
        var target = await _repository.AddAsync(new Product { TenantId = 1, ProductCode = "TARGET-CODE", Name = "Prod 2", Price = 20 });

        var updateRequest = new UpdateProductRequest
        {
            ProductCode = "TAKEN-CODE",
            Name = "Target Updated",
            Price = 25
        };

        var response = await _controller.UpdateProduct(target.Id, updateRequest);

        var badRequest = Assert.IsType<BadRequestObjectResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<ProductDto>>(badRequest.Value);
        Assert.False(apiResponse.Success);
        Assert.Contains("conflict", apiResponse.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task UpdateProduct_DifferentTenant_ReturnsNotFound404()
    {
        var otherProduct = await _repository.AddAsync(new Product
        {
            TenantId = 2,
            ProductCode = "PRD-T2",
            Name = "Other Tenant Item",
            Price = 100
        });

        var updateRequest = new UpdateProductRequest
        {
            Name = "Hacked Item",
            Price = 5
        };

        var response = await _controller.UpdateProduct(otherProduct.Id, updateRequest);

        var notFoundResult = Assert.IsType<NotFoundObjectResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<ProductDto>>(notFoundResult.Value);
        Assert.False(apiResponse.Success);
    }

    #endregion
}
