using Billing.Application.Interfaces;
using Billing.Application.Services;
using Billing.Contracts;
using Billing.Contracts.Payment;
using Billing.Domain.Entities;
using Billing.Domain.Enums;

namespace Billing.Tests.Unit.Fakes;

public class FakeInvoiceRepository : IInvoiceRepository
{
    private readonly List<Invoice> _invoices = new();
    private readonly object _lock = new();
    private int _nextId = 1;

    public bool ThrowOnUpdate { get; set; }
    public Exception? CustomExceptionOnUpdate { get; set; }

    public IReadOnlyList<Invoice> Invoices
    {
        get
        {
            lock (_lock)
            {
                return _invoices.Select(CloneInvoice).ToList();
            }
        }
    }

    public List<Invoice> CreateSnapshot()
    {
        lock (_lock)
        {
            return _invoices.Select(CloneInvoice).ToList();
        }
    }

    public void RestoreSnapshot(List<Invoice> snapshot)
    {
        lock (_lock)
        {
            _invoices.Clear();
            _invoices.AddRange(snapshot.Select(CloneInvoice));
        }
    }

    public Task<Invoice?> GetByIdAsync(int id, int tenantId, CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            var inv = _invoices.FirstOrDefault(i => i.TenantId == tenantId && i.Id == id);
            return Task.FromResult(inv != null ? CloneInvoice(inv) : null);
        }
    }

    public Task<Invoice?> GetByIdForUpdateAsync(int id, int tenantId)
    {
        return GetByIdAsync(id, tenantId);
    }

    public Task<Invoice?> GetByInvoiceNumberAsync(string invoiceNumber, int tenantId)
    {
        lock (_lock)
        {
            var inv = _invoices.FirstOrDefault(i =>
                i.TenantId == tenantId &&
                string.Equals(i.InvoiceNumber, invoiceNumber, StringComparison.OrdinalIgnoreCase));
            return Task.FromResult(inv != null ? CloneInvoice(inv) : null);
        }
    }

    public Task<List<Invoice>> GetEligibleInvoicesAsync(int tenantId, string? search = null, int? customerId = null)
    {
        lock (_lock)
        {
            var list = _invoices
                .Where(i => i.TenantId == tenantId
                    && (!customerId.HasValue || i.CustomerId == customerId.Value)
                    && i.IsEligibleForPayment(out _))
                .Select(CloneInvoice)
                .ToList();

            return Task.FromResult(list);
        }
    }

    public Task<List<Invoice>> GetAllAsync(int tenantId)
    {
        lock (_lock)
        {
            var list = _invoices
                .Where(i => i.TenantId == tenantId)
                .Select(CloneInvoice)
                .ToList();
            return Task.FromResult(list);
        }
    }

    public Task<Invoice> AddAsync(Invoice invoice)
    {
        lock (_lock)
        {
            if (invoice.Id == 0)
            {
                invoice.Id = _nextId++;
            }
            else if (invoice.Id >= _nextId)
            {
                _nextId = invoice.Id + 1;
            }

            _invoices.Add(CloneInvoice(invoice));
            return Task.FromResult(invoice);
        }
    }

    public Task<Invoice> UpdateAsync(Invoice invoice, CancellationToken cancellationToken = default)
    {
        if (CustomExceptionOnUpdate != null)
        {
            throw CustomExceptionOnUpdate;
        }
        if (ThrowOnUpdate)
        {
            throw new InvalidOperationException("Simulated mid-transaction failure during Invoice update.");
        }

        lock (_lock)
        {
            var index = _invoices.FindIndex(i => i.Id == invoice.Id && i.TenantId == invoice.TenantId);
            if (index >= 0)
            {
                _invoices[index] = CloneInvoice(invoice);
            }
            return Task.FromResult(invoice);
        }
    }

    public Task<PagedResult<Invoice>> GetPagedAsync(int tenantId, InvoiceFilterRequest filter, CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            var list = _invoices.Where(i => i.TenantId == tenantId).Select(CloneInvoice).ToList();
            var page = filter.Page <= 0 ? 1 : filter.Page;
            var pageSize = filter.PageSize <= 0 ? 10 : filter.PageSize;
            var paged = new PagedResult<Invoice>
            {
                Items = list.Skip((page - 1) * pageSize).Take(pageSize).ToList(),
                TotalCount = list.Count,
                PageNumber = page,
                PageSize = pageSize
            };
            return Task.FromResult(paged);
        }
    }

    public Task<List<InvoiceSummaryDto>> GetSummaryAsync(int tenantId, CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            var list = _invoices.Where(i => i.TenantId == tenantId).ToList();
            var summary = new InvoiceSummaryDto
            {
                TotalInvoiced = list.Sum(i => i.TotalAmount),
                TotalPaid = list.Sum(i => i.PaidAmount),
                TotalOutstanding = list.Sum(i => i.BalanceAmount),
                OverdueCount = list.Count(i => i.DueDate < DateTime.UtcNow && i.BalanceAmount > 0)
            };
            return Task.FromResult(new List<InvoiceSummaryDto> { summary });
        }
    }

    private static Invoice CloneInvoice(Invoice src)
    {
        return new Invoice
        {
            Id = src.Id,
            TenantId = src.TenantId,
            InvoiceNumber = src.InvoiceNumber,
            CustomerId = src.CustomerId,
            Customer = src.Customer,
            InvoiceDate = src.InvoiceDate,
            DueDate = src.DueDate,
            Reference = src.Reference,
            Status = src.Status,
            Subtotal = src.Subtotal,
            DiscountAmount = src.DiscountAmount,
            TaxAmount = src.TaxAmount,
            ChargesAmount = src.ChargesAmount,
            TotalAmount = src.TotalAmount,
            PaidAmount = src.PaidAmount,
            CreditedAmount = src.CreditedAmount,
            BalanceAmount = src.BalanceAmount,
            Notes = src.Notes,
            TermsAndConditions = src.TermsAndConditions,
            QuotationId = src.QuotationId,
            CreatedAtUtc = src.CreatedAtUtc,
            UpdatedAtUtc = src.UpdatedAtUtc,
            RowVersion = src.RowVersion,
            Items = src.Items.Select(i => new InvoiceItem
            {
                Id = i.Id,
                InvoiceId = i.InvoiceId,
                ProductId = i.ProductId,
                Description = i.Description,
                Quantity = i.Quantity,
                UnitPrice = i.UnitPrice,
                DiscountType = i.DiscountType,
                DiscountRate = i.DiscountRate,
                DiscountAmount = i.DiscountAmount,
                TaxType = i.TaxType,
                TaxRate = i.TaxRate,
                TaxAmount = i.TaxAmount,
                TotalAmount = i.TotalAmount,
                HSNSAC = i.HSNSAC
            }).ToList(),
            PaymentAllocations = src.PaymentAllocations.ToList()
        };
    }
}

