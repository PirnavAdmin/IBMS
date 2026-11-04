namespace Billing.Application.Interfaces;

public interface ITenantProvisioningService
{
    Task ProvisionTenantDefaultsAsync(int tenantId, string? state = null, CancellationToken cancellationToken = default);
}
