using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IInvoiceSnapshotRepository
{
    Task<InvoiceSnapshot?> GetByInvoiceIdAsync(int invoiceId, int tenantId);

    Task<InvoiceSnapshot?> GetByIdAsync(int id, int tenantId);

    Task AddAsync(InvoiceSnapshot snapshot);

    Task<bool> ExistsForInvoiceAsync(int invoiceId, int tenantId);
}