public class FakePaymentRepository : IPaymentRepository
{
    private readonly List<Payment> _payments = new();
    private readonly object _lock = new();
    private int _nextPaymentId = 1;
    private int _nextAllocationId = 1;

    public IReadOnlyList<Payment> Payments
    {
        get
        {
            lock (_lock)
            {
                return _payments.Select(ClonePayment).ToList();
            }
        }
    }

    public List<Payment> CreateSnapshot()
    {
        lock (_lock)
        {
            return _payments.Select(ClonePayment).ToList();
        }
    }

    public void RestoreSnapshot(List<Payment> snapshot)
    {
        lock (_lock)
        {
            _payments.Clear();
            _payments.AddRange(snapshot.Select(ClonePayment));
        }
    }

    public Task<Payment?> GetByIdAsync(int tenantId, int id)
    {
        lock (_lock)
        {
            var p = _payments.FirstOrDefault(x => x.TenantId == tenantId && x.Id == id);
            return Task.FromResult(p != null ? ClonePayment(p) : null);
        }
    }

    public Task<Payment?> GetByIdForUpdateAsync(int tenantId, int id)
    {
        return GetByIdAsync(tenantId, id);
    }

    public Task<Payment?> GetByIdempotencyKeyAsync(int tenantId, string idempotencyKey)
    {
        lock (_lock)
        {
            var p = _payments.FirstOrDefault(x =>
                x.TenantId == tenantId &&
                string.Equals(x.IdempotencyKey, idempotencyKey, StringComparison.Ordinal));
            return Task.FromResult(p != null ? ClonePayment(p) : null);
        }
    }

