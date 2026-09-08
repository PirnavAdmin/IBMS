using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface ITenantRepository
{
    Task<Tenant?> GetByIdAsync(int id);
    Task<Tenant?> GetByCodeAsync(string tenantCode);
    Task<List<Tenant>> GetAllAsync();
    Task CreateAsync(Tenant tenant);
    Task UpdateAsync(Tenant tenant);
    Task<bool> ExistsByCodeAsync(string tenantCode);
}
