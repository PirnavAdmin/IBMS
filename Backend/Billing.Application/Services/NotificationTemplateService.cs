using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Notification;
using Billing.Domain.Entities;

namespace Billing.Application.Services;

public class NotificationTemplateService : INotificationTemplateService
{
    private readonly INotificationTemplateRepository _templateRepository;
    private readonly ITemplateEngineService _templateEngine;

    public NotificationTemplateService(
        INotificationTemplateRepository templateRepository,
        ITemplateEngineService templateEngine)
    {
        _templateRepository = templateRepository;
        _templateEngine = templateEngine;
    }

    public async Task<ApiResponse<List<NotificationTemplateDto>>> GetAllTemplatesAsync(int tenantId, string? eventType = null, bool? isActive = null)
    {
        // Auto-seed defaults if tenant has no templates configured yet
        var existing = await _templateRepository.GetAllAsync(tenantId);
        if (existing.Count == 0)
        {
            await _templateRepository.SeedDefaultTemplatesAsync(tenantId);
        }

        var templates = await _templateRepository.GetAllAsync(tenantId, eventType, isActive);
        var dtos = templates.Select(MapToDto).ToList();
        return ApiResponse<List<NotificationTemplateDto>>.Ok(dtos, "Notification templates retrieved.");
    }

    public async Task<ApiResponse<NotificationTemplateDto>> GetTemplateByIdAsync(int id, int tenantId)
    {
        var template = await _templateRepository.GetByIdAsync(id, tenantId);
        if (template == null)
        {
            return ApiResponse<NotificationTemplateDto>.Fail("Notification template not found.");
        }

        return ApiResponse<NotificationTemplateDto>.Ok(MapToDto(template));
    }

    public async Task<ApiResponse<NotificationTemplateDto>> CreateTemplateAsync(CreateNotificationTemplateRequest request, int tenantId, string? userName)
    {
        if (string.IsNullOrWhiteSpace(request.EventType))
            return ApiResponse<NotificationTemplateDto>.Fail("Event type is required.");
        if (string.IsNullOrWhiteSpace(request.Name))
            return ApiResponse<NotificationTemplateDto>.Fail("Template name is required.");
        if (string.IsNullOrWhiteSpace(request.SubjectTemplate))
            return ApiResponse<NotificationTemplateDto>.Fail("Subject template is required.");
        if (string.IsNullOrWhiteSpace(request.BodyTemplate))
            return ApiResponse<NotificationTemplateDto>.Fail("Body template is required.");

        var template = new NotificationTemplate
        {
            TenantId = tenantId,
            EventType = request.EventType.Trim(),
            Channel = string.IsNullOrWhiteSpace(request.Channel) ? "Email" : request.Channel.Trim(),
            Name = request.Name.Trim(),
            Description = request.Description?.Trim(),
            SubjectTemplate = request.SubjectTemplate.Trim(),
            BodyTemplate = request.BodyTemplate.Trim(),
            IsActive = request.IsActive,
            CreatedBy = userName ?? "System",
            CreatedAtUtc = DateTime.UtcNow
        };

        var created = await _templateRepository.AddAsync(template);
        return ApiResponse<NotificationTemplateDto>.Ok(MapToDto(created), "Notification template created successfully.");
    }

    public async Task<ApiResponse<NotificationTemplateDto>> UpdateTemplateAsync(int id, UpdateNotificationTemplateRequest request, int tenantId, string? userName)
    {
        var template = await _templateRepository.GetByIdAsync(id, tenantId);
        if (template == null)
        {
            return ApiResponse<NotificationTemplateDto>.Fail("Notification template not found.");
        }

        if (string.IsNullOrWhiteSpace(request.Name))
            return ApiResponse<NotificationTemplateDto>.Fail("Template name is required.");
        if (string.IsNullOrWhiteSpace(request.SubjectTemplate))
            return ApiResponse<NotificationTemplateDto>.Fail("Subject template is required.");
        if (string.IsNullOrWhiteSpace(request.BodyTemplate))
            return ApiResponse<NotificationTemplateDto>.Fail("Body template is required.");

        template.Name = request.Name.Trim();
        template.Description = request.Description?.Trim();
        template.SubjectTemplate = request.SubjectTemplate.Trim();
        template.BodyTemplate = request.BodyTemplate.Trim();
        template.IsActive = request.IsActive;
        template.UpdatedBy = userName ?? "System";

        var updated = await _templateRepository.UpdateAsync(template);
        return ApiResponse<NotificationTemplateDto>.Ok(MapToDto(updated), "Notification template updated successfully.");
    }

    public async Task<ApiResponse<bool>> DeleteTemplateAsync(int id, int tenantId)
    {
        var success = await _templateRepository.DeleteAsync(id, tenantId);
        if (!success)
        {
            return ApiResponse<bool>.Fail("Notification template not found.");
        }

        return ApiResponse<bool>.Ok(true, "Notification template deleted successfully.");
    }

    public async Task<ApiResponse<bool>> SeedDefaultsAsync(int tenantId, string? userName)
    {
        await _templateRepository.SeedDefaultTemplatesAsync(tenantId, userName ?? "System");
        return ApiResponse<bool>.Ok(true, "Default notification templates seeded successfully.");
    }

    public ApiResponse<List<NotificationVariableDefinitionDto>> GetVariablesForEvent(string eventType)
    {
        var variables = _templateEngine.GetAvailableVariables(eventType);
        return ApiResponse<List<NotificationVariableDefinitionDto>>.Ok(variables);
    }

    public ApiResponse<NotificationPreviewResponse> PreviewTemplate(NotificationPreviewRequest request)
    {
        var preview = _templateEngine.Preview(request);
        return ApiResponse<NotificationPreviewResponse>.Ok(preview);
    }

    private static NotificationTemplateDto MapToDto(NotificationTemplate t) => new()
    {
        Id = t.Id,
        TenantId = t.TenantId,
        EventType = t.EventType,
        Channel = t.Channel,
        Name = t.Name,
        Description = t.Description,
        SubjectTemplate = t.SubjectTemplate,
        BodyTemplate = t.BodyTemplate,
        IsActive = t.IsActive,
        CreatedAtUtc = t.CreatedAtUtc,
        UpdatedAtUtc = t.UpdatedAtUtc,
        CreatedBy = t.CreatedBy,
        UpdatedBy = t.UpdatedBy
    };
}
