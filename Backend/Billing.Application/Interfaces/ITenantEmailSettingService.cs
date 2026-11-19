using System.Threading;
using System.Threading.Tasks;
using Billing.Contracts;
using Billing.Contracts.Settings;
using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface ITenantEmailSettingService
{
    Task<ApiResponse<TenantEmailSettingDto>> GetSettingAsync(int tenantId, CancellationToken cancellationToken = default);
    Task<ApiResponse<TenantEmailSettingDto>> SaveSettingAsync(int tenantId, SaveTenantEmailSettingRequest request, string? userName = null, CancellationToken cancellationToken = default);
    Task<ApiResponse<TestEmailResultDto>> TestSmtpConnectionAsync(int tenantId, TestEmailSettingRequest request, string? userName = null, CancellationToken cancellationToken = default);
    Task<ApiResponse<TenantEmailSettingDto>> SetStatusAsync(int tenantId, bool isEnabled, string? userName = null, CancellationToken cancellationToken = default);
    Task<ApiResponse<EmailSettingStatusDto>> GetStatusAsync(int tenantId, CancellationToken cancellationToken = default);
    Task<TenantEmailSetting?> GetRawSettingForTenantAsync(int tenantId, CancellationToken cancellationToken = default);
}