    public Task<Payment?> GetByProviderTransactionAsync(int tenantId, string providerName, string providerTransactionId)
    {
        lock (_lock)
        {
            var p = _payments.FirstOrDefault(x =>
                x.TenantId == tenantId &&
                x.Method == PaymentMethod.Gateway &&
                string.Equals(x.ProviderName, providerName, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(x.ProviderTransactionId, providerTransactionId, StringComparison.Ordinal));
            return Task.FromResult(p != null ? ClonePayment(p) : null);
        }
    }

    public Task<bool> ExistsPaymentNumberAsync(int tenantId, string paymentNumber)
    {
        lock (_lock)
        {
            var exists = _payments.Any(x =>
                x.TenantId == tenantId &&
                string.Equals(x.PaymentNumber, paymentNumber, StringComparison.OrdinalIgnoreCase));
            return Task.FromResult(exists);
        }
    }

    public Task<PagedResult<Payment>> GetPagedListAsync(
        int tenantId,
        PaymentListFilterRequest filter,
        int? restrictedCustomerId = null)
    {
        lock (_lock)
        {
            IEnumerable<Payment> query = _payments.Where(p => p.TenantId == tenantId).Select(ClonePayment);

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
                query = query.Where(p => p.Allocations.Any(a => a.InvoiceId == filter.InvoiceId.Value));
            }

            if (!string.IsNullOrWhiteSpace(filter.Status) && Enum.TryParse<PaymentStatus>(filter.Status.Trim(), true, out var st))
            {
                query = query.Where(p => p.Status == st);
            }

            if (!string.IsNullOrWhiteSpace(filter.Method) && PaymentValidator.TryParsePaymentMethod(filter.Method, out var m))
            {
                query = query.Where(p => p.Method == m);
            }

            if (filter.FromDate.HasValue)
            {
                query = query.Where(p => p.PaymentDate >= filter.FromDate.Value.Date);
            }

            if (filter.ToDate.HasValue)
            {
                query = query.Where(p => p.PaymentDate <= filter.ToDate.Value.Date.AddDays(1).AddTicks(-1));
            }

            if (!string.IsNullOrWhiteSpace(filter.Search))
            {
                var s = filter.Search.Trim().ToLowerInvariant();
                query = query.Where(p =>
                    p.PaymentNumber.ToLowerInvariant().Contains(s) ||
                    (p.Reference != null && p.Reference.ToLowerInvariant().Contains(s)) ||
                    (p.Customer != null && p.Customer.Name.ToLowerInvariant().Contains(s)) ||
                    (p.Customer != null && p.Customer.CompanyName != null && p.Customer.CompanyName.ToLowerInvariant().Contains(s)) ||
                    p.Allocations.Any(a => a.Invoice != null && a.Invoice.InvoiceNumber.ToLowerInvariant().Contains(s)));
            }

            var list = query.OrderByDescending(p => p.PaymentDate).ThenByDescending(p => p.Id).ToList();
            var page = filter.PageNumber <= 0 ? 1 : filter.PageNumber;
            var pageSize = filter.PageSize <= 0 ? 10 : filter.PageSize;

            return Task.FromResult(new PagedResult<Payment>(
                list.Skip((page - 1) * pageSize).Take(pageSize).ToList(),
                list.Count,
                page,
                pageSize));
        }
    }

    public Task<decimal> GetEffectiveAllocatedSumForInvoiceAsync(int tenantId, int invoiceId)
    {
        lock (_lock)
        {
            var sum = _payments
                .Where(p => p.TenantId == tenantId && p.Status == PaymentStatus.Completed)
                .SelectMany(p => p.Allocations)
                .Where(a => a.TenantId == tenantId && a.InvoiceId == invoiceId && !a.IsReversed)
                .Sum(a => a.AllocatedAmount);
            return Task.FromResult(sum);
        }
    }

