using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Billing.Application.Interfaces;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Repositories;

public class InvoiceCommunicationRepository : IInvoiceCommunicationRepository
{
    private readonly BillingDbContext _dbContext;

    public InvoiceCommunicationRepository(BillingDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task AddAsync(InvoiceCommunication communication)
    {
        await _dbContext.InvoiceCommunications.AddAsync(communication);
    }

    public async Task<List<InvoiceCommunication>> GetByInvoiceIdAsync(int invoiceId, int tenantId)
    {
        return await _dbContext.InvoiceCommunications
            .Where(c => c.InvoiceId == invoiceId && c.TenantId == tenantId)
            .OrderByDescending(c => c.SentAtUtc)
            .ToListAsync();
    }
}
