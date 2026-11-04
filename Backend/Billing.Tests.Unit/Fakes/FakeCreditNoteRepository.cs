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

    public bool ThrowOnUpdate { get; set; }
    public bool ThrowOnAddRefund { get; set; }

    public (List<CreditNote> CreditNotes, List<CreditNoteRefund> Refunds) CreateSnapshot()
    {
        lock (_lock)
        {
            return (
                _creditNotes.Select(CloneCreditNote).ToList(),
                _refunds.Select(CloneRefund).ToList()
            );
        }
    }

    public void RestoreSnapshot((List<CreditNote> CreditNotes, List<CreditNoteRefund> Refunds) snapshot)
    {
        lock (_lock)
        {
            _creditNotes.Clear();
            _creditNotes.AddRange(snapshot.CreditNotes.Select(CloneCreditNote));
            _refunds.Clear();
            _refunds.AddRange(snapshot.Refunds.Select(CloneRefund));
        }
    }

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
                    DiscountAmount = c.DiscountAmount,
                    TaxAmount = c.TaxAmount,
                    CgstAmount = c.CgstAmount,
                    SgstAmount = c.SgstAmount,
                    IgstAmount = c.IgstAmount,
                    RoundingAmount = c.RoundingAmount,
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
            if (creditNote.Id == 0)
            {
                creditNote.Id = _nextId++;
            }
            else if (creditNote.Id >= _nextId)
            {
                _nextId = creditNote.Id + 1;
            }
            var itemId = 1;
            foreach (var item in creditNote.Items)
            {
                if (item.Id == 0) item.Id = itemId++;
                item.CreditNoteId = creditNote.Id;
            }
            _creditNotes.Add(CloneCreditNote(creditNote));
            return Task.FromResult(CloneCreditNote(creditNote));
        }
    }

    public Task<CreditNote> UpdateAsync(CreditNote creditNote, CancellationToken cancellationToken = default)
    {
        if (ThrowOnUpdate)
        {
            throw new InvalidOperationException("Simulated credit note repository update failure.");
        }

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
        if (ThrowOnAddRefund)
        {
            throw new InvalidOperationException("Simulated refund repository persistence failure.");
        }

        lock (_lock)
        {
            refund.Id = _nextRefundId++;
            var cloned = CloneRefund(refund);
            _refunds.Add(cloned);

            var cn = _creditNotes.FirstOrDefault(c => c.Id == refund.CreditNoteId && c.TenantId == refund.TenantId);
            if (cn != null && cn.Refunds.All(r => r.Id != refund.Id))
            {
                cn.Refunds.Add(CloneRefund(refund));
            }

            return Task.FromResult(CloneRefund(refund));
        }
    }

    public Task<decimal> GetTotalIssuedCreditsForInvoiceAsync(int invoiceId, int tenantId, CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            var sum = _creditNotes
                .Where(c => c.InvoiceId == invoiceId &&
                            c.TenantId == tenantId &&
                            (string.Equals(c.Status, "Issued", StringComparison.OrdinalIgnoreCase) ||
                             string.Equals(c.Status, "PartiallyRefunded", StringComparison.OrdinalIgnoreCase) ||
                             string.Equals(c.Status, "Refunded", StringComparison.OrdinalIgnoreCase)))
                .Sum(c => c.TotalAmount);

            return Task.FromResult(sum);
        }
    }

    private static CreditNoteRefund CloneRefund(CreditNoteRefund r)
    {
        return new CreditNoteRefund
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
            Status = r.Status,
            FailureReason = r.FailureReason,
            ProcessedBy = r.ProcessedBy,
            CreatedAtUtc = r.CreatedAtUtc
        };
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
            DiscountAmount = original.DiscountAmount,
            TaxAmount = original.TaxAmount,
            CgstAmount = original.CgstAmount,
            SgstAmount = original.SgstAmount,
            IgstAmount = original.IgstAmount,
            RoundingAmount = original.RoundingAmount,
            TotalAmount = original.TotalAmount,
            RefundedAmount = original.RefundedAmount,
            RemainingRefundableAmount = original.RemainingRefundableAmount,
            IdempotencyKey = original.IdempotencyKey,
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
                TaxableAmount = i.TaxableAmount,
                TaxType = i.TaxType,
                TaxRate = i.TaxRate,
                TaxAmount = i.TaxAmount,
                CgstAmount = i.CgstAmount,
                SgstAmount = i.SgstAmount,
                IgstAmount = i.IgstAmount,
                IsTaxInclusive = i.IsTaxInclusive,
                TotalAmount = i.TotalAmount,
                HSNSAC = i.HSNSAC
            }).ToList(),
            Refunds = original.Refunds.Select(CloneRefund).ToList()
        };
        return copy;
    }
}
