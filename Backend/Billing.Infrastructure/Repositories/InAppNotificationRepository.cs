using System.Text.RegularExpressions;
using Billing.Application.Interfaces;
using Billing.Contracts.Notification;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Repositories;

public class InAppNotificationRepository : IInAppNotificationRepository
{
    private static readonly Regex ValidActionIdRegex = new("^[A-Za-z0-9_-]+$", RegexOptions.Compiled);
    private static readonly HashSet<string> ValidModules = new(StringComparer.OrdinalIgnoreCase)
    {
        "invoices",
        "payments",
        "customers",
        "credit-notes"
    };

    private readonly BillingDbContext _dbContext;

    public InAppNotificationRepository(BillingDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<NotificationInboxPageDto> GetInboxPageAsync(
        int tenantId,
        int recipientUserId,
        NotificationInboxQueryParameters parameters,
        DateTime snapshotAtUtc,
        CancellationToken cancellationToken = default)
    {
        var baseQuery = _dbContext.InAppNotifications
            .AsNoTracking()
            .Where(n => n.TenantId == tenantId && n.RecipientUserId == recipientUserId)
            .Where(n => n.ExpiresAtUtc == null || n.ExpiresAtUtc > snapshotAtUtc);

        if (parameters.UnreadOnly)
        {
            baseQuery = baseQuery.Where(n => !n.IsRead);
        }

        var totalCount = await baseQuery.CountAsync(cancellationToken);

        var pageNumber = parameters.PageNumber < 1 ? 1 : parameters.PageNumber;
        var pageSize = parameters.PageSize < 1 ? 20 : (parameters.PageSize > 50 ? 50 : parameters.PageSize);
        var skip = (pageNumber - 1) * pageSize;

        var rawItems = await baseQuery
            .OrderByDescending(n => n.CreatedAtUtc)
            .ThenByDescending(n => n.Id)
            .Skip(skip)
            .Take(pageSize)
            .Select(n => new
            {
                n.Id,
                n.Title,
                n.Message,
                n.CreatedAtUtc,
                n.IsRead,
                n.ActionModule,
                n.ActionEntityId
            })
            .ToListAsync(cancellationToken);

        var items = rawItems.Select(n =>
        {
            NotificationActionDto? action = null;
            if (!string.IsNullOrWhiteSpace(n.ActionModule) &&
                !string.IsNullOrWhiteSpace(n.ActionEntityId) &&
                ValidModules.Contains(n.ActionModule.Trim()) &&
                ValidActionIdRegex.IsMatch(n.ActionEntityId.Trim()))
            {
                action = new NotificationActionDto
                {
                    Module = n.ActionModule.Trim().ToLowerInvariant(),
                    EntityId = n.ActionEntityId.Trim()
                };
            }

            return new NotificationInboxItemDto
            {
                Id = n.Id.ToString(),
                Title = n.Title,
                Message = n.Message,
                CreatedAtUtc = DateTime.SpecifyKind(n.CreatedAtUtc, DateTimeKind.Utc),
                IsRead = n.IsRead,
                Action = action
            };
        }).ToList();

        return new NotificationInboxPageDto
        {
            Items = items,
            TotalCount = totalCount,
            PageNumber = pageNumber,
            PageSize = pageSize,
            SnapshotAtUtc = DateTime.SpecifyKind(snapshotAtUtc, DateTimeKind.Utc)
        };
    }

    public async Task<int> GetUnreadCountAsync(
        int tenantId,
        int recipientUserId,
        CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        return await _dbContext.InAppNotifications
            .AsNoTracking()
            .Where(n => n.TenantId == tenantId && n.RecipientUserId == recipientUserId && !n.IsRead)
            .Where(n => n.ExpiresAtUtc == null || n.ExpiresAtUtc > now)
            .CountAsync(cancellationToken);
    }

    public async Task<bool> MarkAsReadAsync(
        int tenantId,
        int recipientUserId,
        long notificationId,
        DateTime readAtUtc,
        CancellationToken cancellationToken = default)
    {
        var notification = await _dbContext.InAppNotifications
            .FirstOrDefaultAsync(n => n.Id == notificationId && n.TenantId == tenantId && n.RecipientUserId == recipientUserId, cancellationToken);

        if (notification == null)
        {
            return false;
        }

        if (!notification.IsRead)
        {
            notification.IsRead = true;
            notification.ReadAtUtc = readAtUtc;
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        return true;
    }

    public async Task<bool> MarkAllAsReadAsync(
        int tenantId,
        int recipientUserId,
        DateTime throughCreatedAtUtc,
        DateTime readAtUtc,
        CancellationToken cancellationToken = default)
    {
        var notifications = await _dbContext.InAppNotifications
            .Where(n => n.TenantId == tenantId && n.RecipientUserId == recipientUserId && !n.IsRead && n.CreatedAtUtc <= throughCreatedAtUtc)
            .ToListAsync(cancellationToken);

        if (notifications.Count > 0)
        {
            foreach (var n in notifications)
            {
                n.IsRead = true;
                n.ReadAtUtc = readAtUtc;
            }
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        return true;
    }

    public async Task<InAppNotification?> CreateNotificationAsync(
        InAppNotification notification,
        CancellationToken cancellationToken = default)
    {
        var exists = await _dbContext.InAppNotifications.AnyAsync(n =>
            n.TenantId == notification.TenantId &&
            n.RecipientUserId == notification.RecipientUserId &&
            n.EventDeduplicationId == notification.EventDeduplicationId,
            cancellationToken);

        if (exists)
        {
            return null;
        }

        await _dbContext.InAppNotifications.AddAsync(notification, cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);
        return notification;
    }

    public async Task<int> CleanupExpiredNotificationsAsync(
        DateTime nowUtc,
        CancellationToken cancellationToken = default)
    {
        var expired = await _dbContext.InAppNotifications
            .Where(n => n.ExpiresAtUtc != null && n.ExpiresAtUtc <= nowUtc)
            .Take(500)
            .ToListAsync(cancellationToken);

        if (expired.Count > 0)
        {
            _dbContext.InAppNotifications.RemoveRange(expired);
            return await _dbContext.SaveChangesAsync(cancellationToken);
        }

        return 0;
    }
}
