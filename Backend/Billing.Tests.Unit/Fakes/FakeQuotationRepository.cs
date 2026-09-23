using Billing.Application.Interfaces;
using Billing.Contracts.Quotation;
using Billing.Domain.Entities;
using Billing.Domain.Enums;

namespace Billing.Tests.Unit.Fakes;

public class FakeQuotationRepository : IQuotationRepository
{
    public List<Quotation> Quotations { get; } = new();

    public Task<Quotation?> GetByIdAsync(int id, int tenantId)
    {
        var match = Quotations.FirstOrDefault(q => q.Id == id && q.TenantId == tenantId);
        return Task.FromResult(match);
    }

    public Task<Quotation?> GetByIdForUpdateAsync(int id, int tenantId)
    {
        return GetByIdAsync(id, tenantId);
    }

    public Task<Quotation?> GetByQuoteNumberAsync(string quoteNumber, int tenantId)
    {
        var normalized = quoteNumber.Trim().ToUpperInvariant();
        var match = Quotations.FirstOrDefault(q => q.TenantId == tenantId && q.QuoteNumber.ToUpper() == normalized);
        return Task.FromResult(match);
    }

    public Task<bool> ExistsQuoteNumberAsync(string quoteNumber, int tenantId, int? excludeId = null)
    {
        var normalized = quoteNumber.Trim().ToUpperInvariant();
        var exists = Quotations.Any(q => q.TenantId == tenantId &&
                                         q.QuoteNumber.ToUpper() == normalized &&
                                         (!excludeId.HasValue || q.Id != excludeId.Value));
        return Task.FromResult(exists);
    }

    public Task<(List<Quotation> Items, int TotalCount)> GetPagedListAsync(int tenantId, QuotationListFilterRequest filter)
    {
        var query = Quotations.Where(q => q.TenantId == tenantId).AsQueryable();

        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            var search = filter.Search.Trim().ToLower();
            query = query.Where(q =>
                q.QuoteNumber.ToLower().Contains(search) ||
                (q.Customer != null && q.Customer.Name.ToLower().Contains(search)) ||
                (q.Reference != null && q.Reference.ToLower().Contains(search)));
        }

        if (!string.IsNullOrWhiteSpace(filter.Status) && !string.Equals(filter.Status, "All", StringComparison.OrdinalIgnoreCase))
        {
            if (Enum.TryParse<QuotationStatus>(filter.Status.Trim(), true, out var statusEnum))
            {
                query = query.Where(q => q.Status == statusEnum);
            }
        }

        if (filter.CustomerId.HasValue && filter.CustomerId.Value > 0)
        {
            query = query.Where(q => q.CustomerId == filter.CustomerId.Value);
        }

        if (filter.FromDate.HasValue)
        {
            query = query.Where(q => q.QuotationDate >= filter.FromDate.Value.Date);
        }

        if (filter.ToDate.HasValue)
        {
            query = query.Where(q => q.QuotationDate <= filter.ToDate.Value.Date.AddDays(1).AddTicks(-1));
        }

        var totalCount = query.Count();

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

        var items = query.Skip((pageNumber - 1) * pageSize).Take(pageSize).ToList();
        return Task.FromResult((items, totalCount));
    }

    public Task<Quotation> AddAsync(Quotation quotation)
    {
        if (quotation.Id <= 0)
        {
            quotation.Id = Quotations.Any() ? Quotations.Max(q => q.Id) + 1 : 1;
        }
        Quotations.Add(quotation);
        return Task.FromResult(quotation);
    }

    public Task<Quotation> UpdateAsync(Quotation quotation)
    {
        quotation.UpdatedAtUtc = DateTime.UtcNow;
        quotation.RowVersion = DateTime.UtcNow;
        return Task.FromResult(quotation);
    }
}
