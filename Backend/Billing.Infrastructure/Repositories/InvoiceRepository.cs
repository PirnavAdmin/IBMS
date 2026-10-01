using Billing.Application.Interfaces;
using Billing.Contracts;
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

    public async Task<Invoice> AddAsync(Invoice invoice)
    {
        await _dbContext.Invoices.AddAsync(invoice);
        await _dbContext.SaveChangesAsync();
        return invoice;
    }

    public async Task<Invoice?> GetByIdAsync(int id, int tenantId, CancellationToken cancellationToken = default)
    {
        return await _dbContext.Invoices
            .Include(i => i.Items)
            .Include(i => i.Customer)
            .FirstOrDefaultAsync(i => i.Id == id && i.TenantId == tenantId, cancellationToken);
    }

    public async Task UpdateAsync(Invoice invoice, CancellationToken cancellationToken = default)
    {
        _dbContext.Invoices.Update(invoice);
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<PagedResult<Invoice>> GetPagedAsync(int tenantId, InvoiceFilterRequest filter, CancellationToken cancellationToken = default)
    {
        var query = _dbContext.Invoices
            .Include(i => i.Customer)
            .AsNoTracking()
            .Where(i => i.TenantId == tenantId);

        if (!string.IsNullOrWhiteSpace(filter.SearchTerm))
        {
            var searchTerm = filter.SearchTerm.Trim().ToLower();
            query = query.Where(i => 
                (i.InvoiceNumber != null && i.InvoiceNumber.ToLower().Contains(searchTerm)) ||
                (i.Customer != null && i.Customer.Name.ToLower().Contains(searchTerm)) ||
                (i.Reference != null && i.Reference.ToLower().Contains(searchTerm)));
        }

        if (filter.CustomerId.HasValue)
            query = query.Where(i => i.CustomerId == filter.CustomerId.Value);

        if (!string.IsNullOrWhiteSpace(filter.Status))
            query = query.Where(i => i.Status == filter.Status);

        if (filter.StartDate.HasValue)
            query = query.Where(i => i.InvoiceDate >= filter.StartDate.Value);

        if (filter.EndDate.HasValue)
            query = query.Where(i => i.InvoiceDate <= filter.EndDate.Value);

        var totalCount = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderByDescending(i => i.InvoiceDate)
            .ThenByDescending(i => i.Id)
            .Skip((filter.Page - 1) * filter.PageSize)
            .Take(filter.PageSize)
            .ToListAsync(cancellationToken);

        return new PagedResult<Invoice>(items, totalCount, filter.Page, filter.PageSize);
    }

    public async Task<InvoiceSummaryDto> GetSummaryAsync(int tenantId, CancellationToken cancellationToken = default)
    {
        var baseQuery = _dbContext.Invoices
            .AsNoTracking()
            .Where(i => i.TenantId == tenantId && i.Status != "Voided" && i.Status != "Cancelled");

        // Group by 1 to perform multiple aggregates in a single database round-trip
        var summary = await baseQuery
            .GroupBy(i => 1)
            .Select(g => new InvoiceSummaryDto
            {
                TotalInvoiced = g.Sum(i => i.TotalAmount),
                TotalPaid = g.Sum(i => i.PaidAmount),
                TotalOutstanding = g.Sum(i => i.BalanceAmount),
                OverdueCount = g.Count(i => i.Status == "Overdue" || (i.BalanceAmount > 0 && i.DueDate < DateTime.UtcNow))
            })
            .FirstOrDefaultAsync(cancellationToken);

        return summary ?? new InvoiceSummaryDto();
    }
}
