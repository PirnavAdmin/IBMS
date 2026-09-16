using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Domain.Entities;

namespace Billing.Application.Services;

/// <summary>
/// Business logic and validation service for Product Categories (IBMSBE-014).
/// </summary>
public class CategoryService : ICategoryService
{
    private readonly ICategoryRepository _categoryRepository;

    public CategoryService(ICategoryRepository categoryRepository)
    {
        _categoryRepository = categoryRepository;
    }

    public async Task<ApiResponse<List<ProductCategoryDto>>> GetAllCategoriesAsync(
        int? tenantId,
        string? search = null,
        string? status = null,
        bool? isActive = null)
    {
        var categories = await _categoryRepository.GetAllAsync(tenantId, search, status, isActive);

        var dtos = new List<ProductCategoryDto>(categories.Count);
        foreach (var c in categories)
        {
            var count = await _categoryRepository.CountProductsByCategoryIdAsync(c.Id, c.TenantId);
            dtos.Add(MapToDto(c, count));
        }

        return ApiResponse<List<ProductCategoryDto>>.Ok(dtos, "Categories retrieved successfully.");
    }

    public async Task<ApiResponse<PagedResult<ProductCategoryDto>>> GetPagedCategoriesAsync(
        int? tenantId,
        string? search,
        string? status,
        bool? isActive,
        int pageNumber,
        int pageSize,
        string? sortBy,
        string? sortOrder)
    {
        if (pageNumber < 1) pageNumber = 1;
        if (pageSize < 1) pageSize = 10;
        if (pageSize > 100) pageSize = 100;

        var (items, totalCount) = await _categoryRepository.GetPagedListAsync(
            tenantId,
            search,
            status,
            isActive,
            pageNumber,
            pageSize,
            sortBy,
            sortOrder);

        var dtos = new List<ProductCategoryDto>(items.Count);
        foreach (var c in items)
        {
            var count = await _categoryRepository.CountProductsByCategoryIdAsync(c.Id, c.TenantId);
            dtos.Add(MapToDto(c, count));
        }

        var pagedResult = new PagedResult<ProductCategoryDto>(dtos, totalCount, pageNumber, pageSize);
        return ApiResponse<PagedResult<ProductCategoryDto>>.Ok(pagedResult, "Categories retrieved successfully.");
    }

    public async Task<ApiResponse<ProductCategoryDto>> GetCategoryByIdAsync(int id, int? tenantId)
    {
        if (id <= 0)
        {
            return ApiResponse<ProductCategoryDto>.Fail("Invalid identifier", "Category ID must be greater than 0.");
        }

        var category = await _categoryRepository.GetByIdAsync(id, tenantId);
        if (category == null)
        {
            return ApiResponse<ProductCategoryDto>.Fail("Category not found", $"Category with ID {id} was not found.");
        }

        var count = await _categoryRepository.CountProductsByCategoryIdAsync(category.Id, category.TenantId);
        return ApiResponse<ProductCategoryDto>.Ok(MapToDto(category, count), "Category retrieved successfully.");
    }

    public async Task<ApiResponse<ProductCategoryDto>> CreateCategoryAsync(CreateCategoryRequest request, int tenantId)
    {
        if (tenantId <= 0)
        {
            return ApiResponse<ProductCategoryDto>.Fail("Invalid tenant identifier", "A valid positive Tenant ID is required.");
        }

        if (request == null || string.IsNullOrWhiteSpace(request.Name))
        {
            return ApiResponse<ProductCategoryDto>.Fail("Validation failed", "Category name is required.");
        }

        var name = request.Name.Trim();
        if (name.Length < 2 || name.Length > 128)
        {
            return ApiResponse<ProductCategoryDto>.Fail("Validation failed", "Category name must be between 2 and 128 characters.");
        }

        var exists = await _categoryRepository.ExistsByNameAsync(name, tenantId);
        if (exists)
        {
            return ApiResponse<ProductCategoryDto>.Fail("Category name conflict", $"A category named '{name}' already exists for this tenant.");
        }

        var category = new ProductCategory
        {
            TenantId = tenantId,
            Name = name,
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            Status = string.IsNullOrWhiteSpace(request.Status) ? "Active" : request.Status.Trim(),
            CreatedAtUtc = DateTime.UtcNow
        };

        var created = await _categoryRepository.AddAsync(category);
        return ApiResponse<ProductCategoryDto>.Ok(MapToDto(created, 0), "Category created successfully.");
    }

