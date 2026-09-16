using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Repositories;

public class ProductRepository : IProductRepository
{
    private readonly BillingDbContext _context;

    public ProductRepository(BillingDbContext context)
    {
        _context = context;
    }

    public async Task<Product?> GetByIdAsync(int id, int? tenantId = null)
    {
        var query = _context.Products
            .AsNoTracking()
            .Include(p => p.ProductCategory)
            .Where(p => p.Id == id);

        if (tenantId.HasValue && tenantId.Value > 0)
        {
            query = query.Where(p => p.TenantId == tenantId.Value);
        }

        return await query.FirstOrDefaultAsync();
    }

    public async Task<Product?> GetByIdForUpdateAsync(int id, int? tenantId = null)
    {
        var query = _context.Products
            .Include(p => p.ProductCategory)
            .Where(p => p.Id == id);

        if (tenantId.HasValue && tenantId.Value > 0)
        {
            query = query.Where(p => p.TenantId == tenantId.Value);
        }

        return await query.FirstOrDefaultAsync();
    }

    public async Task<Product?> GetByCodeAsync(string productCode, int? tenantId = null)
    {
        var normalizedCode = productCode.Trim().ToLowerInvariant();
        var query = _context.Products
            .Include(p => p.ProductCategory)
            .Where(p => p.ProductCode.ToLower() == normalizedCode);

        if (tenantId.HasValue && tenantId.Value > 0)
        {
            query = query.Where(p => p.TenantId == tenantId.Value);
        }

        return await query.FirstOrDefaultAsync();
    }

    public async Task<(List<Product> Items, int TotalCount)> GetPagedListAsync(int? tenantId, ProductQueryParameters query)
    {
        var queryable = _context.Products
            .AsNoTracking()
            .Include(p => p.ProductCategory)
            .AsQueryable();

        if (tenantId.HasValue && tenantId.Value > 0)
        {
            queryable = queryable.Where(p => p.TenantId == tenantId.Value);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var search = query.Search.Trim().ToLower();
            queryable = queryable.Where(p =>
                p.ProductCode.ToLower().Contains(search) ||
                p.Name.ToLower().Contains(search) ||
                (p.Description != null && p.Description.ToLower().Contains(search)) ||
                (p.HsnSacCode != null && p.HsnSacCode.ToLower().Contains(search)));
        }

        if (query.CategoryId.HasValue && query.CategoryId.Value > 0)
        {
            queryable = queryable.Where(p => p.CategoryId == query.CategoryId.Value);
        }
        else if (!string.IsNullOrWhiteSpace(query.Category))
        {
            var cat = query.Category.Trim().ToLower();
            queryable = queryable.Where(p => (p.Category != null && p.Category.ToLower() == cat) ||
                                             (p.ProductCategory != null && p.ProductCategory.Name.ToLower() == cat));
        }

        if (!string.IsNullOrWhiteSpace(query.Type) && !query.Type.Equals("All", StringComparison.OrdinalIgnoreCase))
        {
            var type = query.Type.Trim().ToLower();
            queryable = queryable.Where(p => p.Type.ToLower() == type);
        }

        if (query.IsActive.HasValue)
        {
            var targetStatus = query.IsActive.Value ? "Active" : "Inactive";
            queryable = queryable.Where(p => p.Status.ToLower() == targetStatus.ToLower());
        }
        else if (!string.IsNullOrWhiteSpace(query.Status) && !query.Status.Equals("All", StringComparison.OrdinalIgnoreCase))
        {
            var status = query.Status.Trim().ToLower();
            queryable = queryable.Where(p => p.Status.ToLower() == status);
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

        var totalCount = await queryable.CountAsync();

        var items = await queryable
            .Skip((query.PageNumber - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync();

        return (items, totalCount);
    }

    public async Task<Product> AddAsync(Product product)
    {
        _context.Products.Add(product);
        await _context.SaveChangesAsync();
        return product;
    }

    public async Task<Product> UpdateAsync(Product product)
    {
        _context.Products.Update(product);
        await _context.SaveChangesAsync();
        return product;
    }

    public async Task<ProductCategory?> GetCategoryByIdAsync(int categoryId, int tenantId)
    {
        return await _context.ProductCategories
            .FirstOrDefaultAsync(c => c.Id == categoryId && c.TenantId == tenantId);
    }

    public async Task<ProductCategory?> GetCategoryByNameAsync(string categoryName, int tenantId)
    {
        var normalized = categoryName.Trim().ToLowerInvariant();
        return await _context.ProductCategories
            .FirstOrDefaultAsync(c => c.TenantId == tenantId && c.Name.ToLower() == normalized);
    }

    public async Task<ProductCategory> AddCategoryAsync(ProductCategory category)
    {
        _context.ProductCategories.Add(category);
        await _context.SaveChangesAsync();
        return category;
    }

    public async Task<List<ProductCategory>> GetCategoriesListAsync(int? tenantId)
    {
        var query = _context.ProductCategories.AsNoTracking().AsQueryable();
        if (tenantId.HasValue && tenantId.Value > 0)
        {
            query = query.Where(c => c.TenantId == tenantId.Value);
        }
        return await query.OrderBy(c => c.Name).ToListAsync();
    }

    public async Task<ProductCategory> UpdateCategoryAsync(ProductCategory category)
    {
        _context.ProductCategories.Update(category);
        await _context.SaveChangesAsync();
        return category;
    }

    public async Task<int> CountProductsByCategoryIdAsync(int categoryId, int tenantId)
    {
        return await _context.Products
            .CountAsync(p => p.CategoryId == categoryId && p.TenantId == tenantId);
    }
}
