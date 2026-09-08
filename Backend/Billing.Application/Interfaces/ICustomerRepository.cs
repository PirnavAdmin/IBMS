using Billing.Contracts;
using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface ICustomerRepository
{
    Task<Customer?> GetByIdAsync(int id, int? tenantId = null);

    Task<Customer?> GetByEmailAsync(string email, int? tenantId = null);

    Task<Customer?> GetByCodeAsync(string customerCode, int? tenantId = null);

    Task<(List<Customer> Items, int TotalCount)> GetPagedListAsync(int? tenantId, CustomerQueryParameters query);

    Task AddAsync(Customer customer);

    Task UpdateAsync(Customer customer);

    Task<bool> ExistsAsync(int id, int? tenantId = null);
}
