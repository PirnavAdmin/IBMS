using Billing.Contracts;
using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IInvoiceRepository
{
    Task<Invoice> AddAsync(Invoice invoice);
    Task<Invoice?> GetByIdAsync(int id, int tenantId, CancellationToken cancellationToken = default);
    Task UpdateAsync(Invoice invoice, CancellationToken cancellationToken = default);
    Task<PagedResult<Invoice>> GetPagedAsync(int tenantId, InvoiceFilterRequest filter, CancellationToken cancellationToken = default);
    Task<InvoiceSummaryDto> GetSummaryAsync(int tenantId, CancellationToken cancellationToken = default);
}
