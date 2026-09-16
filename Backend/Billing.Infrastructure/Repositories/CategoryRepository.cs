using Billing.Application.Interfaces;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Repositories;

/// <summary>
/// EF Core implementation of ICategoryRepository with strict tenant isolation and index optimization.
/// </summary>
public class CategoryRepository : ICategoryRepository
{
    private readonly BillingDbContext _context;

    public CategoryRepository(BillingDbContext context)
    {
        _context = context;
    }

    public async Task<ProductCategory?> GetByIdAsync(int id, int? tenantId = null)
    {
        var query = _context.ProductCategories.AsQueryable();
        if (tenantId.HasValue && tenantId.Value > 0)
        {
            query = query.Where(c => c.TenantId == tenantId.Value);
        }

        return await query.FirstOrDefaultAsync(c => c.Id == id);
    }

    public async Task<ProductCategory?> GetByNameAsync(string name, int tenantId)
    {
        var normalized = name.Trim().ToLowerInvariant();
        return await _context.ProductCategories
            .FirstOrDefaultAsync(c => c.TenantId == tenantId && c.Name.ToLower() == normalized);
    }

    public async Task<bool> ExistsByNameAsync(string name, int tenantId, int? excludeId = null)
    {
        var normalized = name.Trim().ToLowerInvariant();
        var query = _context.ProductCategories
            .Where(c => c.TenantId == tenantId && c.Name.ToLower() == normalized);

        if (excludeId.HasValue && excludeId.Value > 0)
        {
            query = query.Where(c => c.Id != excludeId.Value);
        }

        return await query.AnyAsync();
    }

    public async Task<List<ProductCategory>> GetAllAsync(int? tenantId, string? search = null, string? status = null, bool? isActive = null)
    {
        var query = BuildFilteredQuery(tenantId, search, status, isActive);
        return await query.OrderBy(c => c.Name).ToListAsync();
    }

    public async Task<(List<ProductCategory> Items, int TotalCount)> GetPagedListAsync(
        int? tenantId,
        string? search,
        string? status,
        bool? isActive,
        int pageNumber,
        int pageSize,
        string? sortBy,
        string? sortOrder)
    {
        var query = BuildFilteredQuery(tenantId, search, status, isActive);

        var totalCount = await query.CountAsync();

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

        var items = await query
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return (items, totalCount);
    }

    public async Task<ProductCategory> AddAsync(ProductCategory category)
    {
        _context.ProductCategories.Add(category);
        await _context.SaveChangesAsync();
        return category;
    }

    public async Task<ProductCategory> UpdateAsync(ProductCategory category)
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

    private IQueryable<ProductCategory> BuildFilteredQuery(int? tenantId, string? search, string? status, bool? isActive)
    {
        var query = _context.ProductCategories.AsNoTracking().AsQueryable();

        if (tenantId.HasValue && tenantId.Value > 0)
        {
            query = query.Where(c => c.TenantId == tenantId.Value);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = $"%{search.Trim()}%";
            query = query.Where(c =>
                EF.Functions.Like(c.Name, term) ||
                (c.Description != null && EF.Functions.Like(c.Description, term)));
        }

        if (isActive.HasValue)
        {
            var targetStatus = isActive.Value ? "Active" : "Inactive";
            query = query.Where(c => c.Status == targetStatus);
        }
        else if (!string.IsNullOrWhiteSpace(status) && !string.Equals(status, "all", StringComparison.OrdinalIgnoreCase))
        {
            var s = status.Trim();
            if (string.Equals(s, "active", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(c => c.Status == "Active");
            }
            else if (string.Equals(s, "inactive", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(c => c.Status == "Inactive");
            }
        }

        return query;
    }
}
