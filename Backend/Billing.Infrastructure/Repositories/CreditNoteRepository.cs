using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.CreditNote;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Repositories;

public class CreditNoteRepository : ICreditNoteRepository
{
    private readonly BillingDbContext _context;

    public CreditNoteRepository(BillingDbContext context)
    {
        _context = context;
    }

    public async Task<CreditNote?> GetByIdAsync(int id, int tenantId, CancellationToken cancellationToken = default)
    {
        return await _context.CreditNotes
            .AsNoTracking()
            .Include(c => c.Invoice)
                .ThenInclude(i => i!.Customer)
            .Include(c => c.Customer)
            .Include(c => c.Items)
            .Include(c => c.Refunds)
            .FirstOrDefaultAsync(c => c.Id == id && c.TenantId == tenantId, cancellationToken);
    }

    public async Task<CreditNote?> GetByIdForUpdateAsync(int id, int tenantId, CancellationToken cancellationToken = default)
    {
        return await _context.CreditNotes
            .Include(c => c.Invoice)
            .Include(c => c.Items)
            .Include(c => c.Refunds)
            .FirstOrDefaultAsync(c => c.Id == id && c.TenantId == tenantId, cancellationToken);
    }

    public async Task<CreditNote?> GetByCreditNoteNumberAsync(string creditNoteNumber, int tenantId, CancellationToken cancellationToken = default)
    {
        return await _context.CreditNotes
            .AsNoTracking()
            .Include(c => c.Invoice)
            .Include(c => c.Items)
            .Include(c => c.Refunds)
            .FirstOrDefaultAsync(c => c.CreditNoteNumber == creditNoteNumber && c.TenantId == tenantId, cancellationToken);
    }

    public async Task<List<CreditNote>> GetByInvoiceIdAsync(int invoiceId, int tenantId, CancellationToken cancellationToken = default)
    {
        return await _context.CreditNotes
            .AsNoTracking()
            .Include(c => c.Items)
            .Where(c => c.InvoiceId == invoiceId && c.TenantId == tenantId)
            .ToListAsync(cancellationToken);
    }

    public async Task<PagedResult<CreditNoteListItemDto>> GetPagedAsync(
        int tenantId,
        CreditNoteFilterRequest filter,
        int? restrictedCustomerId = null,
        CancellationToken cancellationToken = default)
    {
        var query = _context.CreditNotes
            .AsNoTracking()
            .Include(c => c.Invoice)
            .Include(c => c.Customer)
            .Where(c => c.TenantId == tenantId);

        if (restrictedCustomerId.HasValue)
        {
            query = query.Where(c => c.CustomerId == restrictedCustomerId.Value);
        }

        if (filter.CustomerId.HasValue && filter.CustomerId.Value > 0)
        {
            query = query.Where(c => c.CustomerId == filter.CustomerId.Value);
        }

        if (filter.InvoiceId.HasValue && filter.InvoiceId.Value > 0)
        {
            query = query.Where(c => c.InvoiceId == filter.InvoiceId.Value);
        }

        if (!string.IsNullOrWhiteSpace(filter.Status))
        {
            var status = filter.Status.Trim();
            query = query.Where(c => c.Status == status);
        }

        if (!string.IsNullOrWhiteSpace(filter.Type))
        {
            var type = filter.Type.Trim();
            query = query.Where(c => c.Type == type);
        }

        if (filter.FromDate.HasValue)
        {
            query = query.Where(c => c.CreditDate >= filter.FromDate.Value);
        }

        if (filter.ToDate.HasValue)
        {
            query = query.Where(c => c.CreditDate <= filter.ToDate.Value);
        }

        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            var search = filter.Search.Trim().ToLower();
            query = query.Where(c =>
                c.CreditNoteNumber.ToLower().Contains(search) ||
                (c.Invoice != null && c.Invoice.InvoiceNumber.ToLower().Contains(search)) ||
                (c.Customer != null && (c.Customer.Name.ToLower().Contains(search) || (c.Customer.CompanyName != null && c.Customer.CompanyName.ToLower().Contains(search)))) ||
                c.Reason.ToLower().Contains(search));
        }

