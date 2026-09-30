using Billing.Application.Interfaces;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Repositories;

public class AuditLogRepository : IAuditLogRepository
{
    private readonly BillingDbContext _context;

    public AuditLogRepository(BillingDbContext context)
    {
        _context = context;
    }

    public async Task AddAsync(AuditLog log, CancellationToken cancellationToken = default)
    {
        await _context.AuditLogs.AddAsync(log, cancellationToken);
        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task<List<AuditLog>> GetByCustomerIdAsync(int tenantId, int customerId, CancellationToken cancellationToken = default)
    {
        var logs = await _context.AuditLogs
            .AsNoTracking()
            .Where(a => a.TenantId == tenantId && a.CustomerId == customerId)
            .OrderByDescending(a => a.Timestamp)
            .ToListAsync(cancellationToken);

        logs.ForEach(SanitizeChanges);
        return logs;
    }

    public async Task<List<AuditLog>> GetByEntityAsync(int tenantId, string entityName, string entityId, CancellationToken cancellationToken = default)
    {
        var logs = await _context.AuditLogs
            .AsNoTracking()
            .Where(a => a.TenantId == tenantId && a.EntityName == entityName && a.EntityId == entityId)
            .OrderByDescending(a => a.Timestamp)
            .ToListAsync(cancellationToken);

        logs.ForEach(SanitizeChanges);
        return logs;
    }

    public async Task<(List<AuditLog> Items, int TotalCount)> GetPagedAsync(int tenantId, int page, int pageSize, CancellationToken cancellationToken = default)
    {
        var query = _context.AuditLogs
            .AsNoTracking()
            .Where(a => a.TenantId == tenantId);

        var totalCount = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderByDescending(a => a.Timestamp)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        items.ForEach(SanitizeChanges);
        return (items, totalCount);
    }

    public async Task<(List<AuditLog> Items, int TotalCount)> GetFilteredPagedAsync(int tenantId, Billing.Contracts.AuditLogFilterRequest filter, CancellationToken cancellationToken = default)
    {
        var query = _context.AuditLogs
            .AsNoTracking()
            .Where(a => a.TenantId == tenantId);

        if (!string.IsNullOrEmpty(filter.EntityName))
            query = query.Where(a => a.EntityName == filter.EntityName);
            
        if (!string.IsNullOrEmpty(filter.UserName))
            query = query.Where(a => a.UserName == filter.UserName);
            
        if (!string.IsNullOrEmpty(filter.Action))
            query = query.Where(a => a.Action == filter.Action);
            
        if (filter.StartDate.HasValue)
            query = query.Where(a => a.Timestamp >= filter.StartDate.Value);
            
        if (filter.EndDate.HasValue)
            query = query.Where(a => a.Timestamp <= filter.EndDate.Value);

        var totalCount = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderByDescending(a => a.Timestamp)
            .Skip((filter.Page - 1) * filter.PageSize)
            .Take(filter.PageSize)
            .ToListAsync(cancellationToken);

        items.ForEach(SanitizeChanges);
        return (items, totalCount);
    }
    private static void SanitizeChanges(AuditLog log)
    {
        if (!string.IsNullOrEmpty(log.Changes))
        {
            log.Changes = System.Text.RegularExpressions.Regex.Replace(log.Changes, @"^[\s?]+\s*", "");
        }
    }
}
