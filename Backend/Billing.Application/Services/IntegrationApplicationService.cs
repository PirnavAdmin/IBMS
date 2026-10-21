using System.Text.Json;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Webhook;
using Billing.Domain.Entities;
using Microsoft.Extensions.Logging;

namespace Billing.Application.Services;

public class IntegrationApplicationService : IIntegrationApplicationService
{
    private readonly IIntegrationApplicationRepository _appRepository;
    private readonly IWebhookSecurityService _securityService;
    private readonly ILogger<IntegrationApplicationService> _logger;

    public IntegrationApplicationService(
        IIntegrationApplicationRepository appRepository,
        IWebhookSecurityService securityService,
        ILogger<IntegrationApplicationService> logger)
    {
        _appRepository = appRepository;
        _securityService = securityService;
        _logger = logger;
    }

    public async Task<ApiResponse<PagedResult<IntegrationApplicationDto>>> GetApplicationsAsync(IntegrationQueryParameters query, int tenantId)
    {
        var (items, totalCount) = await _appRepository.GetPagedListAsync(query, tenantId);

        var dtos = items.Select(MapToDto).ToList();

        var page = query.PageNumber > 0 ? query.PageNumber : 1;
        var size = query.PageSize > 0 ? query.PageSize : 20;

        return ApiResponse<PagedResult<IntegrationApplicationDto>>.Ok(
            new PagedResult<IntegrationApplicationDto>(dtos, totalCount, page, size),
            "Integration applications retrieved successfully.");
    }

    public async Task<ApiResponse<IntegrationApplicationDto>> GetApplicationByIdAsync(int id, int tenantId)
    {
        var app = await _appRepository.GetByIdAsync(id, tenantId);
        if (app == null)
            return ApiResponse<IntegrationApplicationDto>.Fail("Integration application not found.");

        return ApiResponse<IntegrationApplicationDto>.Ok(MapToDto(app), "Integration application retrieved successfully.");
    }

    public async Task<ApiResponse<RegisterIntegrationApplicationResponse>> RegisterApplicationAsync(RegisterIntegrationApplicationRequest request, int tenantId)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return ApiResponse<RegisterIntegrationApplicationResponse>.Fail("Application name is required.");

        var clientId = _securityService.GenerateClientId();
        var rawSecret = _securityService.GenerateClientSecret();
        var hashedSecret = _securityService.HashSecret(rawSecret);

        var defaultFlags = new Dictionary<string, bool>
        {
            ["allowWebhooks"] = true,
            ["enableAutoSync"] = true,
            ["readOnlyAccess"] = false
        };

        if (request.FeatureFlags != null)
        {
            foreach (var kvp in request.FeatureFlags)
            {
                defaultFlags[kvp.Key] = kvp.Value;
            }
        }

        var app = new IntegrationApplication
        {
            TenantId = tenantId,
            Name = request.Name.Trim(),
            Description = request.Description?.Trim(),
            ClientId = clientId,
            ClientSecretHash = hashedSecret,
            FeatureFlagsJson = JsonSerializer.Serialize(defaultFlags),
            Status = "Active",
            CreatedAtUtc = DateTime.UtcNow
        };

        var saved = await _appRepository.AddAsync(app);
        _logger.LogInformation("Integration application {AppName} ({ClientId}) registered for Tenant {TenantId}", saved.Name, clientId, tenantId);

        var response = new RegisterIntegrationApplicationResponse
        {
            Id = saved.Id,
            Name = saved.Name,
            ClientId = clientId,
            ClientSecret = rawSecret,
            FeatureFlags = defaultFlags,
            Status = saved.Status
        };

        return ApiResponse<RegisterIntegrationApplicationResponse>.Ok(response, "Application registered successfully.");
    }

    public async Task<ApiResponse<IntegrationApplicationDto>> UpdateApplicationAsync(int id, UpdateIntegrationApplicationRequest request, int tenantId)
    {
        var app = await _appRepository.GetByIdAsync(id, tenantId);
        if (app == null)
            return ApiResponse<IntegrationApplicationDto>.Fail("Integration application not found.");

        if (string.IsNullOrWhiteSpace(request.Name))
            return ApiResponse<IntegrationApplicationDto>.Fail("Application name is required.");

        app.Name = request.Name.Trim();
        app.Description = request.Description?.Trim();
        app.Status = request.Status?.Trim() ?? app.Status;

        if (request.FeatureFlags != null)
        {
            app.FeatureFlagsJson = JsonSerializer.Serialize(request.FeatureFlags);
        }

        await _appRepository.UpdateAsync(app);
        _logger.LogInformation("Integration application {AppId} updated for Tenant {TenantId}", id, tenantId);

        return ApiResponse<IntegrationApplicationDto>.Ok(MapToDto(app), "Application updated successfully.");
    }

    public async Task<ApiResponse<IntegrationApplicationDto>> UpdateFeatureFlagsAsync(int id, UpdateFeatureFlagsRequest request, int tenantId)
    {
        var app = await _appRepository.GetByIdAsync(id, tenantId);
        if (app == null)
            return ApiResponse<IntegrationApplicationDto>.Fail("Integration application not found.");

        app.FeatureFlagsJson = JsonSerializer.Serialize(request.FeatureFlags ?? new Dictionary<string, bool>());
        await _appRepository.UpdateAsync(app);

        _logger.LogInformation("Feature flags updated for application {AppId}", id);

        return ApiResponse<IntegrationApplicationDto>.Ok(MapToDto(app), "Feature flags updated successfully.");
    }

    public async Task<ApiResponse<IntegrationApplicationDto>> ToggleStatusAsync(int id, int tenantId)
    {
        var app = await _appRepository.GetByIdAsync(id, tenantId);
        if (app == null)
            return ApiResponse<IntegrationApplicationDto>.Fail("Integration application not found.");

        app.Status = app.Status == "Active" ? "Inactive" : "Active";
        await _appRepository.UpdateAsync(app);

        _logger.LogInformation("Integration application {AppId} status toggled to {Status}", id, app.Status);

        return ApiResponse<IntegrationApplicationDto>.Ok(MapToDto(app), $"Application is now {app.Status}.");
    }

    public async Task<ApiResponse<bool>> DeleteApplicationAsync(int id, int tenantId)
    {
        var app = await _appRepository.GetByIdAsync(id, tenantId);
        if (app == null)
            return ApiResponse<bool>.Fail("Integration application not found.");

        await _appRepository.DeleteAsync(app);
        _logger.LogInformation("Integration application {AppId} deleted for Tenant {TenantId}", id, tenantId);

        return ApiResponse<bool>.Ok(true, "Application deleted successfully.");
    }

    private static IntegrationApplicationDto MapToDto(IntegrationApplication app)
    {
        Dictionary<string, bool> flags = new();
        try
        {
            flags = JsonSerializer.Deserialize<Dictionary<string, bool>>(app.FeatureFlagsJson) ?? new();
        }
        catch
        {
            flags = new Dictionary<string, bool>();
        }

        return new IntegrationApplicationDto
        {
            Id = app.Id,
            TenantId = app.TenantId,
            Name = app.Name,
            Description = app.Description,
            ClientId = app.ClientId,
            FeatureFlags = flags,
            Status = app.Status,
            WebhooksCount = app.Webhooks?.Count ?? 0,
            CreatedAtUtc = app.CreatedAtUtc,
            UpdatedAtUtc = app.UpdatedAtUtc
        };
    }
}
