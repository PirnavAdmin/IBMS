using Billing.Application.Interfaces;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Repositories;

public class InvoiceSnapshotRepository : IInvoiceSnapshotRepository
{
    private readonly BillingDbContext _dbContext;

    public InvoiceSnapshotRepository(BillingDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<InvoiceSnapshot?> GetByInvoiceIdAsync(int invoiceId, int tenantId)
    {
        return await _dbContext.InvoiceSnapshots
            .Include(s => s.TemplateVersion)
            .Where(s => s.InvoiceId == invoiceId && s.TenantId == tenantId)
            .FirstOrDefaultAsync();
    }

    public async Task<InvoiceSnapshot?> GetByIdAsync(int id, int tenantId)
    {
        return await _dbContext.InvoiceSnapshots
            .Include(s => s.TemplateVersion)
            .Where(s => s.Id == id && s.TenantId == tenantId)
            .FirstOrDefaultAsync();
    }

    public async Task AddAsync(InvoiceSnapshot snapshot)
    {
        await _dbContext.InvoiceSnapshots.AddAsync(snapshot);
        await _dbContext.SaveChangesAsync();
    }

    public async Task<bool> ExistsForInvoiceAsync(int invoiceId, int tenantId)
    {
        return await _dbContext.InvoiceSnapshots
            .AnyAsync(s => s.InvoiceId == invoiceId && s.TenantId == tenantId);
    }
}
