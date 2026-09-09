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
        return await _context.AuditLogs
            .AsNoTracking()
            .Where(a => a.TenantId == tenantId && a.CustomerId == customerId)
            .OrderByDescending(a => a.Timestamp)
            .ToListAsync(cancellationToken);
    }

    public async Task<List<AuditLog>> GetByEntityAsync(int tenantId, string entityName, string entityId, CancellationToken cancellationToken = default)
    {
        return await _context.AuditLogs
            .AsNoTracking()
            .Where(a => a.TenantId == tenantId && a.EntityName == entityName && a.EntityId == entityId)
            .OrderByDescending(a => a.Timestamp)
            .ToListAsync(cancellationToken);
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

        return (items, totalCount);
    }
}
