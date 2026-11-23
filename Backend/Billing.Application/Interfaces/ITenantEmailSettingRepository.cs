using System.Threading;
using System.Threading.Tasks;
using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

/// <summary>
/// Data access interface for tenant-specific SMTP configuration.
/// Ensures strict tenant-level isolation on all queries and mutations.
/// </summary>
public interface ITenantEmailSettingRepository
{
    Task<TenantEmailSetting?> GetByTenantIdAsync(int tenantId, CancellationToken cancellationToken = default);
    Task<TenantEmailSetting> AddAsync(TenantEmailSetting setting, CancellationToken cancellationToken = default);
    Task<TenantEmailSetting> UpdateAsync(TenantEmailSetting setting, CancellationToken cancellationToken = default);
    Task<bool> DeleteAsync(int tenantId, CancellationToken cancellationToken = default);
}
