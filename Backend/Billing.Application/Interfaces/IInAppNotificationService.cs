using Billing.Contracts;
using Billing.Contracts.Notification;

namespace Billing.Application.Interfaces;

public interface IInAppNotificationService
{
    Task<ApiResponse<NotificationInboxPageDto>> GetInboxAsync(
        int tenantId,
        int recipientUserId,
        NotificationInboxQueryParameters parameters,
        CancellationToken cancellationToken = default);

    Task<ApiResponse<NotificationUnreadCountDto>> GetUnreadCountAsync(
        int tenantId,
        int recipientUserId,
        CancellationToken cancellationToken = default);

    Task<ApiResponse<bool>> MarkAsReadAsync(
        int tenantId,
        int recipientUserId,
        long notificationId,
        CancellationToken cancellationToken = default);

    Task<ApiResponse<bool>> MarkAllAsReadAsync(
        int tenantId,
        int recipientUserId,
        DateTime throughCreatedAtUtc,
        CancellationToken cancellationToken = default);

    Task<ApiResponse<int>> PublishTenantNotificationAsync(
        PublishTenantNotificationCommand command,
        CancellationToken cancellationToken = default);

    Task<ApiResponse<bool>> CreateInAppNotificationAsync(
        CreateInAppNotificationCommand command,
        CancellationToken cancellationToken = default);
}
