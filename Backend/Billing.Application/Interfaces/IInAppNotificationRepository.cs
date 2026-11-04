using Billing.Contracts.Notification;
using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IInAppNotificationRepository
{
    Task<NotificationInboxPageDto> GetInboxPageAsync(
        int tenantId,
        int recipientUserId,
        NotificationInboxQueryParameters parameters,
        DateTime snapshotAtUtc,
        CancellationToken cancellationToken = default);

    Task<int> GetUnreadCountAsync(
        int tenantId,
        int recipientUserId,
        CancellationToken cancellationToken = default);

    Task<bool> MarkAsReadAsync(
        int tenantId,
        int recipientUserId,
        long notificationId,
        DateTime readAtUtc,
        CancellationToken cancellationToken = default);

    Task<bool> MarkAllAsReadAsync(
        int tenantId,
        int recipientUserId,
        DateTime throughCreatedAtUtc,
        DateTime readAtUtc,
        CancellationToken cancellationToken = default);

    Task<InAppNotification?> CreateNotificationAsync(
        InAppNotification notification,
        CancellationToken cancellationToken = default);

    Task<int> CleanupExpiredNotificationsAsync(
        DateTime nowUtc,
        CancellationToken cancellationToken = default);
}
