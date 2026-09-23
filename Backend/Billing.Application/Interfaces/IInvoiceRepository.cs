using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IInvoiceRepository
{
    Task<Invoice> AddAsync(Invoice invoice);
}
