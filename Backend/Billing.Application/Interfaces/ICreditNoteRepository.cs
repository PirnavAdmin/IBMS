using Billing.Contracts;
using Billing.Contracts.CreditNote;
using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface ICreditNoteRepository
{
    Task<CreditNote?> GetByIdAsync(int id, int tenantId, CancellationToken cancellationToken = default);
    Task<CreditNote?> GetByIdForUpdateAsync(int id, int tenantId, CancellationToken cancellationToken = default);
    Task<CreditNote?> GetByCreditNoteNumberAsync(string creditNoteNumber, int tenantId, CancellationToken cancellationToken = default);
    Task<List<CreditNote>> GetByInvoiceIdAsync(int invoiceId, int tenantId, CancellationToken cancellationToken = default);
    Task<PagedResult<CreditNoteListItemDto>> GetPagedAsync(int tenantId, CreditNoteFilterRequest filter, int? restrictedCustomerId = null, CancellationToken cancellationToken = default);
    Task<CreditNote> AddAsync(CreditNote creditNote, CancellationToken cancellationToken = default);
    Task<CreditNote> UpdateAsync(CreditNote creditNote, CancellationToken cancellationToken = default);
    Task<CreditNoteRefund> AddRefundAsync(CreditNoteRefund refund, CancellationToken cancellationToken = default);
    Task<decimal> GetTotalIssuedCreditsForInvoiceAsync(int invoiceId, int tenantId, CancellationToken cancellationToken = default);
}
