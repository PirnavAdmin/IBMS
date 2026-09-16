using Billing.Application.Interfaces;
using Billing.Domain.Entities;

namespace Billing.Tests.Unit.Fakes;

public class FakeCategoryRepository : ICategoryRepository
{
    public List<ProductCategory> Categories { get; } = new();
    public List<Product> Products { get; } = new();
    private int _nextId = 1;

    public Task<ProductCategory?> GetByIdAsync(int id, int? tenantId = null)
    {
        var category = Categories.FirstOrDefault(c => c.Id == id && (!tenantId.HasValue || tenantId.Value <= 0 || c.TenantId == tenantId.Value));
        return Task.FromResult(category);
    }

    public Task<ProductCategory?> GetByNameAsync(string name, int tenantId)
    {
        var normalized = name.Trim().ToLowerInvariant();
        var category = Categories.FirstOrDefault(c => c.TenantId == tenantId && c.Name.Trim().ToLowerInvariant() == normalized);
        return Task.FromResult(category);
    }

    public Task<bool> ExistsByNameAsync(string name, int tenantId, int? excludeId = null)
    {
        var normalized = name.Trim().ToLowerInvariant();
        var exists = Categories.Any(c => c.TenantId == tenantId &&
                                         c.Name.Trim().ToLowerInvariant() == normalized &&
                                         (!excludeId.HasValue || c.Id != excludeId.Value));
        return Task.FromResult(exists);
    }

    public Task<List<ProductCategory>> GetAllAsync(int? tenantId, string? search = null, string? status = null, bool? isActive = null)
    {
        var query = Categories.AsQueryable();

        if (tenantId.HasValue && tenantId.Value > 0)
        {
            query = query.Where(c => c.TenantId == tenantId.Value);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLowerInvariant();
            query = query.Where(c => c.Name.ToLowerInvariant().Contains(s) ||
                                     (c.Description != null && c.Description.ToLowerInvariant().Contains(s)));
        }

        if (isActive.HasValue)
        {
            var targetStatus = isActive.Value ? "Active" : "Inactive";
            query = query.Where(c => string.Equals(c.Status, targetStatus, StringComparison.OrdinalIgnoreCase));
        }
        else if (!string.IsNullOrWhiteSpace(status) && !string.Equals(status, "all", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(c => string.Equals(c.Status, status.Trim(), StringComparison.OrdinalIgnoreCase));
        }

        return Task.FromResult(query.OrderBy(c => c.Name).ToList());
    }

    public Task<(List<ProductCategory> Items, int TotalCount)> GetPagedListAsync(
        int? tenantId,
        string? search,
        string? status,
        bool? isActive,
        int pageNumber,
        int pageSize,
        string? sortBy,
        string? sortOrder)
    {
        var query = Categories.AsQueryable();

        if (tenantId.HasValue && tenantId.Value > 0)
        {
            query = query.Where(c => c.TenantId == tenantId.Value);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLowerInvariant();
            query = query.Where(c => c.Name.ToLowerInvariant().Contains(s) ||
                                     (c.Description != null && c.Description.ToLowerInvariant().Contains(s)));
        }

        if (isActive.HasValue)
        {
            var targetStatus = isActive.Value ? "Active" : "Inactive";
            query = query.Where(c => string.Equals(c.Status, targetStatus, StringComparison.OrdinalIgnoreCase));
        }
        else if (!string.IsNullOrWhiteSpace(status) && !string.Equals(status, "all", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(c => string.Equals(c.Status, status.Trim(), StringComparison.OrdinalIgnoreCase));
        }

        var totalCount = query.Count();
        var isDesc = string.Equals(sortOrder, "desc", StringComparison.OrdinalIgnoreCase);

        query = (sortBy?.Trim().ToLowerInvariant(), isDesc) switch
        {
            ("id", false) => query.OrderBy(c => c.Id),
            ("id", true) => query.OrderByDescending(c => c.Id),
            ("status", false) => query.OrderBy(c => c.Status),
            ("status", true) => query.OrderByDescending(c => c.Status),
            ("createdat", false) or ("createdatutc", false) => query.OrderBy(c => c.CreatedAtUtc),
            ("createdat", true) or ("createdatutc", true) => query.OrderByDescending(c => c.CreatedAtUtc),
            (_, true) => query.OrderByDescending(c => c.Name),
            _ => query.OrderBy(c => c.Name)
        };

        var items = query.Skip((pageNumber - 1) * pageSize).Take(pageSize).ToList();
        return Task.FromResult((items, totalCount));
    }

    public Task<ProductCategory> AddAsync(ProductCategory category)
    {
        category.Id = _nextId++;
        Categories.Add(category);
        return Task.FromResult(category);
    }

    public Task<ProductCategory> UpdateAsync(ProductCategory category)
    {
        var existingIndex = Categories.FindIndex(c => c.Id == category.Id);
        if (existingIndex >= 0)
        {
            Categories[existingIndex] = category;
        }
        return Task.FromResult(category);
    }

    public Task<int> CountProductsByCategoryIdAsync(int categoryId, int tenantId)
    {
        var count = Products.Count(p => p.CategoryId == categoryId && p.TenantId == tenantId);
        return Task.FromResult(count);
    }
}
