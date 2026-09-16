using Billing.Contracts;

namespace Billing.Application.Interfaces;

/// <summary>
/// Service contract for Category business logic, validation, tenant scoping, and status management.
/// </summary>
public interface ICategoryService
{
    /// <summary>
    /// Retrieve all categories for a tenant with optional filtering.
    /// </summary>
    Task<ApiResponse<List<ProductCategoryDto>>> GetAllCategoriesAsync(
        int? tenantId,
        string? search = null,
        string? status = null,
        bool? isActive = null);

    /// <summary>
    /// Retrieve a paginated list of categories with search, status filters, and sorting.
    /// </summary>
    Task<ApiResponse<PagedResult<ProductCategoryDto>>> GetPagedCategoriesAsync(
        int? tenantId,
        string? search,
        string? status,
        bool? isActive,
        int pageNumber,
        int pageSize,
        string? sortBy,
        string? sortOrder);

    /// <summary>
    /// Retrieve single category by ID with associated product count.
    /// </summary>
    Task<ApiResponse<ProductCategoryDto>> GetCategoryByIdAsync(int id, int? tenantId);

    /// <summary>
    /// Create a new category with tenant isolation and duplicate name prevention.
    /// </summary>
    Task<ApiResponse<ProductCategoryDto>> CreateCategoryAsync(CreateCategoryRequest request, int tenantId);

    /// <summary>
    /// Update existing category details (name, description, status) with duplicate validation.
    /// </summary>
    Task<ApiResponse<ProductCategoryDto>> UpdateCategoryAsync(int id, UpdateCategoryRequest request, int tenantId);

    /// <summary>
    /// Activate or deactivate a category safely, preserving existing products.
    /// </summary>
    Task<ApiResponse<ProductCategoryDto>> UpdateCategoryStatusAsync(int id, bool isActive, int tenantId);

    /// <summary>
    /// Activate a category.
    /// </summary>
    Task<ApiResponse<ProductCategoryDto>> ActivateCategoryAsync(int id, int tenantId);

    /// <summary>
    /// Deactivate a category safely without physical deletion.
    /// </summary>
    Task<ApiResponse<ProductCategoryDto>> DeactivateCategoryAsync(int id, int tenantId);
}