    public Task<Payment> AddAsync(Payment payment)
    {
        lock (_lock)
        {
            if (payment.Id == 0)
            {
                payment.Id = _nextPaymentId++;
            }

            foreach (var alloc in payment.Allocations)
            {
                if (alloc.Id == 0)
                {
                    alloc.Id = _nextAllocationId++;
                }
                alloc.PaymentId = payment.Id;
            }

            _payments.Add(ClonePayment(payment));
            return Task.FromResult(payment);
        }
    }

    public Task UpdateAsync(Payment payment)
    {
        lock (_lock)
        {
            var idx = _payments.FindIndex(p => p.Id == payment.Id && p.TenantId == payment.TenantId);
            if (idx >= 0)
            {
                _payments[idx] = ClonePayment(payment);
            }
            return Task.CompletedTask;
        }
    }

    private static Payment ClonePayment(Payment src)
    {
        var copy = new Payment
        {
            Id = src.Id,
            TenantId = src.TenantId,
            BranchId = src.BranchId,
            PaymentNumber = src.PaymentNumber,
            CustomerId = src.CustomerId,
            Customer = src.Customer,
            PaymentDate = src.PaymentDate,
            Amount = src.Amount,
            AllocatedAmount = src.AllocatedAmount,
            Currency = src.Currency,
            Method = src.Method,
            CustomMethodName = src.CustomMethodName,
            Reference = src.Reference,
            BankName = src.BankName,
            AccountLabel = src.AccountLabel,
            TransferDate = src.TransferDate,
            UpiPayerMetadata = src.UpiPayerMetadata,
            ChequeNumber = src.ChequeNumber,
            ChequeDate = src.ChequeDate,
            ClearingStatus = src.ClearingStatus,
            ProviderName = src.ProviderName,
            ProviderTransactionId = src.ProviderTransactionId,
            CallbackStatus = src.CallbackStatus,
            MethodDetailsJson = src.MethodDetailsJson,
            Status = src.Status,
            Notes = src.Notes,
            IdempotencyKey = src.IdempotencyKey,
            RequestPayloadHash = src.RequestPayloadHash,
            CreatedBy = src.CreatedBy,
            CreatedAtUtc = src.CreatedAtUtc,
            UpdatedAtUtc = src.UpdatedAtUtc,
            ReversedAtUtc = src.ReversedAtUtc,
            ReversedBy = src.ReversedBy,
            ReversalReason = src.ReversalReason,
            RowVersion = src.RowVersion
        };

        copy.Allocations = src.Allocations.Select(a => new InvoicePaymentAllocation
        {
            Id = a.Id,
            TenantId = a.TenantId,
            PaymentId = a.PaymentId,
            InvoiceId = a.InvoiceId,
            Invoice = a.Invoice,
            AllocatedAmount = a.AllocatedAmount,
            IsReversed = a.IsReversed,
            ReversedAtUtc = a.ReversedAtUtc,
            ReversedBy = a.ReversedBy,
            ReversalReason = a.ReversalReason,
            CreatedAtUtc = a.CreatedAtUtc
        }).ToList();

        return copy;
    }
}

public class SnapshotAuditLogRepository : IAuditLogRepository
{
    private readonly List<AuditLog> _logs = new();
    private readonly object _lock = new();
    private long _nextId = 1;

    public bool ThrowOnAdd { get; set; }

    public IReadOnlyList<AuditLog> Logs
    {
        get
        {
            lock (_lock)
            {
                return _logs.ToList();
            }
        }
    }

    public List<AuditLog> CreateSnapshot()
    {
        lock (_lock)
        {
            return _logs.ToList();
        }
    }

    public void RestoreSnapshot(List<AuditLog> snapshot)
    {
        lock (_lock)
        {
            _logs.Clear();
            _logs.AddRange(snapshot);
        }
    }

