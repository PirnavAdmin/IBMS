using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IAuditService
{
    Task RecordCustomerCreatedAsync(
        int tenantId,
        int customerId,
        string customerName,
        string userName,
        object customerData,
        CancellationToken cancellationToken = default);

    Task RecordCustomerUpdatedAsync(
        int tenantId,
        int customerId,
        string customerName,
        string userName,
        object changes,
        CancellationToken cancellationToken = default);

    Task RecordCustomerDeactivatedAsync(
        int tenantId,
        int customerId,
        string customerName,
        string userName,
        string? reason = null,
        CancellationToken cancellationToken = default);

    Task<List<AuditLog>> GetCustomerAuditHistoryAsync(
        int tenantId,
        int customerId,
        CancellationToken cancellationToken = default);
}
