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

public class CategoryBackendTests
{
    private readonly FakeCategoryRepository _repository;
    private readonly CategoryService _service;
    private readonly CategoriesController _controller;

    public CategoryBackendTests()
    {
        _repository = new FakeCategoryRepository();
        _service = new CategoryService(_repository);
        _controller = new CategoriesController(_service, NullLogger<CategoriesController>.Instance);
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

    #region IBMSBE-014: POST Create Category

    [Fact]
    public async Task CreateCategory_WithValidData_ReturnsCreated()
    {
        var request = new CreateCategoryRequest
        {
            Name = "Electronics",
            Description = "Electronic gadgets and components"
        };

        var response = await _controller.CreateCategory(request);

        var createdResult = Assert.IsType<CreatedAtActionResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<ProductCategoryDto>>(createdResult.Value);
        Assert.True(apiResponse.Success);
        Assert.Equal("Electronics", apiResponse.Data!.Name);
        Assert.Equal("Active", apiResponse.Data.Status);
        Assert.True(apiResponse.Data.IsActive);
        Assert.Equal(1, apiResponse.Data.TenantId);
    }

    [Fact]
    public async Task CreateCategory_WithDuplicateNameInSameTenant_ReturnsBadRequestConflict()
    {
        await _repository.AddAsync(new ProductCategory
        {
            TenantId = 1,
            Name = "Hardware",
            Status = "Active"
        });

        var request = new CreateCategoryRequest { Name = "hardware" };
        var response = await _controller.CreateCategory(request);

        var badRequest = Assert.IsType<BadRequestObjectResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<ProductCategoryDto>>(badRequest.Value);
        Assert.False(apiResponse.Success);
        Assert.Contains("already exists", apiResponse.Errors!.First(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task CreateCategory_WithSameNameInDifferentTenants_Succeeds()
    {
        await _repository.AddAsync(new ProductCategory
        {
            TenantId = 2,
            Name = "Services",
            Status = "Active"
        });

        var request = new CreateCategoryRequest { Name = "Services" };
        var response = await _controller.CreateCategory(request);

        var createdResult = Assert.IsType<CreatedAtActionResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<ProductCategoryDto>>(createdResult.Value);
        Assert.True(apiResponse.Success);
        Assert.Equal("Services", apiResponse.Data!.Name);
    }

    [Fact]
    public async Task CreateCategory_WithEmptyName_ReturnsBadRequest()
    {
        var request = new CreateCategoryRequest { Name = "" };
        var response = await _controller.CreateCategory(request);

        var badRequest = Assert.IsType<BadRequestObjectResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<ProductCategoryDto>>(badRequest.Value);
        Assert.False(apiResponse.Success);
        Assert.Contains("Category name is required", apiResponse.Errors!.First());
    }

    #endregion

    #region IBMSBE-014: GET Categories List & Details

    [Fact]
    public async Task GetCategories_ReturnsAllCategoriesWithProductCounts()
    {
        var cat1 = await _repository.AddAsync(new ProductCategory { TenantId = 1, Name = "Books", Status = "Active" });
        var cat2 = await _repository.AddAsync(new ProductCategory { TenantId = 1, Name = "Clothing", Status = "Active" });

        _repository.Products.Add(new Product { Id = 1, TenantId = 1, ProductCode = "B-01", Name = "C# Book", CategoryId = cat1.Id });
        _repository.Products.Add(new Product { Id = 2, TenantId = 1, ProductCode = "B-02", Name = "SQL Book", CategoryId = cat1.Id });

        var response = await _controller.GetCategories();

        var okResult = Assert.IsType<OkObjectResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<List<ProductCategoryDto>>>(okResult.Value);
        Assert.True(apiResponse.Success);
        Assert.Equal(2, apiResponse.Data!.Count);

        var booksCat = apiResponse.Data.First(c => c.Name == "Books");
        Assert.Equal(2, booksCat.ProductCount);

        var clothingCat = apiResponse.Data.First(c => c.Name == "Clothing");
        Assert.Equal(0, clothingCat.ProductCount);
    }

    [Fact]
    public async Task GetCategories_WithSearchFilter_ReturnsFilteredCategories()
    {
        await _repository.AddAsync(new ProductCategory { TenantId = 1, Name = "Software Licenses" });
        await _repository.AddAsync(new ProductCategory { TenantId = 1, Name = "Hardware Tools" });

        var response = await _controller.GetCategories(search: "Software");

        var okResult = Assert.IsType<OkObjectResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<List<ProductCategoryDto>>>(okResult.Value);
        Assert.Single(apiResponse.Data!);
        Assert.Equal("Software Licenses", apiResponse.Data![0].Name);
    }

    [Fact]
    public async Task GetCategories_WithStatusFilter_ReturnsMatchingCategories()
    {
        await _repository.AddAsync(new ProductCategory { TenantId = 1, Name = "Active Cat", Status = "Active" });
        await _repository.AddAsync(new ProductCategory { TenantId = 1, Name = "Inactive Cat", Status = "Inactive" });

        var response = await _controller.GetCategories(status: "Inactive");

        var okResult = Assert.IsType<OkObjectResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<List<ProductCategoryDto>>>(okResult.Value);
        Assert.Single(apiResponse.Data!);
        Assert.Equal("Inactive Cat", apiResponse.Data![0].Name);
    }

    [Fact]
    public async Task GetCategories_Paged_ReturnsPaginatedResult()
    {
        for (int i = 1; i <= 15; i++)
        {
            await _repository.AddAsync(new ProductCategory { TenantId = 1, Name = $"Category {i:D2}", Status = "Active" });
        }

        var response = await _controller.GetCategories(pageNumber: 2, pageSize: 5, paged: true);

        var okResult = Assert.IsType<OkObjectResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<PagedResult<ProductCategoryDto>>>(okResult.Value);
        Assert.True(apiResponse.Success);
        Assert.Equal(15, apiResponse.Data!.TotalCount);
        Assert.Equal(5, apiResponse.Data.Items.Count);
        Assert.Equal(2, apiResponse.Data.PageNumber);
        Assert.True(apiResponse.Data.HasPreviousPage);
        Assert.True(apiResponse.Data.HasNextPage);
    }

    [Fact]
    public async Task GetCategoryById_ValidId_ReturnsCategoryDetails()
    {
        var category = await _repository.AddAsync(new ProductCategory
        {
            TenantId = 1,
            Name = "Consulting",
            Description = "Advisory services",
            Status = "Active"
        });

        var response = await _controller.GetCategoryById(category.Id);

        var okResult = Assert.IsType<OkObjectResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<ProductCategoryDto>>(okResult.Value);
        Assert.True(apiResponse.Success);
        Assert.Equal("Consulting", apiResponse.Data!.Name);
        Assert.Equal("Advisory services", apiResponse.Data.Description);
    }

    [Fact]
    public async Task GetCategoryById_CrossTenantAccess_ReturnsNotFound()
    {
        var category = await _repository.AddAsync(new ProductCategory
        {
            TenantId = 2,
            Name = "Tenant 2 Category",
            Status = "Active"
        });

        var response = await _controller.GetCategoryById(category.Id);

        Assert.IsType<NotFoundObjectResult>(response);
    }

    #endregion

    #region IBMSBE-014: PUT Update Category

    [Fact]
    public async Task UpdateCategory_WithValidData_UpdatesCategorySuccessfully()
    {
        var category = await _repository.AddAsync(new ProductCategory
        {
            TenantId = 1,
            Name = "Initial Name",
            Description = "Old Desc",
            Status = "Active"
        });

        var updateReq = new UpdateCategoryRequest
        {
            Name = "Updated Name",
            Description = "New Desc",
            Status = "Active"
        };

        var response = await _controller.UpdateCategory(category.Id, updateReq);

        var okResult = Assert.IsType<OkObjectResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<ProductCategoryDto>>(okResult.Value);
        Assert.True(apiResponse.Success);
        Assert.Equal("Updated Name", apiResponse.Data!.Name);
        Assert.Equal("New Desc", apiResponse.Data.Description);
    }

    [Fact]
    public async Task UpdateCategory_WithDuplicateName_ReturnsBadRequestConflict()
    {
        await _repository.AddAsync(new ProductCategory { TenantId = 1, Name = "Existing Cat" });
        var targetCat = await _repository.AddAsync(new ProductCategory { TenantId = 1, Name = "My Cat" });

        var updateReq = new UpdateCategoryRequest { Name = "Existing Cat" };
        var response = await _controller.UpdateCategory(targetCat.Id, updateReq);

        var badRequest = Assert.IsType<BadRequestObjectResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<ProductCategoryDto>>(badRequest.Value);
        Assert.False(apiResponse.Success);
        Assert.Contains("already exists", apiResponse.Errors!.First(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task UpdateCategory_KeepSameName_Succeeds()
    {
        var category = await _repository.AddAsync(new ProductCategory
        {
            TenantId = 1,
            Name = "Keep My Name",
            Description = "Old desc"
        });

        var updateReq = new UpdateCategoryRequest
        {
            Name = "Keep My Name",
            Description = "New desc"
        };

        var response = await _controller.UpdateCategory(category.Id, updateReq);

        var okResult = Assert.IsType<OkObjectResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<ProductCategoryDto>>(okResult.Value);
        Assert.True(apiResponse.Success);
        Assert.Equal("New desc", apiResponse.Data!.Description);
    }

    #endregion

    #region IBMSBE-014: Activate / Deactivate Category

    [Fact]
    public async Task ActivateCategory_SetsStatusToActive()
    {
        var category = await _repository.AddAsync(new ProductCategory
        {
            TenantId = 1,
            Name = "Seasonal Items",
            Status = "Inactive"
        });

        var response = await _controller.UpdateCategoryStatus(category.Id, CategoryStatus.Active);

        var okResult = Assert.IsType<OkObjectResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<ProductCategoryDto>>(okResult.Value);
        Assert.True(apiResponse.Success);
        Assert.Equal("Active", apiResponse.Data!.Status);
        Assert.True(apiResponse.Data.IsActive);
    }

    [Fact]
    public async Task DeactivateCategory_SetsStatusToInactiveAndPreservesProducts()
    {
        var category = await _repository.AddAsync(new ProductCategory
        {
            TenantId = 1,
            Name = "Archived Category",
            Status = "Active"
        });

        _repository.Products.Add(new Product
        {
            Id = 1,
            TenantId = 1,
            ProductCode = "P-ARC",
            Name = "Archived Item",
            CategoryId = category.Id,
            Status = "Active"
        });

        var response = await _controller.UpdateCategoryStatus(category.Id, CategoryStatus.Inactive);

        var okResult = Assert.IsType<OkObjectResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<ProductCategoryDto>>(okResult.Value);
        Assert.True(apiResponse.Success);
        Assert.Equal("Inactive", apiResponse.Data!.Status);
        Assert.False(apiResponse.Data.IsActive);
        Assert.Equal(1, apiResponse.Data.ProductCount);

        // Verify product still references category and is not deleted
        Assert.Single(_repository.Products);
        Assert.Equal(category.Id, _repository.Products[0].CategoryId);
    }

    [Fact]
    public async Task UpdateCategoryStatus_ViaPatchStatus_UpdatesCorrectly()
    {
        var category = await _repository.AddAsync(new ProductCategory
        {
            TenantId = 1,
            Name = "Toggle Category",
            Status = "Active"
        });

        var response = await _controller.UpdateCategoryStatus(category.Id, CategoryStatus.Inactive);

        var okResult = Assert.IsType<OkObjectResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<ProductCategoryDto>>(okResult.Value);
        Assert.True(apiResponse.Success);
        Assert.Equal("Inactive", apiResponse.Data!.Status);
    }

    #endregion

    #region Tenant Isolation

    [Fact]
    public async Task TenantIsolation_CategoriesAreStrictlyScopedToTenant()
    {
        await _repository.AddAsync(new ProductCategory { TenantId = 1, Name = "Tenant 1 Only" });
        await _repository.AddAsync(new ProductCategory { TenantId = 2, Name = "Tenant 2 Only" });

        var response = await _controller.GetCategories();

        var okResult = Assert.IsType<OkObjectResult>(response);
        var apiResponse = Assert.IsType<ApiResponse<List<ProductCategoryDto>>>(okResult.Value);
        Assert.Single(apiResponse.Data!);
        Assert.Equal("Tenant 1 Only", apiResponse.Data![0].Name);
    }

    #endregion
}
