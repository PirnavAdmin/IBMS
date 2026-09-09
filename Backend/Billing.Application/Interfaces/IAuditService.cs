using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IAuditService
{
    Task RecordCustomerCreatedAsync(
        int tenantId,
        int customerId,
        string customerName,
        string userId,
        string userName,
        object customerData,
        string? ipAddress = null,
        CancellationToken cancellationToken = default);

    Task RecordCustomerUpdatedAsync(
        int tenantId,
        int customerId,
        string customerName,
        string userId,
        string userName,
        object changes,
        string? ipAddress = null,
        CancellationToken cancellationToken = default);

    Task RecordCustomerDeactivatedAsync(
        int tenantId,
        int customerId,
        string customerName,
        string userId,
        string userName,
        string? reason = null,
        string? ipAddress = null,
        CancellationToken cancellationToken = default);

    Task<List<AuditLog>> GetCustomerAuditHistoryAsync(
        int tenantId,
        int customerId,
        CancellationToken cancellationToken = default);
}