    public async Task<ApiResponse<ProductCategoryDto>> UpdateCategoryAsync(int id, UpdateCategoryRequest request, int tenantId)
    {
        if (id <= 0)
        {
            return ApiResponse<ProductCategoryDto>.Fail("Invalid identifier", "Category ID must be greater than 0.");
        }

        if (tenantId <= 0)
        {
            return ApiResponse<ProductCategoryDto>.Fail("Invalid tenant identifier", "A valid positive Tenant ID is required.");
        }

        if (request == null || string.IsNullOrWhiteSpace(request.Name))
        {
            return ApiResponse<ProductCategoryDto>.Fail("Validation failed", "Category name is required.");
        }

        var name = request.Name.Trim();
        if (name.Length < 2 || name.Length > 128)
        {
            return ApiResponse<ProductCategoryDto>.Fail("Validation failed", "Category name must be between 2 and 128 characters.");
        }

        var category = await _categoryRepository.GetByIdAsync(id, tenantId);
        if (category == null)
        {
            return ApiResponse<ProductCategoryDto>.Fail("Category not found", $"Category with ID {id} was not found for this tenant.");
        }

        var duplicateExists = await _categoryRepository.ExistsByNameAsync(name, tenantId, excludeId: id);
        if (duplicateExists)
        {
            return ApiResponse<ProductCategoryDto>.Fail("Category name conflict", $"Another category named '{name}' already exists for this tenant.");
        }

        category.Name = name;
        category.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();

        if (request.IsActive.HasValue)
        {
            category.Status = request.IsActive.Value ? "Active" : "Inactive";
        }
        else if (!string.IsNullOrWhiteSpace(request.Status))
        {
            category.Status = request.Status.Trim();
        }

        var updated = await _categoryRepository.UpdateAsync(category);
        var count = await _categoryRepository.CountProductsByCategoryIdAsync(updated.Id, tenantId);

        return ApiResponse<ProductCategoryDto>.Ok(MapToDto(updated, count), "Category updated successfully.");
    }

    public async Task<ApiResponse<ProductCategoryDto>> UpdateCategoryStatusAsync(int id, bool isActive, int tenantId)
    {
        if (id <= 0)
        {
            return ApiResponse<ProductCategoryDto>.Fail("Invalid identifier", "Category ID must be greater than 0.");
        }

        if (tenantId <= 0)
        {
            return ApiResponse<ProductCategoryDto>.Fail("Invalid tenant identifier", "A valid positive Tenant ID is required.");
        }

        var category = await _categoryRepository.GetByIdAsync(id, tenantId);
        if (category == null)
        {
            return ApiResponse<ProductCategoryDto>.Fail("Category not found", $"Category with ID {id} was not found for this tenant.");
        }

        category.Status = isActive ? "Active" : "Inactive";
        var updated = await _categoryRepository.UpdateAsync(category);
        var count = await _categoryRepository.CountProductsByCategoryIdAsync(id, tenantId);

        var actionText = isActive ? "activated" : "deactivated";
        return ApiResponse<ProductCategoryDto>.Ok(
            MapToDto(updated, count),
            $"Category '{category.Name}' {actionText} successfully. ({count} products currently in this category).");
    }

    public Task<ApiResponse<ProductCategoryDto>> ActivateCategoryAsync(int id, int tenantId)
        => UpdateCategoryStatusAsync(id, isActive: true, tenantId);

    public Task<ApiResponse<ProductCategoryDto>> DeactivateCategoryAsync(int id, int tenantId)
        => UpdateCategoryStatusAsync(id, isActive: false, tenantId);

    private static ProductCategoryDto MapToDto(ProductCategory c, int productCount = 0)
    {
        return new ProductCategoryDto
        {
            Id = c.Id,
            TenantId = c.TenantId,
            Name = c.Name,
            Description = c.Description,
            Status = c.Status,
            IsActive = string.Equals(c.Status, "Active", StringComparison.OrdinalIgnoreCase),
            ProductCount = productCount,
            CreatedAtUtc = c.CreatedAtUtc
        };
    }
}
