using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IAuditLogRepository
{
    Task AddAsync(AuditLog log, CancellationToken cancellationToken = default);
    Task<List<AuditLog>> GetByCustomerIdAsync(int tenantId, int customerId, CancellationToken cancellationToken = default);
    Task<List<AuditLog>> GetByEntityAsync(int tenantId, string entityName, string entityId, CancellationToken cancellationToken = default);
    Task<(List<AuditLog> Items, int TotalCount)> GetPagedAsync(int tenantId, int page, int pageSize, CancellationToken cancellationToken = default);
}
