using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

/// <summary>
/// Repository contract for managing ProductCategory entities with tenant isolation.
/// </summary>
public interface ICategoryRepository
{
    /// <summary>
    /// Retrieve a category by its ID, scoped to tenant.
    /// </summary>
    Task<ProductCategory?> GetByIdAsync(int id, int? tenantId = null);

    /// <summary>
    /// Retrieve a category by its name, case-insensitively, scoped to tenant.
    /// </summary>
    Task<ProductCategory?> GetByNameAsync(string name, int tenantId);

    /// <summary>
    /// Check if a category with given name already exists in tenant, excluding optional category ID.
    /// </summary>
    Task<bool> ExistsByNameAsync(string name, int tenantId, int? excludeId = null);

    /// <summary>
    /// Retrieve all categories for tenant with optional filters and sorting.
    /// </summary>
    Task<List<ProductCategory>> GetAllAsync(int? tenantId, string? search = null, string? status = null, bool? isActive = null);

    /// <summary>
    /// Retrieve paginated categories for tenant with search, filtering, and sorting.
    /// </summary>
    Task<(List<ProductCategory> Items, int TotalCount)> GetPagedListAsync(
        int? tenantId,
        string? search,
        string? status,
        bool? isActive,
        int pageNumber,
        int pageSize,
        string? sortBy,
        string? sortOrder);

    /// <summary>
    /// Add a new category to the database.
    /// </summary>
    Task<ProductCategory> AddAsync(ProductCategory category);

    /// <summary>
    /// Update existing category in the database.
    /// </summary>
    Task<ProductCategory> UpdateAsync(ProductCategory category);

    /// <summary>
    /// Count the number of active and total products referencing this category.
    /// </summary>
    Task<int> CountProductsByCategoryIdAsync(int categoryId, int tenantId);
}
