using Billing.Contracts;
using Billing.Contracts.Settings;

namespace Billing.Application.Interfaces;

public interface IReminderSettingService
{
    Task<ApiResponse<ReminderSettingsDto>> GetSettingsAsync(int tenantId, CancellationToken cancellationToken = default);
    Task<ApiResponse<ReminderSettingsDto>> UpdateSettingsAsync(int tenantId, UpdateReminderSettingsRequest request, string? userName = null, CancellationToken cancellationToken = default);
}
