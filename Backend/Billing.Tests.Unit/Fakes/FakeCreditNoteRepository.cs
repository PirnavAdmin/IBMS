using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.CreditNote;
using Billing.Domain.Entities;

namespace Billing.Tests.Unit.Fakes;

public class FakeCreditNoteRepository : ICreditNoteRepository
{
    private readonly List<CreditNote> _creditNotes = new();
    private readonly List<CreditNoteRefund> _refunds = new();
    private readonly object _lock = new();
    private int _nextId = 1;
    private int _nextRefundId = 1;

    public Task<CreditNote?> GetByIdAsync(int id, int tenantId, CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            var cn = _creditNotes.FirstOrDefault(c => c.Id == id && c.TenantId == tenantId);
            return Task.FromResult(cn != null ? CloneCreditNote(cn) : null);
        }
    }

    public Task<CreditNote?> GetByIdForUpdateAsync(int id, int tenantId, CancellationToken cancellationToken = default)
    {
        return GetByIdAsync(id, tenantId, cancellationToken);
    }

    public Task<CreditNote?> GetByCreditNoteNumberAsync(string creditNoteNumber, int tenantId, CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            var cn = _creditNotes.FirstOrDefault(c => c.CreditNoteNumber == creditNoteNumber && c.TenantId == tenantId);
            return Task.FromResult(cn != null ? CloneCreditNote(cn) : null);
        }
    }

    public Task<List<CreditNote>> GetByInvoiceIdAsync(int invoiceId, int tenantId, CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            var list = _creditNotes
                .Where(c => c.InvoiceId == invoiceId && c.TenantId == tenantId)
                .Select(CloneCreditNote)
                .ToList();
            return Task.FromResult(list);
        }
    }

    public Task<PagedResult<CreditNoteListItemDto>> GetPagedAsync(
        int tenantId,
        CreditNoteFilterRequest filter,
        int? restrictedCustomerId = null,
        CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            var query = _creditNotes.Where(c => c.TenantId == tenantId).AsQueryable();

            if (restrictedCustomerId.HasValue)
            {
                query = query.Where(c => c.CustomerId == restrictedCustomerId.Value);
            }

            if (filter.CustomerId.HasValue)
            {
                query = query.Where(c => c.CustomerId == filter.CustomerId.Value);
            }

            if (filter.InvoiceId.HasValue)
            {
                query = query.Where(c => c.InvoiceId == filter.InvoiceId.Value);
            }

            if (!string.IsNullOrWhiteSpace(filter.Status))
            {
                query = query.Where(c => c.Status.Equals(filter.Status, StringComparison.OrdinalIgnoreCase));
            }

            var total = query.Count();
            var items = query
                .Skip((filter.Page - 1) * filter.PageSize)
                .Take(filter.PageSize)
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
                    Currency = "INR",
                    CreatedAtUtc = c.CreatedAtUtc
                })
                .ToList();

            return Task.FromResult(new PagedResult<CreditNoteListItemDto>
            {
                Items = items,
                TotalCount = total,
                PageNumber = filter.Page,
                PageSize = filter.PageSize
            });
        }
    }

    public Task<CreditNote> AddAsync(CreditNote creditNote, CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            creditNote.Id = _nextId++;
            _creditNotes.Add(CloneCreditNote(creditNote));
            return Task.FromResult(CloneCreditNote(creditNote));
        }
    }

    public Task<CreditNote> UpdateAsync(CreditNote creditNote, CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            var idx = _creditNotes.FindIndex(c => c.Id == creditNote.Id && c.TenantId == creditNote.TenantId);
            if (idx >= 0)
            {
                _creditNotes[idx] = CloneCreditNote(creditNote);
            }
            return Task.FromResult(CloneCreditNote(creditNote));
        }
    }

    public Task<CreditNoteRefund> AddRefundAsync(CreditNoteRefund refund, CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            refund.Id = _nextRefundId++;
            _refunds.Add(refund);

            var cn = _creditNotes.FirstOrDefault(c => c.Id == refund.CreditNoteId);
            if (cn != null)
            {
                cn.Refunds.Add(refund);
            }

            return Task.FromResult(refund);
        }
    }

    public Task<decimal> GetTotalIssuedCreditsForInvoiceAsync(int invoiceId, int tenantId, CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            var sum = _creditNotes
                .Where(c => c.InvoiceId == invoiceId &&
                            c.TenantId == tenantId &&
                            (c.Status == "Issued" || c.Status == "PartiallyRefunded" || c.Status == "Refunded"))
                .Sum(c => c.TotalAmount);

            return Task.FromResult(sum);
        }
    }

    private static CreditNote CloneCreditNote(CreditNote original)
    {
        var copy = new CreditNote
        {
            Id = original.Id,
            TenantId = original.TenantId,
            CreditNoteNumber = original.CreditNoteNumber,
            InvoiceId = original.InvoiceId,
            Invoice = original.Invoice,
            CustomerId = original.CustomerId,
            Customer = original.Customer,
            CreditDate = original.CreditDate,
            Type = original.Type,
            Subtotal = original.Subtotal,
            TaxAmount = original.TaxAmount,
            TotalAmount = original.TotalAmount,
            RefundedAmount = original.RefundedAmount,
            RemainingRefundableAmount = original.RemainingRefundableAmount,
            Status = original.Status,
            Reason = original.Reason,
            Notes = original.Notes,
            CreatedBy = original.CreatedBy,
            CreatedAtUtc = original.CreatedAtUtc,
            ApprovedBy = original.ApprovedBy,
            ApprovedAtUtc = original.ApprovedAtUtc,
            RejectionReason = original.RejectionReason,
            RejectedBy = original.RejectedBy,
            RejectedAtUtc = original.RejectedAtUtc,
            IssuedBy = original.IssuedBy,
            IssuedAtUtc = original.IssuedAtUtc,
            CancelledBy = original.CancelledBy,
            CancelledAtUtc = original.CancelledAtUtc,
            CancellationReason = original.CancellationReason,
            UpdatedAtUtc = original.UpdatedAtUtc,
            RowVersion = original.RowVersion,
            Items = original.Items.Select(i => new CreditNoteItem
            {
                Id = i.Id,
                CreditNoteId = i.CreditNoteId,
                InvoiceItemId = i.InvoiceItemId,
                ProductId = i.ProductId,
                Description = i.Description,
                Quantity = i.Quantity,
                UnitPrice = i.UnitPrice,
                DiscountAmount = i.DiscountAmount,
                TaxType = i.TaxType,
                TaxRate = i.TaxRate,
                TaxAmount = i.TaxAmount,
                TotalAmount = i.TotalAmount,
                HSNSAC = i.HSNSAC
            }).ToList(),
            Refunds = original.Refunds.Select(r => new CreditNoteRefund
            {
                Id = r.Id,
                TenantId = r.TenantId,
                CreditNoteId = r.CreditNoteId,
                RefundNumber = r.RefundNumber,
                RefundDate = r.RefundDate,
                RefundAmount = r.RefundAmount,
                PaymentMethod = r.PaymentMethod,
                ReferenceNumber = r.ReferenceNumber,
                Notes = r.Notes,
                ProcessedBy = r.ProcessedBy,
                CreatedAtUtc = r.CreatedAtUtc
            }).ToList()
        };
        return copy;
    }
}
