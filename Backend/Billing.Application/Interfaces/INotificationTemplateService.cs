using Billing.Contracts;
using Billing.Contracts.Notification;

namespace Billing.Application.Interfaces;

public interface INotificationTemplateService
{
    Task<ApiResponse<List<NotificationTemplateDto>>> GetAllTemplatesAsync(int tenantId, string? eventType = null, bool? isActive = null);
    Task<ApiResponse<NotificationTemplateDto>> GetTemplateByIdAsync(int id, int tenantId);
    Task<ApiResponse<NotificationTemplateDto>> CreateTemplateAsync(CreateNotificationTemplateRequest request, int tenantId, string? userName);
    Task<ApiResponse<NotificationTemplateDto>> UpdateTemplateAsync(int id, UpdateNotificationTemplateRequest request, int tenantId, string? userName);
    Task<ApiResponse<bool>> DeleteTemplateAsync(int id, int tenantId);
    Task<ApiResponse<bool>> SeedDefaultsAsync(int tenantId, string? userName);
    ApiResponse<List<NotificationVariableDefinitionDto>> GetVariablesForEvent(string eventType);
    ApiResponse<NotificationPreviewResponse> PreviewTemplate(NotificationPreviewRequest request);
}
