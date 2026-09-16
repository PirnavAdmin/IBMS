using Billing.Contracts;
using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IProductRepository
{
    Task<Product?> GetByIdAsync(int id, int? tenantId = null);

    Task<Product?> GetByIdForUpdateAsync(int id, int? tenantId = null);

    Task<Product?> GetByCodeAsync(string productCode, int? tenantId = null);

    Task<(List<Product> Items, int TotalCount)> GetPagedListAsync(int? tenantId, ProductQueryParameters query);

    Task<Product> AddAsync(Product product);

    Task<Product> UpdateAsync(Product product);

    Task<ProductCategory?> GetCategoryByIdAsync(int categoryId, int tenantId);

    Task<ProductCategory?> GetCategoryByNameAsync(string categoryName, int tenantId);

    Task<ProductCategory> AddCategoryAsync(ProductCategory category);

    Task<List<ProductCategory>> GetCategoriesListAsync(int? tenantId);

    Task<ProductCategory> UpdateCategoryAsync(ProductCategory category);

    Task<int> CountProductsByCategoryIdAsync(int categoryId, int tenantId);
}
