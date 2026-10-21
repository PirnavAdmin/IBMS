using System.Collections.Generic;
using System.Threading.Tasks;
using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IInvoiceCommunicationRepository
{
    Task AddAsync(InvoiceCommunication communication);
    Task<List<InvoiceCommunication>> GetByInvoiceIdAsync(int invoiceId, int tenantId);
}
