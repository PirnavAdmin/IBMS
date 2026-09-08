using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Repositories;

public class CustomerRepository : ICustomerRepository
{
    private readonly BillingDbContext _context;

    public CustomerRepository(BillingDbContext context)
    {
        _context = context;
    }

    public async Task<Customer?> GetByIdAsync(int id, int? tenantId = null)
    {
        var query = _context.Customers
            .AsNoTracking()
            .Include(c => c.Addresses)
            .Where(c => c.Id == id);

        if (tenantId.HasValue && tenantId.Value > 0)
        {
            query = query.Where(c => c.TenantId == tenantId.Value);
        }

        return await query.FirstOrDefaultAsync();
    }

    public async Task<Customer?> GetByEmailAsync(string email, int? tenantId = null)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();
        var query = _context.Customers
            .Include(c => c.Addresses)
            .Where(c => c.Email.ToLower() == normalizedEmail);

        if (tenantId.HasValue && tenantId.Value > 0)
        {
            query = query.Where(c => c.TenantId == tenantId.Value);
        }

        return await query.FirstOrDefaultAsync();
    }

    public async Task<Customer?> GetByCodeAsync(string customerCode, int? tenantId = null)
    {
        var normalizedCode = customerCode.Trim().ToLowerInvariant();
        var query = _context.Customers
            .Include(c => c.Addresses)
            .Where(c => c.CustomerCode.ToLower() == normalizedCode);

        if (tenantId.HasValue && tenantId.Value > 0)
        {
            query = query.Where(c => c.TenantId == tenantId.Value);
        }

        return await query.FirstOrDefaultAsync();
    }

    public async Task<(List<Customer> Items, int TotalCount)> GetPagedListAsync(int? tenantId, CustomerQueryParameters query)
    {
        var queryable = _context.Customers
            .AsNoTracking()
            .Include(c => c.Addresses)
            .AsQueryable();

        if (tenantId.HasValue && tenantId.Value > 0)
        {
            queryable = queryable.Where(c => c.TenantId == tenantId.Value);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var search = query.Search.Trim().ToLower();
            queryable = queryable.Where(c =>
                c.CustomerCode.ToLower().Contains(search) ||
                c.Name.ToLower().Contains(search) ||
                c.Email.ToLower().Contains(search) ||
                (c.Phone != null && c.Phone.ToLower().Contains(search)) ||
                (c.CompanyName != null && c.CompanyName.ToLower().Contains(search)) ||
                (c.TaxId != null && c.TaxId.ToLower().Contains(search)));
        }

        if (query.IsActive.HasValue)
        {
            queryable = queryable.Where(c => c.IsActive == query.IsActive.Value);
        }

        var isAscending = string.Equals(query.SortOrder, "asc", StringComparison.OrdinalIgnoreCase);
        var sortBy = (query.SortBy ?? "createdat").Trim().ToLowerInvariant();

        queryable = sortBy switch
        {
            "code" or "customercode" => isAscending ? queryable.OrderBy(c => c.CustomerCode) : queryable.OrderByDescending(c => c.CustomerCode),
            "name" => isAscending ? queryable.OrderBy(c => c.Name) : queryable.OrderByDescending(c => c.Name),
            "email" => isAscending ? queryable.OrderBy(c => c.Email) : queryable.OrderByDescending(c => c.Email),
            "companyname" => isAscending ? queryable.OrderBy(c => c.CompanyName) : queryable.OrderByDescending(c => c.CompanyName),
            "updatedat" => isAscending ? queryable.OrderBy(c => c.UpdatedAtUtc) : queryable.OrderByDescending(c => c.UpdatedAtUtc),
            _ => isAscending ? queryable.OrderBy(c => c.CreatedAtUtc) : queryable.OrderByDescending(c => c.CreatedAtUtc)
        };

        var totalCount = await queryable.CountAsync();
        var skip = (query.PageNumber - 1) * query.PageSize;
        var items = await queryable.Skip(skip).Take(query.PageSize).ToListAsync();

        return (items, totalCount);
    }

    public async Task AddAsync(Customer customer)
    {
        await _context.Customers.AddAsync(customer);
        await _context.SaveChangesAsync();
    }

    public async Task UpdateAsync(Customer customer)
    {
        _context.Customers.Update(customer);
        await _context.SaveChangesAsync();
    }

    public async Task<bool> ExistsAsync(int id, int? tenantId = null)
    {
        var query = _context.Customers.Where(c => c.Id == id);
        if (tenantId.HasValue && tenantId.Value > 0)
        {
            query = query.Where(c => c.TenantId == tenantId.Value);
        }

        return await query.AnyAsync();
    }
}
