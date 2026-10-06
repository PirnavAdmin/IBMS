using Billing.Application.Interfaces;
using Billing.Application.Services;
using Billing.Contracts;
using Billing.Contracts.Payment;
using Billing.Domain.Entities;
using Billing.Domain.Enums;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Repositories;

public class PaymentRepository : IPaymentRepository
{
    private readonly BillingDbContext _context;

    public PaymentRepository(BillingDbContext context)
    {
        _context = context;
    }

    public async Task<Payment?> GetByIdAsync(int tenantId, int id)
    {
        return await _context.Payments
            .AsNoTracking()
            .Include(p => p.Customer)
            .Include(p => p.Allocations)
                .ThenInclude(a => a.Invoice)
            .FirstOrDefaultAsync(p => p.TenantId == tenantId && p.Id == id);
    }

    public async Task<Payment?> GetByIdForUpdateAsync(int tenantId, int id)
    {
        return await _context.Payments
            .Include(p => p.Customer)
            .Include(p => p.Allocations)
                .ThenInclude(a => a.Invoice)
            .FirstOrDefaultAsync(p => p.TenantId == tenantId && p.Id == id);
    }

    public async Task<Payment?> GetByIdempotencyKeyAsync(int tenantId, string idempotencyKey)
    {
        return await _context.Payments
            .AsNoTracking()
            .Include(p => p.Customer)
            .Include(p => p.Allocations)
                .ThenInclude(a => a.Invoice)
            .FirstOrDefaultAsync(p => p.TenantId == tenantId && p.IdempotencyKey == idempotencyKey);
    }

    public async Task<Payment?> GetByProviderTransactionAsync(int tenantId, string providerName, string providerTransactionId)
    {
        return await _context.Payments
            .Include(p => p.Customer)
            .Include(p => p.Allocations)
                .ThenInclude(a => a.Invoice)
            .FirstOrDefaultAsync(p => p.TenantId == tenantId
                && p.Method == PaymentMethod.Gateway
                && p.ProviderName == providerName
                && p.ProviderTransactionId == providerTransactionId);
    }

    public async Task<bool> ExistsPaymentNumberAsync(int tenantId, string paymentNumber)
    {
        return await _context.Payments
            .AnyAsync(p => p.TenantId == tenantId && p.PaymentNumber == paymentNumber);
    }

    public async Task<PagedResult<Payment>> GetPagedListAsync(
        int tenantId,
        PaymentListFilterRequest filter,
        int? restrictedCustomerId = null)
    {
        var query = _context.Payments
            .AsNoTracking()
            .Include(p => p.Customer)
            .Include(p => p.Allocations)
                .ThenInclude(a => a.Invoice)
            .Where(p => p.TenantId == tenantId);

        if (restrictedCustomerId.HasValue)
        {
            query = query.Where(p => p.CustomerId == restrictedCustomerId.Value);
        }

        if (filter.CustomerId.HasValue)
        {
            query = query.Where(p => p.CustomerId == filter.CustomerId.Value);
        }

        if (filter.BranchId.HasValue)
        {
            query = query.Where(p => p.BranchId == filter.BranchId.Value);
        }

        if (filter.InvoiceId.HasValue)
        {
            var invId = filter.InvoiceId.Value;
            query = query.Where(p => p.Allocations.Any(a => a.InvoiceId == invId));
        }

        if (!string.IsNullOrWhiteSpace(filter.Status))
        {
            if (Enum.TryParse<PaymentStatus>(filter.Status.Trim(), true, out var statusEnum))
            {
                query = query.Where(p => p.Status == statusEnum);
            }
        }

        if (!string.IsNullOrWhiteSpace(filter.Method))
        {
            if (PaymentValidator.TryParsePaymentMethod(filter.Method, out var methodEnum))
            {
                query = query.Where(p => p.Method == methodEnum);
            }
        }

        if (filter.FromDate.HasValue)
        {
            var fromDate = filter.FromDate.Value.Date;
            query = query.Where(p => p.PaymentDate >= fromDate);
        }

        if (filter.ToDate.HasValue)
        {
            var toDateEnd = filter.ToDate.Value.Date.AddDays(1).AddTicks(-1);
            query = query.Where(p => p.PaymentDate <= toDateEnd);
        }

        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            var search = filter.Search.Trim().ToLower();
            query = query.Where(p =>
                p.PaymentNumber.ToLower().Contains(search) ||
                (p.Reference != null && p.Reference.ToLower().Contains(search)) ||
                (p.Customer != null && p.Customer.Name.ToLower().Contains(search)) ||
                (p.Customer != null && p.Customer.CompanyName != null && p.Customer.CompanyName.ToLower().Contains(search)) ||
                (p.Customer != null && p.Customer.CustomerCode.ToLower().Contains(search)) ||
                p.Allocations.Any(a => a.Invoice != null && a.Invoice.InvoiceNumber.ToLower().Contains(search)));
        }

        var totalCount = await query.CountAsync();

        var isAsc = string.Equals(filter.SortOrder, "asc", StringComparison.OrdinalIgnoreCase);
        query = (filter.SortBy?.ToLowerInvariant()) switch
        {
            "paymentnumber" => isAsc ? query.OrderBy(p => p.PaymentNumber) : query.OrderByDescending(p => p.PaymentNumber),
            "amount" => isAsc ? query.OrderBy(p => p.Amount) : query.OrderByDescending(p => p.Amount),
            "status" => isAsc ? query.OrderBy(p => p.Status) : query.OrderByDescending(p => p.Status),
            "method" => isAsc ? query.OrderBy(p => p.Method) : query.OrderByDescending(p => p.Method),
            "createdat" or "createdatutc" => isAsc ? query.OrderBy(p => p.CreatedAtUtc) : query.OrderByDescending(p => p.CreatedAtUtc),
            _ => isAsc
                ? query.OrderBy(p => p.PaymentDate).ThenBy(p => p.Id)
                : query.OrderByDescending(p => p.PaymentDate).ThenByDescending(p => p.Id)
        };

        var page = filter.PageNumber <= 0 ? 1 : filter.PageNumber;
        var pageSize = filter.PageSize <= 0 ? 10 : Math.Min(filter.PageSize, 100);

        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return new PagedResult<Payment>(items, totalCount, page, pageSize);
    }

    public async Task<decimal> GetEffectiveAllocatedSumForInvoiceAsync(int tenantId, int invoiceId)
    {
        return await _context.InvoicePaymentAllocations
            .Where(a => a.TenantId == tenantId
                && a.InvoiceId == invoiceId
                && !a.IsReversed
                && a.Payment != null
                && a.Payment.Status == PaymentStatus.Completed)
            .SumAsync(a => (decimal?)a.AllocatedAmount) ?? 0m;
    }

    public async Task<Payment> AddAsync(Payment payment)
    {
        await _context.Payments.AddAsync(payment);
        await _context.SaveChangesAsync();
        return payment;
    }

    public async Task UpdateAsync(Payment payment)
    {
        _context.Payments.Update(payment);
        await _context.SaveChangesAsync();
    }
}