    public Task AddAsync(AuditLog log, CancellationToken cancellationToken = default)
    {
        if (ThrowOnAdd)
        {
            throw new InvalidOperationException("Simulated outbox/audit persistence failure.");
        }

        lock (_lock)
        {
            if (log.Id == 0)
            {
                log.Id = _nextId++;
            }
            _logs.Add(log);
            return Task.CompletedTask;
        }
    }

    public Task<List<AuditLog>> GetByCustomerIdAsync(int tenantId, int customerId, CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            return Task.FromResult(_logs.Where(l => l.TenantId == tenantId && l.CustomerId == customerId).ToList());
        }
    }

    public Task<List<AuditLog>> GetByEntityAsync(int tenantId, string entityName, string entityId, CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            return Task.FromResult(_logs
                .Where(l => l.TenantId == tenantId && l.EntityName == entityName && l.EntityId == entityId)
                .OrderByDescending(l => l.Timestamp)
                .ToList());
        }
    }

    public Task<(List<AuditLog> Items, int TotalCount)> GetPagedAsync(int tenantId, int page, int pageSize, CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            var tenantLogs = _logs.Where(l => l.TenantId == tenantId).ToList();
            var items = tenantLogs.Skip((page - 1) * pageSize).Take(pageSize).ToList();
            return Task.FromResult((items, tenantLogs.Count));
        }
    }

    public Task<(List<AuditLog> Items, int TotalCount)> GetFilteredPagedAsync(int tenantId, Billing.Contracts.AuditLogFilterRequest filter, CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            var tenantLogs = _logs.Where(l => l.TenantId == tenantId).ToList();
            var page = filter.Page <= 0 ? 1 : filter.Page;
            var pageSize = filter.PageSize <= 0 ? 10 : filter.PageSize;
            var items = tenantLogs.Skip((page - 1) * pageSize).Take(pageSize).ToList();
            return Task.FromResult((items, tenantLogs.Count));
        }
    }
}

public class FakeTransactionalUnitOfWork : IUnitOfWork
{
    private readonly FakeInvoiceRepository _invoiceRepository;
    private readonly FakePaymentRepository _paymentRepository;
    private readonly SnapshotAuditLogRepository _auditLogRepository;

    private List<Invoice>? _invoiceSnapshot;
    private List<Payment>? _paymentSnapshot;
    private List<AuditLog>? _auditSnapshot;

    public int BeginCount { get; private set; }
    public int CommitCount { get; private set; }
    public int RollbackCount { get; private set; }

    public FakeTransactionalUnitOfWork(
        FakeInvoiceRepository invoiceRepository,
        FakePaymentRepository paymentRepository,
        SnapshotAuditLogRepository auditLogRepository)
    {
        _invoiceRepository = invoiceRepository;
        _paymentRepository = paymentRepository;
        _auditLogRepository = auditLogRepository;
    }

    public Task BeginTransactionAsync()
    {
        BeginCount++;
        _invoiceSnapshot = _invoiceRepository.CreateSnapshot();
        _paymentSnapshot = _paymentRepository.CreateSnapshot();
        _auditSnapshot = _auditLogRepository.CreateSnapshot();
        return Task.CompletedTask;
    }

    public Task CommitTransactionAsync()
    {
        CommitCount++;
        _invoiceSnapshot = null;
        _paymentSnapshot = null;
        _auditSnapshot = null;
        return Task.CompletedTask;
    }

    public Task RollbackTransactionAsync()
    {
        RollbackCount++;
        if (_invoiceSnapshot != null)
        {
            _invoiceRepository.RestoreSnapshot(_invoiceSnapshot);
        }
        if (_paymentSnapshot != null)
        {
            _paymentRepository.RestoreSnapshot(_paymentSnapshot);
        }
        if (_auditSnapshot != null)
        {
            _auditLogRepository.RestoreSnapshot(_auditSnapshot);
        }
        return Task.CompletedTask;
    }

    public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        return Task.FromResult(1);
    }

    public void Dispose()
    {
    }
}

