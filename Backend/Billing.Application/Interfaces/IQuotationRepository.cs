using Billing.Contracts.Quotation;
using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IQuotationRepository
{
    Task<Quotation?> GetByIdAsync(int id, int tenantId);
    Task<Quotation?> GetByIdForUpdateAsync(int id, int tenantId);
    Task<Quotation?> GetByQuoteNumberAsync(string quoteNumber, int tenantId);
    Task<bool> ExistsQuoteNumberAsync(string quoteNumber, int tenantId, int? excludeId = null);
    Task<(List<Quotation> Items, int TotalCount)> GetPagedListAsync(int tenantId, QuotationListFilterRequest filter);
    Task<Quotation> AddAsync(Quotation quotation);
    Task<Quotation> UpdateAsync(Quotation quotation);
}
