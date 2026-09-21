using Billing.Application.Interfaces;
using Billing.Domain.Entities;

namespace Billing.Tests.Unit.Fakes;

public class FakeAuditLogRepository : IAuditLogRepository
{
    private readonly List<AuditLog> _logs = new();
    public IReadOnlyList<AuditLog> Logs => _logs;

    public Task AddAsync(AuditLog log, CancellationToken cancellationToken = default)
    {
        _logs.Add(log);
        return Task.CompletedTask;
    }

    public Task<List<AuditLog>> GetByCustomerIdAsync(int tenantId, int customerId, CancellationToken cancellationToken = default)
    {
        return Task.FromResult(_logs.Where(l => l.TenantId == tenantId && l.CustomerId == customerId).ToList());
    }

    public Task<List<AuditLog>> GetByEntityAsync(int tenantId, string entityName, string entityId, CancellationToken cancellationToken = default)
    {
        return Task.FromResult(_logs.Where(l => l.TenantId == tenantId && l.EntityName == entityName && l.EntityId == entityId).ToList());
    }

    public Task<(List<AuditLog> Items, int TotalCount)> GetPagedAsync(int tenantId, int page, int pageSize, CancellationToken cancellationToken = default)
    {
        var tenantLogs = _logs.Where(l => l.TenantId == tenantId).ToList();
        var items = tenantLogs.Skip((page - 1) * pageSize).Take(pageSize).ToList();
        return Task.FromResult((items, tenantLogs.Count));
    }
}
