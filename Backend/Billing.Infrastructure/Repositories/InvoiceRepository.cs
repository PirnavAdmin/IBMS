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

        public async Task<Invoice?> GetByIdAsync(int id, int tenantId, CancellationToken cancellationToken = default)
    {
        var invoice = await _dbContext.Invoices
            .Include(i => i.Customer)
            .Include(i => i.Items)
            .Include(i => i.PaymentAllocations)
            .Include(i => i.CreditNotes)
            .FirstOrDefaultAsync(i => i.Id == id && i.TenantId == tenantId, cancellationToken);
            
        if (invoice != null && invoice.Items != null)
        {
            invoice.Items = invoice.Items.OrderBy(item => item.SortOrder).ToList();
        }
        
        return invoice;
    }

    public async Task<Invoice?> GetByIdForUpdateAsync(int id, int tenantId)
    {
        return await _dbContext.Invoices
            .Include(i => i.Customer)
            .Include(i => i.Items)
            .Include(i => i.PaymentAllocations)
            .Include(i => i.CreditNotes)
            .Include(i => i.CreditNotes)
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
    public async Task<Invoice> UpdateAsync(Invoice invoice, CancellationToken cancellationToken = default)
    {
        invoice.UpdatedAtUtc = DateTime.UtcNow;
        invoice.RowVersion = DateTime.UtcNow;

        var entry = _dbContext.Entry(invoice);
        if (entry.State == EntityState.Detached)
        {
            _dbContext.Invoices.Update(invoice);
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        return invoice;
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

        if (!string.IsNullOrWhiteSpace(filter.Currency))
            query = query.Where(i => i.Currency == filter.Currency);

        if (!string.IsNullOrWhiteSpace(filter.PaymentState))
        {
            var pState = filter.PaymentState.Trim().ToLower();
            if (pState == "paid")
                query = query.Where(i => i.Status == "Paid");
            else if (pState == "partially paid")
                query = query.Where(i => i.Status == "Partially Paid");
            else if (pState == "unpaid")
                query = query.Where(i => i.Status == "Issued" && i.PaidAmount == 0);
            else if (pState == "outstanding")
                query = query.Where(i => i.BalanceAmount > 0 && (i.Status == "Issued" || i.Status == "Partially Paid" || i.Status == "Overdue"));
            else if (pState == "overdue")
                query = query.Where(i => i.Status == "Overdue" || (i.BalanceAmount > 0 && i.DueDate < DateTime.UtcNow.Date));
        }

        if (filter.MinOutstandingAmount.HasValue)
            query = query.Where(i => i.BalanceAmount >= filter.MinOutstandingAmount.Value);
        if (filter.MaxOutstandingAmount.HasValue)
            query = query.Where(i => i.BalanceAmount <= filter.MaxOutstandingAmount.Value);
        if (filter.MinTotalAmount.HasValue)
            query = query.Where(i => i.TotalAmount >= filter.MinTotalAmount.Value);
        if (filter.MaxTotalAmount.HasValue)
            query = query.Where(i => i.TotalAmount <= filter.MaxTotalAmount.Value);

        var totalCount = await query.CountAsync(cancellationToken);

        bool isDesc = string.IsNullOrWhiteSpace(filter.SortOrder) || filter.SortOrder.ToLower() == "desc";
        var sortBy = filter.SortBy?.Trim().ToLower();

        query = sortBy switch
        {
            "invoicenumber" => isDesc ? query.OrderByDescending(i => i.InvoiceNumber) : query.OrderBy(i => i.InvoiceNumber),
            "totalamount" => isDesc ? query.OrderByDescending(i => i.TotalAmount) : query.OrderBy(i => i.TotalAmount),
            "balanceamount" => isDesc ? query.OrderByDescending(i => i.BalanceAmount) : query.OrderBy(i => i.BalanceAmount),
            _ => isDesc ? query.OrderByDescending(i => i.InvoiceDate).ThenByDescending(i => i.Id) : query.OrderBy(i => i.InvoiceDate).ThenBy(i => i.Id),
        };

        var items = await query
            .Skip((filter.Page - 1) * filter.PageSize)
            .Take(filter.PageSize)
            .ToListAsync(cancellationToken);

        return new PagedResult<Invoice>(items, totalCount, filter.Page, filter.PageSize);
    }

    public async Task<List<InvoiceSummaryDto>> GetSummaryAsync(int tenantId, CancellationToken cancellationToken = default)
    {
        var baseQuery = _dbContext.Invoices
            .Include(i => i.Customer)
            .AsNoTracking()
            .Where(i => i.TenantId == tenantId && i.Status != "Voided" && i.Status != "Cancelled");

        var summaries = await baseQuery
            .GroupBy(i => !string.IsNullOrEmpty(i.Currency) ? i.Currency : "INR")
            .Select(g => new InvoiceSummaryDto
            {
                Currency = g.Key,
                TotalInvoiced = g.Sum(i => i.Status != "Draft" ? i.TotalAmount : 0),
                TotalPaid = g.Sum(i => i.PaidAmount),
                TotalOutstanding = g.Sum(i => i.Status != "Draft" ? i.BalanceAmount : 0),
                OverdueAmount = g.Sum(i => (i.Status == "Overdue" || (i.BalanceAmount > 0 && i.DueDate < DateTime.UtcNow.Date)) ? i.BalanceAmount : 0),
                OverdueCount = g.Count(i => i.Status == "Overdue" || (i.BalanceAmount > 0 && i.DueDate < DateTime.UtcNow.Date)),
                DraftCount = g.Count(i => i.Status == "Draft"),
                DraftAmount = g.Sum(i => i.Status == "Draft" ? i.TotalAmount : 0)
            })
            .ToListAsync(cancellationToken);

        return summaries;
    }
}








