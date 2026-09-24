using Billing.Application.Interfaces;
using Billing.Contracts.Quotation;
using Billing.Domain.Entities;
using Billing.Domain.Enums;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Repositories;

public class QuotationRepository : IQuotationRepository
{
    private readonly BillingDbContext _context;

    public QuotationRepository(BillingDbContext context)
    {
        _context = context;
    }

    public async Task<Quotation?> GetByIdAsync(int id, int tenantId)
    {
        return await _context.Quotations
            .AsNoTracking()
            .Include(q => q.Customer)
            .Include(q => q.Items)
                .ThenInclude(i => i.Product)
            .Include(q => q.Communications)
            .FirstOrDefaultAsync(q => q.Id == id && q.TenantId == tenantId);
    }

    public async Task<Quotation?> GetByIdForUpdateAsync(int id, int tenantId)
    {
        return await _context.Quotations
            .Include(q => q.Customer)
            .Include(q => q.Items)
            .FirstOrDefaultAsync(q => q.Id == id && q.TenantId == tenantId);
    }

    public async Task<Quotation?> GetByQuoteNumberAsync(string quoteNumber, int tenantId)
    {
        var normalized = quoteNumber.Trim().ToUpperInvariant();
        return await _context.Quotations
            .AsNoTracking()
            .Include(q => q.Customer)
            .Include(q => q.Items)
            .FirstOrDefaultAsync(q => q.TenantId == tenantId && q.QuoteNumber.ToUpper() == normalized);
    }

    public async Task<bool> ExistsQuoteNumberAsync(string quoteNumber, int tenantId, int? excludeId = null)
    {
        var normalized = quoteNumber.Trim().ToUpperInvariant();
        var query = _context.Quotations
            .Where(q => q.TenantId == tenantId && q.QuoteNumber.ToUpper() == normalized);

        if (excludeId.HasValue && excludeId.Value > 0)
        {
            query = query.Where(q => q.Id != excludeId.Value);
        }

        return await query.AnyAsync();
    }

    public async Task<(List<Quotation> Items, int TotalCount)> GetPagedListAsync(int tenantId, QuotationListFilterRequest filter)
    {
        var query = _context.Quotations
            .AsNoTracking()
            .Include(q => q.Customer)
            .Include(q => q.Items)
            .Where(q => q.TenantId == tenantId);

        // Search Filter
        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            var search = filter.Search.Trim().ToLower();
            query = query.Where(q =>
                q.QuoteNumber.ToLower().Contains(search) ||
                (q.Customer != null && q.Customer.Name.ToLower().Contains(search)) ||
                (q.Reference != null && q.Reference.ToLower().Contains(search)));
        }

        // Status Filter
        if (!string.IsNullOrWhiteSpace(filter.Status) && !string.Equals(filter.Status, "All", StringComparison.OrdinalIgnoreCase))
        {
            if (Enum.TryParse<QuotationStatus>(filter.Status.Trim(), true, out var statusEnum))
            {
                query = query.Where(q => q.Status == statusEnum);
            }
        }

        // Customer Filter
        if (filter.CustomerId.HasValue && filter.CustomerId.Value > 0)
        {
            query = query.Where(q => q.CustomerId == filter.CustomerId.Value);
        }

        // Date Range Filters
        if (filter.FromDate.HasValue)
        {
            var from = filter.FromDate.Value.Date;
            query = query.Where(q => q.QuotationDate >= from);
        }

        if (filter.ToDate.HasValue)
        {
            var to = filter.ToDate.Value.Date.AddDays(1).AddTicks(-1);
            query = query.Where(q => q.QuotationDate <= to);
        }

        var totalCount = await query.CountAsync();

        // Sorting
        var isAscending = string.Equals(filter.SortOrder, "asc", StringComparison.OrdinalIgnoreCase);
        query = (filter.SortBy?.ToLowerInvariant()) switch
        {
            "quotenumber" => isAscending ? query.OrderBy(q => q.QuoteNumber) : query.OrderByDescending(q => q.QuoteNumber),
            "customer" or "customername" => isAscending ? query.OrderBy(q => q.Customer != null ? q.Customer.Name : string.Empty) : query.OrderByDescending(q => q.Customer != null ? q.Customer.Name : string.Empty),
            "totalamount" => isAscending ? query.OrderBy(q => q.TotalAmount) : query.OrderByDescending(q => q.TotalAmount),
            "status" => isAscending ? query.OrderBy(q => q.Status) : query.OrderByDescending(q => q.Status),
            "validuntil" => isAscending ? query.OrderBy(q => q.ValidUntil) : query.OrderByDescending(q => q.ValidUntil),
            _ => isAscending ? query.OrderBy(q => q.QuotationDate) : query.OrderByDescending(q => q.QuotationDate)
        };

        var pageNumber = filter.PageNumber < 1 ? 1 : filter.PageNumber;
        var pageSize = filter.PageSize < 1 ? 10 : (filter.PageSize > 100 ? 100 : filter.PageSize);

        var items = await query
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return (items, totalCount);
    }

    public async Task<Quotation> AddAsync(Quotation quotation)
    {
        await _context.Quotations.AddAsync(quotation);
        await _context.SaveChangesAsync();
        return quotation;
    }

    public async Task<Quotation> UpdateAsync(Quotation quotation)
    {
        quotation.UpdatedAtUtc = DateTime.UtcNow;
        quotation.RowVersion = DateTime.UtcNow;
        _context.Quotations.Update(quotation);
        await _context.SaveChangesAsync();
        return quotation;
    }
}
