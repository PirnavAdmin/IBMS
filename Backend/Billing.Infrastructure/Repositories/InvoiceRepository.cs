using Billing.Application.Interfaces;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;

namespace Billing.Infrastructure.Repositories;

public class InvoiceRepository : IInvoiceRepository
{
    private readonly BillingDbContext _dbContext;

    public InvoiceRepository(BillingDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<Invoice> AddAsync(Invoice invoice)
    {
        await _dbContext.Invoices.AddAsync(invoice);
        await _dbContext.SaveChangesAsync();
        return invoice;
    }

    public async Task<Invoice?> GetByIdAsync(int id, int tenantId)
    {
        return await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.FirstOrDefaultAsync(
            Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.Include(
                Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.Include(
                    _dbContext.Invoices, i => i.Customer),
                i => i.Items),
            i => i.Id == id && i.TenantId == tenantId);
    }
}
