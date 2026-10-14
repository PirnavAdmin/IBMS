using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface INotificationTemplateRepository
{
    Task<List<NotificationTemplate>> GetAllAsync(int tenantId, string? eventType = null, bool? isActive = null);
    Task<NotificationTemplate?> GetByIdAsync(int id, int tenantId);
    Task<NotificationTemplate?> GetActiveTemplateAsync(int tenantId, string eventType, string channel = "Email");
    Task<NotificationTemplate> AddAsync(NotificationTemplate template);
    Task<NotificationTemplate> UpdateAsync(NotificationTemplate template);
    Task<bool> DeleteAsync(int id, int tenantId);
    Task SeedDefaultTemplatesAsync(int tenantId, string createdBy = "System");
}
