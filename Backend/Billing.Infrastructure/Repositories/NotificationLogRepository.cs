using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Notification;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Repositories;

public class NotificationLogRepository : INotificationLogRepository
{
    private readonly BillingDbContext _dbContext;

    public NotificationLogRepository(BillingDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<NotificationLog> AddAsync(NotificationLog log)
    {
        await _dbContext.NotificationLogs.AddAsync(log);
        await _dbContext.SaveChangesAsync();
        return log;
    }

    public async Task<NotificationLog?> GetByIdAsync(int id, int tenantId)
    {
        return await _dbContext.NotificationLogs
            .FirstOrDefaultAsync(l => l.Id == id && l.TenantId == tenantId);
    }

    public async Task<NotificationLog> UpdateAsync(NotificationLog log)
    {
        _dbContext.NotificationLogs.Update(log);
        await _dbContext.SaveChangesAsync();
        return log;
    }

    public async Task<PagedResult<NotificationLog>> QueryLogsAsync(int tenantId, NotificationLogQueryParameters parameters)
    {
        var query = _dbContext.NotificationLogs
            .AsNoTracking()
            .Where(l => l.TenantId == tenantId);

        if (!string.IsNullOrWhiteSpace(parameters.EventType))
        {
            query = query.Where(l => l.EventType == parameters.EventType.Trim());
        }

        if (!string.IsNullOrWhiteSpace(parameters.EntityType))
        {
            query = query.Where(l => l.EntityType == parameters.EntityType.Trim());
        }

        if (parameters.EntityId.HasValue)
        {
            query = query.Where(l => l.EntityId == parameters.EntityId.Value);
        }

        if (!string.IsNullOrWhiteSpace(parameters.Status))
        {
            query = query.Where(l => l.Status == parameters.Status.Trim());
        }

        if (parameters.StartDate.HasValue)
        {
            query = query.Where(l => l.SentAtUtc >= parameters.StartDate.Value);
        }

        if (parameters.EndDate.HasValue)
        {
            query = query.Where(l => l.SentAtUtc <= parameters.EndDate.Value);
        }

        if (!string.IsNullOrWhiteSpace(parameters.SearchTerm))
        {
            var term = parameters.SearchTerm.Trim().ToLower();
            query = query.Where(l =>
                l.Recipient.ToLower().Contains(term) ||
                l.Subject.ToLower().Contains(term) ||
                l.EventType.ToLower().Contains(term) ||
                (l.FailureReason != null && l.FailureReason.ToLower().Contains(term)));
        }

        var totalCount = await query.CountAsync();
        var pageNumber = parameters.PageNumber < 1 ? 1 : parameters.PageNumber;
        var pageSize = parameters.PageSize < 1 ? 20 : (parameters.PageSize > 100 ? 100 : parameters.PageSize);

        var items = await query
            .OrderByDescending(l => l.SentAtUtc)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return new PagedResult<NotificationLog>(items, totalCount, pageNumber, pageSize);
    }

    public async Task<List<NotificationLog>> GetFailedForRetryAsync(int tenantId, int maxRetryCount = 3)
    {
        var now = DateTime.UtcNow;
        return await _dbContext.NotificationLogs
            .Where(l => l.TenantId == tenantId &&
                        l.Status == "Failed" &&
                        l.RetryCount < maxRetryCount &&
                        (l.NextRetryAtUtc == null || l.NextRetryAtUtc <= now))
            .OrderBy(l => l.SentAtUtc)
            .Take(50)
            .ToListAsync();
    }
}
