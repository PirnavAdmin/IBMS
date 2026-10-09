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

    public Task<(List<AuditLog> Items, int TotalCount)> GetFilteredPagedAsync(int tenantId, Billing.Contracts.AuditLogFilterRequest filter, CancellationToken cancellationToken = default)
    {
        var tenantLogs = _logs.Where(l => l.TenantId == tenantId).ToList();
        var page = filter.Page <= 0 ? 1 : filter.Page;
        var pageSize = filter.PageSize <= 0 ? 10 : filter.PageSize;
        var items = tenantLogs.Skip((page - 1) * pageSize).Take(pageSize).ToList();
        return Task.FromResult((items, tenantLogs.Count));
    }

    public Task<Billing.Contracts.AuditFilterOptionsResponse> GetFilterOptionsAsync(int tenantId, CancellationToken cancellationToken = default)
    {
        var tenantLogs = _logs.Where(l => l.TenantId == tenantId).ToList();
        var entityNames = tenantLogs.Where(l => !string.IsNullOrWhiteSpace(l.EntityName)).Select(l => l.EntityName.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(x => x).ToList();
        var actions = tenantLogs.Where(l => !string.IsNullOrWhiteSpace(l.Action)).Select(l => l.Action.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(x => x).ToList();
        var userNames = tenantLogs.Where(l => !string.IsNullOrWhiteSpace(l.UserName)).Select(l => l.UserName.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(x => x).ToList();

        return Task.FromResult(new Billing.Contracts.AuditFilterOptionsResponse
        {
            EntityNames = entityNames,
            Actions = actions,
            UserNames = userNames
        });
    }
}
