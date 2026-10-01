using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IInvoiceRepository
{
    Task<Invoice> AddAsync(Invoice invoice);

    Task<Invoice?> GetByIdAsync(int id, int tenantId);
}
