using Billing.Contracts;
using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IInvoiceRepository
{
    Task<Invoice?> GetByIdAsync(int id, int tenantId, CancellationToken cancellationToken = default);
    Task<Invoice?> GetByIdForUpdateAsync(int id, int tenantId);
    Task<Invoice?> GetByInvoiceNumberAsync(string invoiceNumber, int tenantId);
    Task<List<Invoice>> GetEligibleInvoicesAsync(int tenantId, string? search = null, int? customerId = null);
    Task<List<Invoice>> GetAllAsync(int tenantId);
    Task<Invoice> AddAsync(Invoice invoice);
    Task<Invoice> UpdateAsync(Invoice invoice, CancellationToken cancellationToken = default);
    Task<PagedResult<Invoice>> GetPagedAsync(int tenantId, InvoiceFilterRequest filter, CancellationToken cancellationToken = default);
    Task<List<InvoiceSummaryDto>> GetSummaryAsync(int tenantId, CancellationToken cancellationToken = default);
}
