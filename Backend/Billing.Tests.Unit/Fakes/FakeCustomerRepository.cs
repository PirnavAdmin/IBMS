using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Domain.Entities;

namespace Billing.Tests.Unit.Fakes;

public class FakeCustomerRepository : ICustomerRepository
{
    public List<Customer> Customers { get; } = new();

    public Task<Customer?> GetByIdAsync(int id, int? tenantId = null)
    {
        var match = Customers.FirstOrDefault(c =>
            c.Id == id &&
            (!tenantId.HasValue || tenantId.Value <= 0 || c.TenantId == tenantId.Value));

        return Task.FromResult(match);
    }

    public Task<Customer?> GetByIdForUpdateAsync(int id, int? tenantId = null)
    {
        return GetByIdAsync(id, tenantId);
    }

    public Task<Customer?> GetByEmailAsync(string email, int? tenantId = null)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();
        var match = Customers.FirstOrDefault(c =>
            c.Email.ToLowerInvariant() == normalizedEmail &&
            (!tenantId.HasValue || tenantId.Value <= 0 || c.TenantId == tenantId.Value));

        return Task.FromResult(match);
    }

    public Task<Customer?> GetByCodeAsync(string customerCode, int? tenantId = null)
    {
        var normalizedCode = customerCode.Trim().ToLowerInvariant();
        var match = Customers.FirstOrDefault(c =>
            c.CustomerCode.ToLowerInvariant() == normalizedCode &&
            (!tenantId.HasValue || tenantId.Value <= 0 || c.TenantId == tenantId.Value));

        return Task.FromResult(match);
    }

    public Task<(List<Customer> Items, int TotalCount)> GetPagedListAsync(int? tenantId, CustomerQueryParameters query)
    {
        var queryable = Customers.AsQueryable();

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

        if (!string.IsNullOrWhiteSpace(query.CustomerType))
        {
            var customerType = query.CustomerType.Trim();
            queryable = queryable.Where(c => c.CustomerType.Equals(customerType, StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(query.TaxId))
        {
            var taxId = query.TaxId.Trim().ToLower();
            queryable = queryable.Where(c => c.TaxId != null && c.TaxId.ToLower().Contains(taxId));
        }

        var isAscending = string.Equals(query.SortOrder, "asc", StringComparison.OrdinalIgnoreCase);
        var sortBy = (query.SortBy ?? "createdat").Trim().ToLowerInvariant();

        queryable = sortBy switch
        {
            "name" => isAscending ? queryable.OrderBy(c => c.Name) : queryable.OrderByDescending(c => c.Name),
            "email" => isAscending ? queryable.OrderBy(c => c.Email) : queryable.OrderByDescending(c => c.Email),
            "companyname" => isAscending ? queryable.OrderBy(c => c.CompanyName) : queryable.OrderByDescending(c => c.CompanyName),
            "updatedat" => isAscending ? queryable.OrderBy(c => c.UpdatedAtUtc) : queryable.OrderByDescending(c => c.UpdatedAtUtc),
            _ => isAscending ? queryable.OrderBy(c => c.CreatedAtUtc) : queryable.OrderByDescending(c => c.CreatedAtUtc)
        };

        var totalCount = queryable.Count();
        var skip = (query.PageNumber - 1) * query.PageSize;
        var items = queryable.Skip(skip).Take(query.PageSize).ToList();

        return Task.FromResult((items, totalCount));
    }

    public Task AddAsync(Customer customer)
    {
        if (customer.Id == 0)
        {
            customer.Id = Customers.Any() ? Customers.Max(c => c.Id) + 1 : 1;
        }
        Customers.Add(customer);
        return Task.CompletedTask;
    }

    public Task UpdateAsync(Customer customer)
    {
        var existing = Customers.FirstOrDefault(c => c.Id == customer.Id);
        if (existing != null)
        {
            Customers.Remove(existing);
            Customers.Add(customer);
        }
        return Task.CompletedTask;
    }

    public Task<bool> ExistsAsync(int id, int? tenantId = null)
    {
        var exists = Customers.Any(c =>
            c.Id == id &&
            (!tenantId.HasValue || tenantId.Value <= 0 || c.TenantId == tenantId.Value));

        return Task.FromResult(exists);
    }
}