        var totalCount = await query.CountAsync(cancellationToken);

        // Sorting
        query = (filter.SortBy?.ToLower(), filter.SortDescending) switch
        {
            ("creditnotenumber", true) => query.OrderByDescending(c => c.CreditNoteNumber),
            ("creditnotenumber", false) => query.OrderBy(c => c.CreditNoteNumber),
            ("totalamount", true) => query.OrderByDescending(c => c.TotalAmount),
            ("totalamount", false) => query.OrderBy(c => c.TotalAmount),
            ("status", true) => query.OrderByDescending(c => c.Status),
            ("status", false) => query.OrderBy(c => c.Status),
            ("createdat", true) => query.OrderByDescending(c => c.CreatedAtUtc),
            ("createdat", false) => query.OrderBy(c => c.CreatedAtUtc),
            (_, false) => query.OrderBy(c => c.CreditDate),
            _ => query.OrderByDescending(c => c.CreditDate)
        };

        var page = Math.Max(1, filter.Page);
        var pageSize = Math.Clamp(filter.PageSize, 1, 100);

        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(c => new CreditNoteListItemDto
            {
                Id = c.Id,
                CreditNoteNumber = c.CreditNoteNumber,
                InvoiceId = c.InvoiceId,
                InvoiceNumber = c.Invoice != null ? c.Invoice.InvoiceNumber : string.Empty,
                CustomerId = c.CustomerId,
                CustomerName = c.Customer != null ? (c.Customer.CompanyName ?? c.Customer.Name) : string.Empty,
                CreditDate = c.CreditDate,
                Type = c.Type,
                Subtotal = c.Subtotal,
                TaxAmount = c.TaxAmount,
                TotalAmount = c.TotalAmount,
                RefundedAmount = c.RefundedAmount,
                RemainingRefundableAmount = c.RemainingRefundableAmount,
                Status = c.Status,
                Reason = c.Reason,
                Currency = c.Invoice != null && c.Invoice.Customer != null && !string.IsNullOrWhiteSpace(c.Invoice.Customer.Currency)
                    ? c.Invoice.Customer.Currency
                    : "INR",
                CreatedAtUtc = c.CreatedAtUtc
            })
            .ToListAsync(cancellationToken);

        return new PagedResult<CreditNoteListItemDto>
        {
            Items = items,
            TotalCount = totalCount,
            PageNumber = page,
            PageSize = pageSize
        };
    }

    public async Task<CreditNote> AddAsync(CreditNote creditNote, CancellationToken cancellationToken = default)
    {
        _context.CreditNotes.Add(creditNote);
        await _context.SaveChangesAsync(cancellationToken);
        return creditNote;
    }

    public async Task<CreditNote> UpdateAsync(CreditNote creditNote, CancellationToken cancellationToken = default)
    {
        _context.CreditNotes.Update(creditNote);
        await _context.SaveChangesAsync(cancellationToken);
        return creditNote;
    }

    public async Task<CreditNoteRefund> AddRefundAsync(CreditNoteRefund refund, CancellationToken cancellationToken = default)
    {
        _context.CreditNoteRefunds.Add(refund);
        await _context.SaveChangesAsync(cancellationToken);
        return refund;
    }

    public async Task<decimal> GetTotalIssuedCreditsForInvoiceAsync(int invoiceId, int tenantId, CancellationToken cancellationToken = default)
    {
        return await _context.CreditNotes
            .AsNoTracking()
            .Where(c => c.InvoiceId == invoiceId &&
                        c.TenantId == tenantId &&
                        (c.Status == "Issued" || c.Status == "PartiallyRefunded" || c.Status == "Refunded"))
            .SumAsync(c => (decimal?)c.TotalAmount, cancellationToken) ?? 0m;
    }
}
