using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IGeneratedDocumentRepository
{
    Task<GeneratedDocument?> GetByInvoiceIdAsync(int invoiceId, int tenantId);

    Task<GeneratedDocument?> GetByIdAsync(int id, int tenantId);

    Task AddAsync(GeneratedDocument document);

    Task UpdateAsync(GeneratedDocument document);
}
