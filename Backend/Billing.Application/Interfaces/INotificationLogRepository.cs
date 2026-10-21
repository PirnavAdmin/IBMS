using Billing.Contracts;
using Billing.Contracts.Notification;
using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface INotificationLogRepository
{
    Task<NotificationLog> AddAsync(NotificationLog log);
    Task<NotificationLog?> GetByIdAsync(int id, int tenantId);
    Task<NotificationLog> UpdateAsync(NotificationLog log);
    Task<PagedResult<NotificationLog>> QueryLogsAsync(int tenantId, NotificationLogQueryParameters parameters);
    Task<List<NotificationLog>> GetFailedForRetryAsync(int tenantId, int maxRetryCount = 3);
}
