using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Settings;
using Billing.Domain.Entities;

namespace Billing.Application.Services;

public class ReminderSettingService : IReminderSettingService
{
    private readonly IReminderSettingRepository _repository;

    public ReminderSettingService(IReminderSettingRepository repository)
    {
        _repository = repository;
    }

    public async Task<ApiResponse<ReminderSettingsDto>> GetSettingsAsync(int tenantId, CancellationToken cancellationToken = default)
    {
        if (tenantId <= 0)
            return ApiResponse<ReminderSettingsDto>.Fail("Invalid tenant context.");

        var setting = await _repository.GetOrCreateAsync(tenantId, cancellationToken);
        return ApiResponse<ReminderSettingsDto>.Ok(MapToDto(setting), "Reminder settings retrieved successfully.");
    }

    public async Task<ApiResponse<ReminderSettingsDto>> UpdateSettingsAsync(
        int tenantId,
        UpdateReminderSettingsRequest request,
        string? userName = null,
        CancellationToken cancellationToken = default)
    {
        if (tenantId <= 0)
            return ApiResponse<ReminderSettingsDto>.Fail("Invalid tenant context.");

        if (request == null)
            return ApiResponse<ReminderSettingsDto>.Fail("Request body cannot be null.");

        if (!TryNormalizeUnit(request.PartialPaymentIntervalUnit, out var normalizedUnit))
            return ApiResponse<ReminderSettingsDto>.Fail("Partial payment reminder unit must be Days, Hours, or Minutes.");

        if (request.PartialPaymentIntervalValue < 1 ||
            (normalizedUnit == "Days" && request.PartialPaymentIntervalValue > 365) ||
            (normalizedUnit == "Hours" && request.PartialPaymentIntervalValue > 720) ||
            (normalizedUnit == "Minutes" && request.PartialPaymentIntervalValue > 525600))
        {
            return ApiResponse<ReminderSettingsDto>.Fail("Partial payment reminder interval is outside the allowed range.");
        }

        if (request.OverdueReminderIntervalDays < 1 || request.OverdueReminderIntervalDays > 365)
            return ApiResponse<ReminderSettingsDto>.Fail("Overdue reminder interval must be between 1 and 365 days.");

        var existing = await _repository.GetByTenantIdAsync(tenantId, cancellationToken)
            ?? new ReminderSetting { TenantId = tenantId, CreatedAtUtc = DateTime.UtcNow };

        existing.PartialPaymentReminderEnabled = request.PartialPaymentReminderEnabled;
        existing.PartialPaymentIntervalValue = request.PartialPaymentIntervalValue;
        existing.PartialPaymentIntervalUnit = normalizedUnit;
        existing.OverdueReminderEnabled = request.OverdueReminderEnabled;
        existing.OverdueReminderIntervalDays = request.OverdueReminderIntervalDays;
        existing.UpcomingDueReminderEnabled = request.UpcomingDueReminderEnabled;
        existing.UpdatedAtUtc = DateTime.UtcNow;
        existing.UpdatedBy = string.IsNullOrWhiteSpace(userName) ? "System" : userName.Trim();

        var saved = await _repository.SaveAsync(existing, cancellationToken);
        return ApiResponse<ReminderSettingsDto>.Ok(MapToDto(saved), "Reminder settings updated successfully.");
    }

    private static bool TryNormalizeUnit(string? unit, out string normalized)
    {
        switch ((unit ?? string.Empty).Trim().ToLowerInvariant())
        {
            case "day":
            case "days":
                normalized = "Days";
                return true;
            case "hour":
            case "hours":
                normalized = "Hours";
                return true;
            case "minute":
            case "minutes":
                normalized = "Minutes";
                return true;
            default:
                normalized = "Days";
                return false;
        }
    }

    private static ReminderSettingsDto MapToDto(ReminderSetting setting) => new()
    {
        TenantId = setting.TenantId,
        PartialPaymentReminderEnabled = setting.PartialPaymentReminderEnabled,
        PartialPaymentIntervalValue = setting.PartialPaymentIntervalValue,
        PartialPaymentIntervalUnit = setting.PartialPaymentIntervalUnit,
        OverdueReminderEnabled = setting.OverdueReminderEnabled,
        OverdueReminderIntervalDays = setting.OverdueReminderIntervalDays,
        UpcomingDueReminderEnabled = setting.UpcomingDueReminderEnabled,
        UpdatedAtUtc = setting.UpdatedAtUtc,
        UpdatedBy = setting.UpdatedBy
    };
}
