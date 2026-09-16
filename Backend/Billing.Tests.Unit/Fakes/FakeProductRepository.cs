using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Domain.Entities;

namespace Billing.Tests.Unit.Fakes;

public class FakeProductRepository : IProductRepository
{
    public List<Product> Products { get; } = new();
    public List<ProductCategory> Categories { get; } = new();

    public Task<Product?> GetByIdAsync(int id, int? tenantId = null)
    {
        var product = Products.FirstOrDefault(p =>
            p.Id == id &&
            (!tenantId.HasValue || tenantId.Value <= 0 || p.TenantId == tenantId.Value));

        return Task.FromResult(product);
    }

    public Task<Product?> GetByIdForUpdateAsync(int id, int? tenantId = null)
    {
        return GetByIdAsync(id, tenantId);
    }

    public Task<Product?> GetByCodeAsync(string productCode, int? tenantId = null)
    {
        var normalized = productCode.Trim().ToLowerInvariant();
        var product = Products.FirstOrDefault(p =>
            p.ProductCode.ToLowerInvariant() == normalized &&
            (!tenantId.HasValue || tenantId.Value <= 0 || p.TenantId == tenantId.Value));

        return Task.FromResult(product);
    }

    public Task<(List<Product> Items, int TotalCount)> GetPagedListAsync(int? tenantId, ProductQueryParameters query)
    {
        var queryable = Products.AsQueryable();

        if (tenantId.HasValue && tenantId.Value > 0)
        {
            queryable = queryable.Where(p => p.TenantId == tenantId.Value);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var search = query.Search.Trim().ToLowerInvariant();
            queryable = queryable.Where(p =>
                p.ProductCode.ToLowerInvariant().Contains(search) ||
                p.Name.ToLowerInvariant().Contains(search) ||
                (p.Description != null && p.Description.ToLowerInvariant().Contains(search)) ||
                (p.HsnSacCode != null && p.HsnSacCode.ToLowerInvariant().Contains(search)));
        }

        if (query.CategoryId.HasValue && query.CategoryId.Value > 0)
        {
            queryable = queryable.Where(p => p.CategoryId == query.CategoryId.Value);
        }
        else if (!string.IsNullOrWhiteSpace(query.Category))
        {
            var cat = query.Category.Trim().ToLowerInvariant();
            queryable = queryable.Where(p => (p.Category != null && p.Category.ToLowerInvariant() == cat) ||
                                             (p.ProductCategory != null && p.ProductCategory.Name.ToLowerInvariant() == cat));
        }

        if (!string.IsNullOrWhiteSpace(query.Type) && !query.Type.Equals("All", StringComparison.OrdinalIgnoreCase))
        {
            var type = query.Type.Trim().ToLowerInvariant();
            queryable = queryable.Where(p => p.Type.ToLowerInvariant() == type);
        }

        if (query.IsActive.HasValue)
        {
            var targetStatus = query.IsActive.Value ? "Active" : "Inactive";
            queryable = queryable.Where(p => p.Status.Equals(targetStatus, StringComparison.OrdinalIgnoreCase));
        }
        else if (!string.IsNullOrWhiteSpace(query.Status) && !query.Status.Equals("All", StringComparison.OrdinalIgnoreCase))
        {
            var status = query.Status.Trim().ToLowerInvariant();
            queryable = queryable.Where(p => p.Status.ToLowerInvariant() == status);
        }

        var sortBy = query.SortBy?.Trim().ToLowerInvariant() ?? "createdat";
        var isDescending = string.Equals(query.SortOrder, "desc", StringComparison.OrdinalIgnoreCase) ||
                           string.IsNullOrWhiteSpace(query.SortOrder);

        queryable = (sortBy, isDescending) switch
        {
            ("name", false) => queryable.OrderBy(p => p.Name),
            ("name", true) => queryable.OrderByDescending(p => p.Name),
            ("price", false) => queryable.OrderBy(p => p.Price),
            ("price", true) => queryable.OrderByDescending(p => p.Price),
            ("productcode" or "code", false) => queryable.OrderBy(p => p.ProductCode),
            ("productcode" or "code", true) => queryable.OrderByDescending(p => p.ProductCode),
            ("category", false) => queryable.OrderBy(p => p.Category ?? (p.ProductCategory != null ? p.ProductCategory.Name : string.Empty)),
            ("category", true) => queryable.OrderByDescending(p => p.Category ?? (p.ProductCategory != null ? p.ProductCategory.Name : string.Empty)),
            ("updatedat", false) => queryable.OrderBy(p => p.UpdatedAtUtc),
            ("updatedat", true) => queryable.OrderByDescending(p => p.UpdatedAtUtc),
            ("createdat", false) => queryable.OrderBy(p => p.CreatedAtUtc),
            _ => queryable.OrderByDescending(p => p.CreatedAtUtc)
        };

        var total = queryable.Count();
        var page = query.PageNumber < 1 ? 1 : query.PageNumber;
        var pageSize = query.PageSize < 1 ? 10 : query.PageSize;

        var items = queryable.Skip((page - 1) * pageSize).Take(pageSize).ToList();
        return Task.FromResult((items, total));
    }

    public Task<Product> AddAsync(Product product)
    {
        if (product.Id == 0)
        {
            product.Id = Products.Count > 0 ? Products.Max(p => p.Id) + 1 : 1;
        }

        Products.Add(product);
        return Task.FromResult(product);
    }

    public Task<Product> UpdateAsync(Product product)
    {
        var idx = Products.FindIndex(p => p.Id == product.Id);
        if (idx >= 0)
        {
            Products[idx] = product;
        }
        return Task.FromResult(product);
    }

    public Task<ProductCategory?> GetCategoryByIdAsync(int categoryId, int tenantId)
    {
        var category = Categories.FirstOrDefault(c => c.Id == categoryId && c.TenantId == tenantId);
        return Task.FromResult(category);
    }

    public Task<ProductCategory?> GetCategoryByNameAsync(string categoryName, int tenantId)
    {
        var normalized = categoryName.Trim().ToLowerInvariant();
        var category = Categories.FirstOrDefault(c =>
            c.TenantId == tenantId &&
            c.Name.ToLowerInvariant() == normalized);

        return Task.FromResult(category);
    }

    public Task<ProductCategory> AddCategoryAsync(ProductCategory category)
    {
        if (category.Id == 0)
        {
            category.Id = Categories.Count > 0 ? Categories.Max(c => c.Id) + 1 : 1;
        }
        Categories.Add(category);
        return Task.FromResult(category);
    }

    public Task<List<ProductCategory>> GetCategoriesListAsync(int? tenantId)
    {
        var list = Categories.AsQueryable();
        if (tenantId.HasValue && tenantId.Value > 0)
        {
            list = list.Where(c => c.TenantId == tenantId.Value);
        }
        return Task.FromResult(list.OrderBy(c => c.Name).ToList());
    }

    public Task<ProductCategory> UpdateCategoryAsync(ProductCategory category)
    {
        var idx = Categories.FindIndex(c => c.Id == category.Id);
        if (idx >= 0)
        {
            Categories[idx] = category;
        }
        return Task.FromResult(category);
    }

    public Task<int> CountProductsByCategoryIdAsync(int categoryId, int tenantId)
    {
        var count = Products.Count(p => p.CategoryId == categoryId && p.TenantId == tenantId);
        return Task.FromResult(count);
    }
}
