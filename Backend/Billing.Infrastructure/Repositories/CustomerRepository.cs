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

    public async Task<Customer?> GetByIdForUpdateAsync(int id, int? tenantId = null)
    {
        var query = _context.Customers
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
            var targetStatus = query.IsActive.Value ? "Active" : "Inactive";
            queryable = queryable.Where(c => c.Status == targetStatus);
        }

        if (!string.IsNullOrWhiteSpace(query.CustomerType) && !string.Equals(query.CustomerType.Trim(), "all", StringComparison.OrdinalIgnoreCase))
        {
            var customerType = query.CustomerType.Trim();
            queryable = queryable.Where(c => c.CustomerType.ToLower() == customerType.ToLower());
        }

        var effectiveTaxFilter = !string.IsNullOrWhiteSpace(query.TaxRegistration)
            ? query.TaxRegistration.Trim()
            : (!string.IsNullOrWhiteSpace(query.TaxId) ? query.TaxId.Trim() : null);

        if (!string.IsNullOrWhiteSpace(effectiveTaxFilter) && !string.Equals(effectiveTaxFilter, "all", StringComparison.OrdinalIgnoreCase))
        {
            var taxLower = effectiveTaxFilter.ToLower();
            if (taxLower is "registered" or "yes" or "true")
            {
                queryable = queryable.Where(c => c.TaxId != null && c.TaxId != "");
            }
            else if (taxLower is "unregistered" or "no" or "false")
            {
                queryable = queryable.Where(c => c.TaxId == null || c.TaxId == "");
            }
            else
            {
                queryable = queryable.Where(c => c.TaxId != null && c.TaxId.ToLower().Contains(taxLower));
            }
        }

        if (!string.IsNullOrWhiteSpace(query.Outstanding) && !string.Equals(query.Outstanding.Trim(), "all", StringComparison.OrdinalIgnoreCase))
        {
            var outLower = query.Outstanding.Trim().ToLower().Replace("-", "").Replace("_", "").Replace(" ", "");
            if (outLower is "hasbalance" or "withbalance" or "unpaid" or "yes" or "true" or "hasoutstanding")
            {
                // In Phase 3, invoices/payments do not exist yet, so no customers have outstanding balances > 0
                queryable = queryable.Where(c => false);
            }
            else if (outLower is "none" or "nobalance" or "paid" or "zero" or "no" or "false" or "nooutstanding")
            {
                // All customers currently have 0 balance, keep all
            }
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
        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (IsDuplicateKeyException(ex))
        {
            throw new Billing.Application.Common.DuplicateCustomerCodeException(
                $"Customer with code '{customer.CustomerCode}' already exists for this tenant.", ex);
        }
    }

    public async Task UpdateAsync(Customer customer)
    {
        var entry = _context.Entry(customer);
        if (entry.State == EntityState.Detached)
        {
            _context.Customers.Update(customer);
        }

        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException ex)
        {
            throw new Billing.Application.Common.ConcurrencyConflictException(
                "The customer record has been modified by another process. Please reload and try again.", ex);
        }
        catch (DbUpdateException ex) when (IsDuplicateKeyException(ex))
        {
            throw new Billing.Application.Common.DuplicateCustomerCodeException(
                $"Customer with code '{customer.CustomerCode}' already exists for this tenant.", ex);
        }
    }

    private static bool IsDuplicateKeyException(DbUpdateException ex)
    {
        var message = ex.InnerException?.Message ?? ex.Message;
        return message.Contains("Duplicate entry", StringComparison.OrdinalIgnoreCase) ||
               message.Contains("IX_Customers_TenantId_CustomerCode", StringComparison.OrdinalIgnoreCase);
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
