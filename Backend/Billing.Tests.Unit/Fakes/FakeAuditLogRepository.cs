using Billing.Application.Interfaces;
using Billing.Contracts.Platform;
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

    public Task<(List<AuditLog> Items, int TotalCount)> GetPlatformAuditLogsPagedAsync(PlatformAuditFilterRequest filter, CancellationToken cancellationToken = default)
    {
        var query = _logs.AsEnumerable();
        if (filter.TenantId.HasValue && filter.TenantId.Value > 0)
            query = query.Where(a => a.TenantId == filter.TenantId.Value);
        if (!string.IsNullOrWhiteSpace(filter.EntityName))
            query = query.Where(a => a.EntityName.Equals(filter.EntityName.Trim(), StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(filter.Actor))
            query = query.Where(a => a.UserName.Contains(filter.Actor.Trim(), StringComparison.OrdinalIgnoreCase) ||
                                     (a.ActorUserId != null && a.ActorUserId.Contains(filter.Actor.Trim(), StringComparison.OrdinalIgnoreCase)) ||
                                     (a.ActorRole != null && a.ActorRole.Contains(filter.Actor.Trim(), StringComparison.OrdinalIgnoreCase)));
        if (!string.IsNullOrWhiteSpace(filter.Action))
            query = query.Where(a => string.Equals(a.Action, filter.Action.Trim(), StringComparison.OrdinalIgnoreCase));
        if (filter.StartDate.HasValue)
            query = query.Where(a => a.Timestamp >= filter.StartDate.Value);
        if (filter.EndDate.HasValue)
            query = query.Where(a => a.Timestamp <= filter.EndDate.Value);

        var list = query.OrderByDescending(a => a.Timestamp).ToList();
        var page = filter.PageNumber > 0 ? filter.PageNumber : 1;
        var pageSize = filter.PageSize > 0 ? filter.PageSize : 20;
        var items = list.Skip((page - 1) * pageSize).Take(pageSize).ToList();
        return Task.FromResult((items, list.Count));
    }
}
