using Billing.Application.Interfaces;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Repositories;

public class InvoiceRepository : IInvoiceRepository
{
    private readonly BillingDbContext _dbContext;

    public InvoiceRepository(BillingDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<Invoice?> GetByIdAsync(int id, int tenantId)
    {
        return await _dbContext.Invoices
            .AsNoTracking()
            .Include(i => i.Customer)
            .Include(i => i.Items)
            .Include(i => i.PaymentAllocations)
            .FirstOrDefaultAsync(i => i.Id == id && i.TenantId == tenantId);
    }

    public async Task<Invoice?> GetByIdForUpdateAsync(int id, int tenantId)
    {
        return await _dbContext.Invoices
            .Include(i => i.Customer)
            .Include(i => i.Items)
            .Include(i => i.PaymentAllocations)
            .FirstOrDefaultAsync(i => i.Id == id && i.TenantId == tenantId);
    }

    public async Task<Invoice?> GetByInvoiceNumberAsync(string invoiceNumber, int tenantId)
    {
        if (string.IsNullOrWhiteSpace(invoiceNumber)) return null;
        var norm = invoiceNumber.Trim().ToUpperInvariant();
        return await _dbContext.Invoices
            .AsNoTracking()
            .Include(i => i.Customer)
            .Include(i => i.Items)
            .FirstOrDefaultAsync(i => i.TenantId == tenantId && i.InvoiceNumber.ToUpper() == norm);
    }

    public async Task<List<Invoice>> GetEligibleInvoicesAsync(int tenantId, string? search = null, int? customerId = null)
    {
        var query = _dbContext.Invoices
            .AsNoTracking()
            .Include(i => i.Customer)
            .Where(i => i.TenantId == tenantId);

        if (customerId.HasValue && customerId.Value > 0)
        {
            query = query.Where(i => i.CustomerId == customerId.Value);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            query = query.Where(i =>
                i.InvoiceNumber.ToLower().Contains(s) ||
                (i.Customer != null && i.Customer.Name.ToLower().Contains(s)) ||
                (i.Reference != null && i.Reference.ToLower().Contains(s)));
        }

        var invoices = await query
            .OrderByDescending(i => i.InvoiceDate)
            .ThenByDescending(i => i.Id)
            .ToListAsync();

        return invoices
            .Where(i => i.IsEligibleForPayment(out _))
            .ToList();
    }

    public async Task<List<Invoice>> GetAllAsync(int tenantId)
    {
        return await _dbContext.Invoices
            .AsNoTracking()
            .Include(i => i.Customer)
            .Include(i => i.Items)
            .Where(i => i.TenantId == tenantId)
            .OrderByDescending(i => i.InvoiceDate)
            .ThenByDescending(i => i.Id)
            .ToListAsync();
    }

    public async Task<Invoice> AddAsync(Invoice invoice)
    {
        if (invoice.BalanceAmount == 0m && invoice.PaidAmount == 0m && invoice.TotalAmount > 0m)
        {
            invoice.BalanceAmount = Math.Round(invoice.TotalAmount, 2, MidpointRounding.AwayFromZero);
        }

        await _dbContext.Invoices.AddAsync(invoice);
        await _dbContext.SaveChangesAsync();
        return invoice;
    }

    public async Task<Invoice> UpdateAsync(Invoice invoice)
    {
        invoice.UpdatedAtUtc = DateTime.UtcNow;
        invoice.RowVersion = DateTime.UtcNow;

        var entry = _dbContext.Entry(invoice);
        if (entry.State == EntityState.Detached)
        {
            _dbContext.Invoices.Update(invoice);
        }

        await _dbContext.SaveChangesAsync();
        return invoice;
    }
}
