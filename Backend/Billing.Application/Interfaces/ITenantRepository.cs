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
    Task<(List<Tenant> Items, int TotalCount)> GetPagedAsync(string? search, string? status, int pageNumber, int pageSize);
    Task<int> GetCountByStatusAsync(string? status = null);
    Task<List<User>> GetTenantAdminsAsync(int tenantId);
    Task<Tenant?> GetByIdempotencyKeyAsync(string idempotencyKey);
}
