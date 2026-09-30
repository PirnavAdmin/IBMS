using System.Collections.Concurrent;
using System.Text.Json;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Numbering;
using Billing.Contracts.Payment;
using Billing.Domain.Entities;
using Billing.Domain.Enums;

namespace Billing.Application.Services;

public class PaymentService : IPaymentService
{
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> ConcurrencyLocks = new();

    private static readonly HashSet<string> ReversalAuthorizedRoles = new(StringComparer.OrdinalIgnoreCase)
    {
        "SuperAdmin",
        "TenantAdmin",
        "Admin",
        "BillingManager",
        "Finance",
        "FinanceAdmin",
        "Accountant"
    };

    private static readonly HashSet<string> ReversalAuthorizedPermissions = new(StringComparer.OrdinalIgnoreCase)
    {
        "all",
        "billing.admin",
        "payment.reverse",
        "payments.reverse"
    };

    private readonly IPaymentRepository _paymentRepository;
    private readonly IInvoiceRepository _invoiceRepository;
    private readonly ICustomerRepository _customerRepository;
    private readonly INumberGenerationService _numberGenerationService;
    private readonly IAuditLogRepository _auditLogRepository;
    private readonly IUnitOfWork _unitOfWork;

    public PaymentService(
        IPaymentRepository paymentRepository,
        IInvoiceRepository invoiceRepository,
        ICustomerRepository customerRepository,
        INumberGenerationService numberGenerationService,
        IAuditLogRepository auditLogRepository,
        IUnitOfWork unitOfWork)
    {
        _paymentRepository = paymentRepository;
        _invoiceRepository = invoiceRepository;
        _customerRepository = customerRepository;
        _numberGenerationService = numberGenerationService;
        _auditLogRepository = auditLogRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<PaymentOperationResult<PaymentDetailDto>> CreatePaymentAsync(
        int tenantId,
        CreatePaymentRequest request,
        string performedBy,
        IEnumerable<string>? userRoles = null,
        IEnumerable<string>? userPermissions = null,
        int? restrictedCustomerId = null)
    {
        if (tenantId <= 0)
        {
            return PaymentOperationResult<PaymentDetailDto>.Failure(
                "Valid tenant context is required.",
                "INVALID_TENANT",
                400);
        }

        // 1. Validate request fields, sensitive data, method rules, and allocations
        var validation = PaymentValidator.ValidateCreateRequest(request, tenantId);
        if (!validation.IsValid)
        {
            return PaymentOperationResult<PaymentDetailDto>.Failure(
                validation.Errors.First(),
                validation.ErrorCode ?? "VALIDATION_ERROR",
                400,
                validation.Errors);
        }

        var normalizedIdempotencyKey = string.IsNullOrWhiteSpace(request.IdempotencyKey)
            ? null
            : request.IdempotencyKey.Trim();

        var payloadHash = PaymentValidator.ComputePayloadHash(
            request,
            validation.ParsedMethod,
            validation.NormalizedAllocations,
            tenantId);

        // 2. Acquire deterministic locks per (tenant, idempotencyKey) and (tenant, invoiceId)
        var lockKeys = new SortedSet<string>(StringComparer.Ordinal);
        if (normalizedIdempotencyKey != null)
        {
            lockKeys.Add($"tenant:{tenantId}:idem:{normalizedIdempotencyKey}");
        }
        foreach (var alloc in validation.NormalizedAllocations)
        {
            lockKeys.Add($"tenant:{tenantId}:inv:{alloc.InvoiceId}");
        }

        var acquiredLocks = new List<SemaphoreSlim>(lockKeys.Count);
        try
        {
            foreach (var key in lockKeys)
            {
                var sem = ConcurrencyLocks.GetOrAdd(key, _ => new SemaphoreSlim(1, 1));
                await sem.WaitAsync();
                acquiredLocks.Add(sem);
            }

            // 3. Check idempotency key inside lock
            if (normalizedIdempotencyKey != null)
            {
                var existingByKey = await _paymentRepository.GetByIdempotencyKeyAsync(tenantId, normalizedIdempotencyKey);
                if (existingByKey != null)
                {
                    if (!string.Equals(existingByKey.RequestPayloadHash, payloadHash, StringComparison.Ordinal))
                    {
                        return PaymentOperationResult<PaymentDetailDto>.Failure(
                            "Idempotency key has already been used with a different payment request payload.",
                            "IDEMPOTENCY_CONFLICT",
                            409);
                    }

                    var existingDto = await BuildPaymentDetailDtoAsync(tenantId, existingByKey);
                    return PaymentOperationResult<PaymentDetailDto>.Success(existingDto, 200, isIdempotentReplay: true);
                }
            }

            // 4. Check duplicate gateway transaction reference if Gateway method
            if (validation.ParsedMethod == PaymentMethod.Gateway
                && !string.IsNullOrWhiteSpace(request.ProviderName)
                && !string.IsNullOrWhiteSpace(request.ProviderTransactionId))
            {
                var existingGatewayTx = await _paymentRepository.GetByProviderTransactionAsync(
                    tenantId,
                    request.ProviderName.Trim(),
                    request.ProviderTransactionId.Trim());

                if (existingGatewayTx != null)
                {
                    if (string.Equals(existingGatewayTx.RequestPayloadHash, payloadHash, StringComparison.Ordinal))
                    {
                        var existingDto = await BuildPaymentDetailDtoAsync(tenantId, existingGatewayTx);
                        return PaymentOperationResult<PaymentDetailDto>.Success(existingDto, 200, isIdempotentReplay: true);
                    }

                    return PaymentOperationResult<PaymentDetailDto>.Failure(
                        "A payment with the same gateway provider transaction ID already exists.",
                        "DUPLICATE_GATEWAY_TRANSACTION",
                        409);
                }
            }

            // 5. Begin atomic transaction
            await _unitOfWork.BeginTransactionAsync();
            try
            {
                var loadedInvoices = new Dictionary<int, Invoice>();
                int? resolvedCustomerId = request.CustomerId.HasValue && request.CustomerId.Value > 0
                    ? request.CustomerId.Value
                    : null;

                foreach (var alloc in validation.NormalizedAllocations)
                {
                    var invoice = await _invoiceRepository.GetByIdForUpdateAsync(alloc.InvoiceId, tenantId);
                    if (invoice == null || invoice.TenantId != tenantId)
                    {
                        await _unitOfWork.RollbackTransactionAsync();
                        return PaymentOperationResult<PaymentDetailDto>.Failure(
                            $"Invoice with ID {alloc.InvoiceId} was not found in this tenant.",
                            "INVOICE_NOT_FOUND",
                            404);
                    }

                    if (restrictedCustomerId.HasValue && invoice.CustomerId != restrictedCustomerId.Value)
                    {
                        await _unitOfWork.RollbackTransactionAsync();
                        return PaymentOperationResult<PaymentDetailDto>.Failure(
                            "You are not authorized to record a payment for this customer's invoice.",
                            "FORBIDDEN",
                            403);
                    }

                    if (resolvedCustomerId.HasValue && invoice.CustomerId != resolvedCustomerId.Value)
                    {
                        await _unitOfWork.RollbackTransactionAsync();
                        return PaymentOperationResult<PaymentDetailDto>.Failure(
                            $"Invoice {invoice.InvoiceNumber} does not belong to the specified customer.",
                            "CUSTOMER_INVOICE_MISMATCH",
                            400);
                    }

                    resolvedCustomerId ??= invoice.CustomerId;

                    // Validate currency consistency
                    var invoiceCurrency = invoice.GetCurrency();
                    if (!string.Equals(invoiceCurrency, validation.NormalizedCurrency, StringComparison.OrdinalIgnoreCase))
                    {
                        await _unitOfWork.RollbackTransactionAsync();
                        return PaymentOperationResult<PaymentDetailDto>.Failure(
                            $"Payment currency '{validation.NormalizedCurrency}' does not match invoice currency '{invoiceCurrency}'.",
                            "CURRENCY_MISMATCH",
                            400);
                    }

                    // Validate invoice eligibility & outstanding balance
                    if (!invoice.IsEligibleForPayment(out var ineligibilityReason))
                    {
                        await _unitOfWork.RollbackTransactionAsync();
                        return PaymentOperationResult<PaymentDetailDto>.Failure(
                            ineligibilityReason ?? $"Invoice {invoice.InvoiceNumber} is not eligible for payment.",
                            "INVOICE_NOT_ELIGIBLE",
                            400);
                    }

                    var effectiveBalance = invoice.GetEffectiveBalance();
                    if (alloc.AllocatedAmount > effectiveBalance)
                    {
                        await _unitOfWork.RollbackTransactionAsync();
                        return PaymentOperationResult<PaymentDetailDto>.Failure(
                            $"Payment allocation amount ({alloc.AllocatedAmount:F2}) exceeds the invoice outstanding balance ({effectiveBalance:F2}) for invoice {invoice.InvoiceNumber}.",
                            "OVERPAYMENT_NOT_ALLOWED",
                            400);
                    }

                    loadedInvoices[invoice.Id] = invoice;
                }

                var finalCustomerId = resolvedCustomerId!.Value;
                var customer = await _customerRepository.GetByIdAsync(finalCustomerId, tenantId);
                if (customer != null && customer.TenantId != tenantId)
                {
                    await _unitOfWork.RollbackTransactionAsync();
                    return PaymentOperationResult<PaymentDetailDto>.Failure(
                        "Customer does not belong to the current tenant.",
                        "CUSTOMER_TENANT_MISMATCH",
                        403);
                }

                if (request.BranchId.HasValue && request.BranchId.Value > 0 && customer != null && customer.Addresses.Count > 0)
                {
                    var branchExists = customer.Addresses.Any(a => a.Id == request.BranchId.Value && a.TenantId == tenantId);
                    if (!branchExists)
                    {
                        await _unitOfWork.RollbackTransactionAsync();
                        return PaymentOperationResult<PaymentDetailDto>.Failure(
                            "Specified branch does not belong to the customer or tenant.",
                            "INVALID_BRANCH",
                            400);
                    }
                }

                // 6. Generate unique payment number
                var effectivePaymentDate = request.PaymentDate ?? DateTime.UtcNow;
                var paymentNumber = await GenerateUniquePaymentNumberAsync(tenantId, effectivePaymentDate);

                var nowUtc = DateTime.UtcNow;
                var paymentDateUtc = effectivePaymentDate.Kind == DateTimeKind.Utc
                    ? effectivePaymentDate
                    : DateTime.SpecifyKind(effectivePaymentDate, DateTimeKind.Utc);

                var totalAllocated = Math.Round(validation.NormalizedAllocations.Sum(a => a.AllocatedAmount), 2);

                var payment = new Payment
                {
                    TenantId = tenantId,
                    BranchId = request.BranchId.HasValue && request.BranchId.Value > 0 ? request.BranchId.Value : null,
                    PaymentNumber = paymentNumber,
                    CustomerId = finalCustomerId,
                    PaymentDate = paymentDateUtc,
                    Amount = Math.Round(request.Amount, 2),
                    AllocatedAmount = totalAllocated,
                    Currency = validation.NormalizedCurrency,
                    Method = validation.ParsedMethod,
                    CustomMethodName = validation.ParsedMethod == PaymentMethod.Custom ? request.CustomMethodName?.Trim() : null,
                    Reference = string.IsNullOrWhiteSpace(request.Reference) ? null : request.Reference.Trim(),
                    BankName = string.IsNullOrWhiteSpace(request.BankName) ? null : request.BankName.Trim(),
                    AccountLabel = string.IsNullOrWhiteSpace(request.AccountLabel) ? null : request.AccountLabel.Trim(),
                    TransferDate = request.TransferDate,
                    UpiPayerMetadata = string.IsNullOrWhiteSpace(request.UpiPayerMetadata) ? null : request.UpiPayerMetadata.Trim(),
                    ChequeNumber = string.IsNullOrWhiteSpace(request.ChequeNumber) ? null : request.ChequeNumber.Trim(),
                    ChequeDate = request.ChequeDate,
                    ClearingStatus = validation.ParsedMethod == PaymentMethod.Cheque
                        ? (string.IsNullOrWhiteSpace(request.ClearingStatus) ? "Cleared" : request.ClearingStatus.Trim())
                        : null,
                    ProviderName = string.IsNullOrWhiteSpace(request.ProviderName) ? null : request.ProviderName.Trim(),
                    ProviderTransactionId = string.IsNullOrWhiteSpace(request.ProviderTransactionId) ? null : request.ProviderTransactionId.Trim(),
                    CallbackStatus = string.IsNullOrWhiteSpace(request.CallbackStatus) ? null : request.CallbackStatus.Trim(),
                    MethodDetailsJson = request.MethodDetails != null && request.MethodDetails.Count > 0
                        ? JsonSerializer.Serialize(request.MethodDetails)
                        : null,
                    Status = validation.InitialStatus,
                    Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
                    IdempotencyKey = normalizedIdempotencyKey ?? string.Empty,
                    RequestPayloadHash = payloadHash,
                    CreatedBy = string.IsNullOrWhiteSpace(performedBy) ? "System" : performedBy.Trim(),
                    CreatedAtUtc = nowUtc,
                    RowVersion = nowUtc,
                    Allocations = validation.NormalizedAllocations.Select(a => new InvoicePaymentAllocation
                    {
                        TenantId = tenantId,
                        InvoiceId = a.InvoiceId,
                        Invoice = loadedInvoices.TryGetValue(a.InvoiceId, out var inv) ? inv : null,
                        AllocatedAmount = Math.Round(a.AllocatedAmount, 2),
                        IsReversed = false,
                        CreatedAtUtc = nowUtc
                    }).ToList()
                };

                var savedPayment = await _paymentRepository.AddAsync(payment);

                // 7. Update linked invoices if payment is Completed (effective)
                var invoiceAuditSnapshots = new List<object>();
                foreach (var alloc in savedPayment.Allocations)
                {
                    var invoice = loadedInvoices[alloc.InvoiceId];
                    var previousPaid = invoice.PaidAmount;
                    var previousBalance = invoice.GetEffectiveBalance();
                    var previousStatus = invoice.Status;

                    if (savedPayment.Status == PaymentStatus.Completed)
                    {
                        var newPaid = Math.Round(previousPaid + alloc.AllocatedAmount, 2);
                        invoice.RecalculateBalanceAndStatus(newPaid);
                        await _invoiceRepository.UpdateAsync(invoice);
                    }

                    alloc.Invoice = invoice;
                    invoiceAuditSnapshots.Add(new
                    {
                        invoiceId = invoice.Id,
                        invoiceNumber = invoice.InvoiceNumber,
                        allocatedAmount = alloc.AllocatedAmount,
                        previousPaidAmount = previousPaid,
                        newPaidAmount = invoice.PaidAmount,
                        previousBalanceAmount = previousBalance,
                        newBalanceAmount = invoice.BalanceAmount,
                        previousStatus,
                        newStatus = invoice.Status
                    });
                }

                // 8. Record transactional audit & outbox events (PaymentCreated + PaymentStatusChanged)
                var actor = string.IsNullOrWhiteSpace(performedBy) ? "System" : performedBy.Trim();
                var createdEventPayload = JsonSerializer.Serialize(new
                {
                    eventType = "PaymentCreated",
                    tenantId,
                    paymentId = savedPayment.Id,
                    paymentNumber = savedPayment.PaymentNumber,
                    customerId = savedPayment.CustomerId,
                    amount = savedPayment.Amount,
                    allocatedAmount = savedPayment.AllocatedAmount,
                    currency = savedPayment.Currency,
                    method = PaymentValidator.FormatPaymentMethod(savedPayment.Method, savedPayment.CustomMethodName),
                    status = savedPayment.Status.ToString(),
                    maskedReference = PaymentValidator.MaskReference(savedPayment.Reference, savedPayment.Method),
                    idempotencyKey = savedPayment.IdempotencyKey,
                    allocations = invoiceAuditSnapshots,
                    createdBy = actor,
                    timestampUtc = nowUtc
                });

                await _auditLogRepository.AddAsync(new AuditLog
                {
                    TenantId = tenantId,
                    CustomerId = savedPayment.CustomerId,
                    EntityName = "Payment",
                    EntityId = savedPayment.Id.ToString(),
                    Action = "PaymentCreated",
                    UserName = actor,
                    Timestamp = nowUtc,
                    Changes = createdEventPayload
                });

                var statusEventPayload = JsonSerializer.Serialize(new
                {
                    eventType = "PaymentStatusChanged",
                    tenantId,
                    paymentId = savedPayment.Id,
                    paymentNumber = savedPayment.PaymentNumber,
                    previousStatus = (string?)null,
                    newStatus = savedPayment.Status.ToString(),
                    changedBy = actor,
                    timestampUtc = nowUtc
                });

                await _auditLogRepository.AddAsync(new AuditLog
                {
                    TenantId = tenantId,
                    CustomerId = savedPayment.CustomerId,
                    EntityName = "Payment",
                    EntityId = savedPayment.Id.ToString(),
                    Action = "PaymentStatusChanged",
                    UserName = actor,
                    Timestamp = nowUtc,
                    Changes = statusEventPayload
                });

                await _unitOfWork.CommitTransactionAsync();

                savedPayment.Customer = customer;
                var detailDto = await BuildPaymentDetailDtoAsync(tenantId, savedPayment);
                return PaymentOperationResult<PaymentDetailDto>.Success(detailDto, 201, isIdempotentReplay: false);
            }
            catch (Exception ex)
            {
                await _unitOfWork.RollbackTransactionAsync();

                if (ex.GetType().Name.Contains("DbUpdateConcurrencyException", StringComparison.OrdinalIgnoreCase))
                {
                    return PaymentOperationResult<PaymentDetailDto>.Failure(
                        "The invoice or payment was modified by another concurrent transaction. Please retry.",
                        "CONCURRENCY_CONFLICT",
                        409);
                }

                throw;
            }
        }
        finally
        {
            for (var i = acquiredLocks.Count - 1; i >= 0; i--)
            {
                acquiredLocks[i].Release();
            }
        }
    }

    public async Task<PaymentOperationResult<PagedResult<PaymentListItemDto>>> GetPagedPaymentsAsync(
        int tenantId,
        PaymentListFilterRequest filter,
        IEnumerable<string>? userRoles = null,
        int? restrictedCustomerId = null)
    {
        if (tenantId <= 0)
        {
            return PaymentOperationResult<PagedResult<PaymentListItemDto>>.Failure(
                "Valid tenant context is required.",
                "INVALID_TENANT",
                400);
        }

        if (restrictedCustomerId.HasValue && filter.CustomerId.HasValue && filter.CustomerId.Value != restrictedCustomerId.Value)
        {
            return PaymentOperationResult<PagedResult<PaymentListItemDto>>.Failure(
                "You are not authorized to view payments for another customer.",
                "FORBIDDEN",
                403);
        }

        var pagedPayments = await _paymentRepository.GetPagedListAsync(tenantId, filter, restrictedCustomerId);

        foreach (var p in pagedPayments.Items)
        {
            p.Customer ??= await _customerRepository.GetByIdAsync(p.CustomerId, tenantId);
            foreach (var alloc in p.Allocations)
            {
                alloc.Invoice ??= await _invoiceRepository.GetByIdAsync(alloc.InvoiceId, tenantId);
            }
        }

        var items = pagedPayments.Items.Select(MapToListItemDto).ToList();

        return PaymentOperationResult<PagedResult<PaymentListItemDto>>.Success(
            new PagedResult<PaymentListItemDto>(items, pagedPayments.TotalCount, pagedPayments.PageNumber, pagedPayments.PageSize));
    }

    public async Task<PaymentOperationResult<PaymentDetailDto>> GetPaymentByIdAsync(
        int tenantId,
        int paymentId,
        IEnumerable<string>? userRoles = null,
        int? restrictedCustomerId = null)
    {
        if (tenantId <= 0)
        {
            return PaymentOperationResult<PaymentDetailDto>.Failure(
                "Valid tenant context is required.",
                "INVALID_TENANT",
                400);
        }

        var payment = await _paymentRepository.GetByIdAsync(tenantId, paymentId);
        if (payment == null || payment.TenantId != tenantId)
        {
            return PaymentOperationResult<PaymentDetailDto>.Failure(
                "Payment not found.",
                "PAYMENT_NOT_FOUND",
                404);
        }

        if (restrictedCustomerId.HasValue && payment.CustomerId != restrictedCustomerId.Value)
        {
            return PaymentOperationResult<PaymentDetailDto>.Failure(
                "You are not authorized to view this payment.",
                "FORBIDDEN",
                403);
        }

        var dto = await BuildPaymentDetailDtoAsync(tenantId, payment);
        return PaymentOperationResult<PaymentDetailDto>.Success(dto);
    }

    public async Task<PaymentOperationResult<PaymentDetailDto>> ReversePaymentAsync(
        int tenantId,
        int paymentId,
        ReversePaymentRequest request,
        string performedBy,
        IEnumerable<string>? userRoles = null,
        IEnumerable<string>? userPermissions = null)
    {
        if (tenantId <= 0)
        {
            return PaymentOperationResult<PaymentDetailDto>.Failure(
                "Valid tenant context is required.",
                "INVALID_TENANT",
                400);
        }

        // 1. Authorization check
        if (!IsAuthorizedForReversal(userRoles, userPermissions))
        {
            return PaymentOperationResult<PaymentDetailDto>.Failure(
                "You do not have permission to reverse payments.",
                "FORBIDDEN",
                403);
        }

        // 2. Mandatory reversal reason validation
        var reasonValidation = PaymentValidator.ValidateReversalRequest(request);
        if (!reasonValidation.IsValid)
        {
            return PaymentOperationResult<PaymentDetailDto>.Failure(
                reasonValidation.Errors.First(),
                reasonValidation.ErrorCode ?? "REVERSAL_REASON_REQUIRED",
                400,
                reasonValidation.Errors);
        }

        var payLockKey = $"tenant:{tenantId}:pay:{paymentId}";
        var paySem = ConcurrencyLocks.GetOrAdd(payLockKey, _ => new SemaphoreSlim(1, 1));
        await paySem.WaitAsync();
        try
        {
            var payment = await _paymentRepository.GetByIdForUpdateAsync(tenantId, paymentId);
            if (payment == null || payment.TenantId != tenantId)
            {
                return PaymentOperationResult<PaymentDetailDto>.Failure(
                    "Payment not found.",
                    "PAYMENT_NOT_FOUND",
                    404);
            }

            if (payment.Status == PaymentStatus.Reversed)
            {
                return PaymentOperationResult<PaymentDetailDto>.Failure(
                    "Payment has already been reversed.",
                    "ALREADY_REVERSED",
                    400);
            }

            if (payment.Status != PaymentStatus.Completed)
            {
                return PaymentOperationResult<PaymentDetailDto>.Failure(
                    $"Only Completed payments can be reversed. Current status is '{payment.Status}'.",
                    "PAYMENT_NOT_REVERSIBLE",
                    400);
            }

            // Lock all linked invoices in deterministic order
            var invoiceLockKeys = payment.Allocations
                .Select(a => $"tenant:{tenantId}:inv:{a.InvoiceId}")
                .Distinct(StringComparer.Ordinal)
                .OrderBy(k => k, StringComparer.Ordinal)
                .ToList();

            var acquiredInvoiceLocks = new List<SemaphoreSlim>(invoiceLockKeys.Count);
            try
            {
                foreach (var invKey in invoiceLockKeys)
                {
                    var sem = ConcurrencyLocks.GetOrAdd(invKey, _ => new SemaphoreSlim(1, 1));
                    await sem.WaitAsync();
                    acquiredInvoiceLocks.Add(sem);
                }

                await _unitOfWork.BeginTransactionAsync();
                try
                {
                    var nowUtc = DateTime.UtcNow;
                    var actor = string.IsNullOrWhiteSpace(performedBy) ? "System" : performedBy.Trim();
                    var trimmedReason = request.Reason.Trim();
                    var previousPaymentStatus = payment.Status;

                    payment.Status = PaymentStatus.Reversed;
                    payment.ReversedAtUtc = nowUtc;
                    payment.ReversedBy = actor;
                    payment.ReversalReason = trimmedReason;
                    payment.UpdatedAtUtc = nowUtc;
                    payment.RowVersion = nowUtc;

                    var restoredInvoiceSnapshots = new List<object>();

                    foreach (var alloc in payment.Allocations)
                    {
                        alloc.IsReversed = true;
                        alloc.ReversedAtUtc = nowUtc;
                        alloc.ReversedBy = actor;
                        alloc.ReversalReason = trimmedReason;

                        var invoice = await _invoiceRepository.GetByIdForUpdateAsync(alloc.InvoiceId, tenantId);
                        if (invoice == null || invoice.TenantId != tenantId)
                        {
                            await _unitOfWork.RollbackTransactionAsync();
                            return PaymentOperationResult<PaymentDetailDto>.Failure(
                                $"Linked invoice {alloc.InvoiceId} was not found.",
                                "INVOICE_NOT_FOUND",
                                404);
                        }

                        var prevPaid = invoice.PaidAmount;
                        var prevBalance = invoice.GetEffectiveBalance();
                        var prevStatus = invoice.Status;

                        var restoredPaid = Math.Max(0m, Math.Round(invoice.PaidAmount - alloc.AllocatedAmount, 2));
                        invoice.RecalculateBalanceAndStatus(restoredPaid);
                        await _invoiceRepository.UpdateAsync(invoice);

                        alloc.Invoice = invoice;
                        restoredInvoiceSnapshots.Add(new
                        {
                            invoiceId = invoice.Id,
                            invoiceNumber = invoice.InvoiceNumber,
                            reversedAllocationAmount = alloc.AllocatedAmount,
                            previousPaidAmount = prevPaid,
                            restoredPaidAmount = invoice.PaidAmount,
                            previousBalanceAmount = prevBalance,
                            restoredBalanceAmount = invoice.BalanceAmount,
                            previousStatus = prevStatus,
                            restoredStatus = invoice.Status
                        });
                    }

                    await _paymentRepository.UpdateAsync(payment);

                    // Record PaymentReversed and PaymentStatusChanged audit/outbox events in the same transaction
                    var reversalPayload = JsonSerializer.Serialize(new
                    {
                        eventType = "PaymentReversed",
                        tenantId,
                        paymentId = payment.Id,
                        paymentNumber = payment.PaymentNumber,
                        customerId = payment.CustomerId,
                        amount = payment.Amount,
                        currency = payment.Currency,
                        reason = trimmedReason,
                        reversedBy = actor,
                        reversedAtUtc = nowUtc,
                        restoredInvoices = restoredInvoiceSnapshots
                    });

                    await _auditLogRepository.AddAsync(new AuditLog
                    {
                        TenantId = tenantId,
                        CustomerId = payment.CustomerId,
                        EntityName = "Payment",
                        EntityId = payment.Id.ToString(),
                        Action = "PaymentReversed",
                        UserName = actor,
                        Timestamp = nowUtc,
                        Changes = reversalPayload
                    });

                    var statusChangePayload = JsonSerializer.Serialize(new
                    {
                        eventType = "PaymentStatusChanged",
                        tenantId,
                        paymentId = payment.Id,
                        paymentNumber = payment.PaymentNumber,
                        previousStatus = previousPaymentStatus.ToString(),
                        newStatus = payment.Status.ToString(),
                        reason = trimmedReason,
                        changedBy = actor,
                        timestampUtc = nowUtc
                    });

                    await _auditLogRepository.AddAsync(new AuditLog
                    {
                        TenantId = tenantId,
                        CustomerId = payment.CustomerId,
                        EntityName = "Payment",
                        EntityId = payment.Id.ToString(),
                        Action = "PaymentStatusChanged",
                        UserName = actor,
                        Timestamp = nowUtc,
                        Changes = statusChangePayload
                    });

                    await _unitOfWork.CommitTransactionAsync();

                    var detailDto = await BuildPaymentDetailDtoAsync(tenantId, payment);
                    return PaymentOperationResult<PaymentDetailDto>.Success(detailDto, 200);
                }
                catch (Exception ex)
                {
                    await _unitOfWork.RollbackTransactionAsync();

                    if (ex.GetType().Name.Contains("DbUpdateConcurrencyException", StringComparison.OrdinalIgnoreCase))
                    {
                        return PaymentOperationResult<PaymentDetailDto>.Failure(
                            "The payment or invoice was modified concurrently. Please retry.",
                            "CONCURRENCY_CONFLICT",
                            409);
                    }

                    throw;
                }
            }
            finally
            {
                for (var i = acquiredInvoiceLocks.Count - 1; i >= 0; i--)
                {
                    acquiredInvoiceLocks[i].Release();
                }
            }
        }
        finally
        {
            paySem.Release();
        }
    }

    public async Task<PaymentOperationResult<PaymentDetailDto>> UpdatePaymentStatusAsync(
        int tenantId,
        int paymentId,
        UpdatePaymentStatusRequest request,
        string performedBy,
        IEnumerable<string>? userRoles = null,
        IEnumerable<string>? userPermissions = null)
    {
        if (tenantId <= 0)
        {
            return PaymentOperationResult<PaymentDetailDto>.Failure(
                "Valid tenant context is required.",
                "INVALID_TENANT",
                400);
        }

        if (request == null || string.IsNullOrWhiteSpace(request.Status))
        {
            return PaymentOperationResult<PaymentDetailDto>.Failure(
                "Target payment status is required.",
                "INVALID_STATUS",
                400);
        }

        if (!Enum.TryParse<PaymentStatus>(request.Status.Trim(), true, out var targetStatus)
            || (targetStatus != PaymentStatus.Completed && targetStatus != PaymentStatus.Failed))
        {
            return PaymentOperationResult<PaymentDetailDto>.Failure(
                "Status update only supports transitioning a Pending payment to Completed or Failed. Use the reversal endpoint to reverse a Completed payment.",
                "INVALID_STATUS_TRANSITION",
                400);
        }

        var payLockKey = $"tenant:{tenantId}:pay:{paymentId}";
        var paySem = ConcurrencyLocks.GetOrAdd(payLockKey, _ => new SemaphoreSlim(1, 1));
        await paySem.WaitAsync();
        try
        {
            var payment = await _paymentRepository.GetByIdForUpdateAsync(tenantId, paymentId);
            if (payment == null || payment.TenantId != tenantId)
            {
                return PaymentOperationResult<PaymentDetailDto>.Failure(
                    "Payment not found.",
                    "PAYMENT_NOT_FOUND",
                    404);
            }

            // Idempotent callback/update if already in target status
            if (payment.Status == targetStatus)
            {
                var existingDto = await BuildPaymentDetailDtoAsync(tenantId, payment);
                return PaymentOperationResult<PaymentDetailDto>.Success(existingDto, 200, isIdempotentReplay: true);
            }

            if (payment.Status != PaymentStatus.Pending)
            {
                return PaymentOperationResult<PaymentDetailDto>.Failure(
                    $"Cannot transition payment from '{payment.Status}' to '{targetStatus}'. Only Pending payments can transition to Completed or Failed.",
                    "INVALID_STATUS_TRANSITION",
                    400);
            }

            var invoiceLockKeys = payment.Allocations
                .Select(a => $"tenant:{tenantId}:inv:{a.InvoiceId}")
                .Distinct(StringComparer.Ordinal)
                .OrderBy(k => k, StringComparer.Ordinal)
                .ToList();

            var acquiredInvoiceLocks = new List<SemaphoreSlim>(invoiceLockKeys.Count);
            try
            {
                foreach (var invKey in invoiceLockKeys)
                {
                    var sem = ConcurrencyLocks.GetOrAdd(invKey, _ => new SemaphoreSlim(1, 1));
                    await sem.WaitAsync();
                    acquiredInvoiceLocks.Add(sem);
                }

                await _unitOfWork.BeginTransactionAsync();
                try
                {
                    var nowUtc = DateTime.UtcNow;
                    var actor = string.IsNullOrWhiteSpace(performedBy) ? "System" : performedBy.Trim();
                    var previousStatus = payment.Status;

                    if (targetStatus == PaymentStatus.Completed)
                    {
                        foreach (var alloc in payment.Allocations)
                        {
                            var invoice = await _invoiceRepository.GetByIdForUpdateAsync(alloc.InvoiceId, tenantId);
                            if (invoice == null || invoice.TenantId != tenantId)
                            {
                                await _unitOfWork.RollbackTransactionAsync();
                                return PaymentOperationResult<PaymentDetailDto>.Failure(
                                    $"Linked invoice {alloc.InvoiceId} was not found.",
                                    "INVOICE_NOT_FOUND",
                                    404);
                            }

                            if (!invoice.IsEligibleForPayment(out var reason))
                            {
                                await _unitOfWork.RollbackTransactionAsync();
                                return PaymentOperationResult<PaymentDetailDto>.Failure(
                                    reason ?? $"Invoice {invoice.InvoiceNumber} is no longer eligible for payment.",
                                    "INVOICE_NOT_ELIGIBLE",
                                    400);
                            }

                            var currentBalance = invoice.GetEffectiveBalance();
                            if (alloc.AllocatedAmount > currentBalance)
                            {
                                await _unitOfWork.RollbackTransactionAsync();
                                return PaymentOperationResult<PaymentDetailDto>.Failure(
                                    $"Completing payment would exceed the remaining balance ({currentBalance:F2}) on invoice {invoice.InvoiceNumber}.",
                                    "OVERPAYMENT_NOT_ALLOWED",
                                    400);
                            }

                            var newPaid = Math.Round(invoice.PaidAmount + alloc.AllocatedAmount, 2);
                            invoice.RecalculateBalanceAndStatus(newPaid);
                            await _invoiceRepository.UpdateAsync(invoice);
                            alloc.Invoice = invoice;
                        }
                    }

                    payment.Status = targetStatus;
                    if (!string.IsNullOrWhiteSpace(request.ClearingStatus))
                    {
                        payment.ClearingStatus = request.ClearingStatus.Trim();
                    }
                    else if (payment.Method == PaymentMethod.Cheque)
                    {
                        payment.ClearingStatus = targetStatus == PaymentStatus.Completed ? "Cleared" : "Bounced";
                    }

                    if (!string.IsNullOrWhiteSpace(request.CallbackStatus))
                    {
                        payment.CallbackStatus = request.CallbackStatus.Trim();
                    }
                    else if (payment.Method == PaymentMethod.Gateway)
                    {
                        payment.CallbackStatus = targetStatus == PaymentStatus.Completed ? "Success" : "Failed";
                    }

                    if (!string.IsNullOrWhiteSpace(request.ProviderTransactionId))
                    {
                        payment.ProviderTransactionId = request.ProviderTransactionId.Trim();
                    }

                    var extraNote = !string.IsNullOrWhiteSpace(request.Notes) ? request.Notes : request.Reason;
                    if (!string.IsNullOrWhiteSpace(extraNote))
                    {
                        payment.Notes = string.IsNullOrWhiteSpace(payment.Notes)
                            ? extraNote.Trim()
                            : $"{payment.Notes} | {extraNote.Trim()}";
                    }

                    payment.UpdatedAtUtc = nowUtc;
                    payment.RowVersion = nowUtc;

                    await _paymentRepository.UpdateAsync(payment);

                    var statusChangePayload = JsonSerializer.Serialize(new
                    {
                        eventType = "PaymentStatusChanged",
                        tenantId,
                        paymentId = payment.Id,
                        paymentNumber = payment.PaymentNumber,
                        previousStatus = previousStatus.ToString(),
                        newStatus = payment.Status.ToString(),
                        clearingStatus = payment.ClearingStatus,
                        callbackStatus = payment.CallbackStatus,
                        changedBy = actor,
                        timestampUtc = nowUtc
                    });

                    await _auditLogRepository.AddAsync(new AuditLog
                    {
                        TenantId = tenantId,
                        CustomerId = payment.CustomerId,
                        EntityName = "Payment",
                        EntityId = payment.Id.ToString(),
                        Action = "PaymentStatusChanged",
                        UserName = actor,
                        Timestamp = nowUtc,
                        Changes = statusChangePayload
                    });

                    await _unitOfWork.CommitTransactionAsync();

                    var dto = await BuildPaymentDetailDtoAsync(tenantId, payment);
                    return PaymentOperationResult<PaymentDetailDto>.Success(dto, 200);
                }
                catch
                {
                    await _unitOfWork.RollbackTransactionAsync();
                    throw;
                }
            }
            finally
            {
                for (var i = acquiredInvoiceLocks.Count - 1; i >= 0; i--)
                {
                    acquiredInvoiceLocks[i].Release();
                }
            }
        }
        finally
        {
            paySem.Release();
        }
    }

    public async Task<PaymentOperationResult<List<EligibleInvoiceBalanceDto>>> GetEligibleInvoicesAsync(
        int tenantId,
        int? customerId = null,
        int? restrictedCustomerId = null)
    {
        if (tenantId <= 0)
        {
            return PaymentOperationResult<List<EligibleInvoiceBalanceDto>>.Failure(
                "Valid tenant context is required.",
                "INVALID_TENANT",
                400);
        }

        if (restrictedCustomerId.HasValue && customerId.HasValue && customerId.Value != restrictedCustomerId.Value)
        {
            return PaymentOperationResult<List<EligibleInvoiceBalanceDto>>.Failure(
                "You are not authorized to view invoices for another customer.",
                "FORBIDDEN",
                403);
        }

        var effectiveCustomerId = restrictedCustomerId ?? customerId;
        var invoices = await _invoiceRepository.GetEligibleInvoicesAsync(tenantId, null, effectiveCustomerId);

        var dtos = invoices.Select(MapToEligibleInvoiceBalanceDto).ToList();
        return PaymentOperationResult<List<EligibleInvoiceBalanceDto>>.Success(dtos);
    }

    public async Task<PaymentOperationResult<EligibleInvoiceBalanceDto>> GetInvoiceBalanceAsync(
        int tenantId,
        int invoiceId,
        int? restrictedCustomerId = null)
    {
        if (tenantId <= 0)
        {
            return PaymentOperationResult<EligibleInvoiceBalanceDto>.Failure(
                "Valid tenant context is required.",
                "INVALID_TENANT",
                400);
        }

        var invoice = await _invoiceRepository.GetByIdAsync(invoiceId, tenantId);
        if (invoice == null || invoice.TenantId != tenantId)
        {
            return PaymentOperationResult<EligibleInvoiceBalanceDto>.Failure(
                "Invoice not found.",
                "INVOICE_NOT_FOUND",
                404);
        }

        if (restrictedCustomerId.HasValue && invoice.CustomerId != restrictedCustomerId.Value)
        {
            return PaymentOperationResult<EligibleInvoiceBalanceDto>.Failure(
                "You are not authorized to view this invoice.",
                "FORBIDDEN",
                403);
        }

        return PaymentOperationResult<EligibleInvoiceBalanceDto>.Success(MapToEligibleInvoiceBalanceDto(invoice));
    }

    public async Task<PaymentOperationResult<List<PaymentAuditEventDto>>> GetPaymentAuditHistoryAsync(
        int tenantId,
        int paymentId,
        int? restrictedCustomerId = null)
    {
        var payment = await _paymentRepository.GetByIdAsync(tenantId, paymentId);
        if (payment == null || payment.TenantId != tenantId)
        {
            return PaymentOperationResult<List<PaymentAuditEventDto>>.Failure(
                "Payment not found.",
                "PAYMENT_NOT_FOUND",
                404);
        }

        if (restrictedCustomerId.HasValue && payment.CustomerId != restrictedCustomerId.Value)
        {
            return PaymentOperationResult<List<PaymentAuditEventDto>>.Failure(
                "You are not authorized to view this payment's audit history.",
                "FORBIDDEN",
                403);
        }

        var logs = await _auditLogRepository.GetByEntityAsync(tenantId, "Payment", paymentId.ToString());
        var events = logs.Select(l => new PaymentAuditEventDto
        {
            Id = l.Id,
            Action = l.Action,
            UserName = l.UserName,
            Timestamp = l.Timestamp,
            Changes = l.Changes
        }).ToList();

        return PaymentOperationResult<List<PaymentAuditEventDto>>.Success(events);
    }

    private async Task<string> GenerateUniquePaymentNumberAsync(int tenantId, DateTime paymentDate)
    {
        for (var attempt = 1; attempt <= 20; attempt++)
        {
            var req = new GenerateNumberRequest { DocumentType = "Payment", TransactionDate = paymentDate };
            var numResp = await _numberGenerationService.GenerateNextNumberAsync(req, tenantId);
            if (numResp.Success && numResp.Data != null && !string.IsNullOrWhiteSpace(numResp.Data.GeneratedNumber))
            {
                var candidate = numResp.Data.GeneratedNumber;
                if (!await _paymentRepository.ExistsPaymentNumberAsync(tenantId, candidate))
                {
                    return candidate;
                }
            }
        }

        return $"PAY-{paymentDate:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";
    }

    private static bool IsAuthorizedForReversal(
        IEnumerable<string>? userRoles,
        IEnumerable<string>? userPermissions)
    {
        if (userRoles != null && userRoles.Any(r => ReversalAuthorizedRoles.Contains(r)))
        {
            return true;
        }

        if (userPermissions != null && userPermissions.Any(p => ReversalAuthorizedPermissions.Contains(p)))
        {
            return true;
        }

        return false;
    }

    private static string GetCustomerDisplayName(Customer? customer)
    {
        if (customer == null) return string.Empty;
        return !string.IsNullOrWhiteSpace(customer.CompanyName)
            ? customer.CompanyName
            : customer.Name;
    }

    private static PaymentListItemDto MapToListItemDto(Payment payment)
    {
        var primaryAllocation = payment.Allocations.FirstOrDefault();
        return new PaymentListItemDto
        {
            Id = payment.Id,
            TenantId = payment.TenantId,
            BranchId = payment.BranchId,
            PaymentNumber = payment.PaymentNumber,
            CustomerId = payment.CustomerId,
            CustomerName = GetCustomerDisplayName(payment.Customer),
            CustomerCode = payment.Customer?.CustomerCode ?? string.Empty,
            CustomerEmail = payment.Customer?.Email,
            InvoiceId = primaryAllocation?.InvoiceId ?? 0,
            InvoiceNumber = primaryAllocation?.Invoice?.InvoiceNumber ?? string.Empty,
            InvoiceNumbers = payment.Allocations
                .Where(a => a.Invoice != null && !string.IsNullOrWhiteSpace(a.Invoice.InvoiceNumber))
                .Select(a => a.Invoice!.InvoiceNumber)
                .Distinct()
                .ToList(),
            PaymentDate = payment.PaymentDate,
            Amount = payment.Amount,
            AllocatedAmount = payment.AllocatedAmount,
            Currency = payment.Currency,
            Method = PaymentValidator.FormatPaymentMethod(payment.Method, payment.CustomMethodName),
            MethodDisplay = PaymentValidator.FormatMethodDisplay(payment.Method, payment.CustomMethodName),
            CustomMethodName = payment.CustomMethodName,
            Reference = PaymentValidator.MaskReference(payment.Reference, payment.Method),
            Status = payment.Status.ToString(),
            ClearingStatus = payment.ClearingStatus,
            IsReversible = payment.IsReversible,
            CreatedBy = payment.CreatedBy,
            CreatedAtUtc = payment.CreatedAtUtc,
            ReversedAtUtc = payment.ReversedAtUtc,
            ReversedBy = payment.ReversedBy,
            ReversalReason = payment.ReversalReason
        };
    }

    private async Task<PaymentDetailDto> BuildPaymentDetailDtoAsync(int tenantId, Payment payment)
    {
        payment.Customer ??= await _customerRepository.GetByIdAsync(payment.CustomerId, tenantId);
        foreach (var alloc in payment.Allocations)
        {
            var inv = await _invoiceRepository.GetByIdAsync(alloc.InvoiceId, tenantId);
            if (inv != null)
            {
                alloc.Invoice = inv;
            }
        }

        var primaryAllocation = payment.Allocations.FirstOrDefault();
        Dictionary<string, string>? methodDetails = null;
        if (!string.IsNullOrWhiteSpace(payment.MethodDetailsJson))
        {
            try
            {
                methodDetails = JsonSerializer.Deserialize<Dictionary<string, string>>(payment.MethodDetailsJson);
            }
            catch
            {
                methodDetails = null;
            }
        }

        var auditLogs = await _auditLogRepository.GetByEntityAsync(tenantId, "Payment", payment.Id.ToString());

        return new PaymentDetailDto
        {
            Id = payment.Id,
            TenantId = payment.TenantId,
            BranchId = payment.BranchId,
            PaymentNumber = payment.PaymentNumber,
            CustomerId = payment.CustomerId,
            CustomerName = GetCustomerDisplayName(payment.Customer),
            CustomerCode = payment.Customer?.CustomerCode ?? string.Empty,
            CustomerEmail = payment.Customer?.Email,
            CustomerPhone = payment.Customer?.Phone,
            InvoiceId = primaryAllocation?.InvoiceId ?? 0,
            InvoiceNumber = primaryAllocation?.Invoice?.InvoiceNumber ?? string.Empty,
            InvoiceNumbers = payment.Allocations
                .Where(a => a.Invoice != null && !string.IsNullOrWhiteSpace(a.Invoice.InvoiceNumber))
                .Select(a => a.Invoice!.InvoiceNumber)
                .Distinct()
                .ToList(),
            PaymentDate = payment.PaymentDate,
            Amount = payment.Amount,
            AllocatedAmount = payment.AllocatedAmount,
            Currency = payment.Currency,
            Method = PaymentValidator.FormatPaymentMethod(payment.Method, payment.CustomMethodName),
            MethodDisplay = PaymentValidator.FormatMethodDisplay(payment.Method, payment.CustomMethodName),
            CustomMethodName = payment.CustomMethodName,
            Reference = PaymentValidator.MaskReference(payment.Reference, payment.Method),
            BankName = payment.BankName,
            AccountLabel = payment.AccountLabel,
            TransferDate = payment.TransferDate,
            UpiPayerMetadata = payment.UpiPayerMetadata,
            ChequeNumber = payment.ChequeNumber,
            ChequeDate = payment.ChequeDate,
            ClearingStatus = payment.ClearingStatus,
            ProviderName = payment.ProviderName,
            ProviderTransactionId = payment.ProviderTransactionId,
            CallbackStatus = payment.CallbackStatus,
            MethodDetails = methodDetails,
            Status = payment.Status.ToString(),
            Notes = payment.Notes,
            IdempotencyKey = payment.IdempotencyKey,
            IsReversible = payment.IsReversible,
            CreatedBy = payment.CreatedBy,
            CreatedAtUtc = payment.CreatedAtUtc,
            UpdatedAtUtc = payment.UpdatedAtUtc,
            ReversedAtUtc = payment.ReversedAtUtc,
            ReversedBy = payment.ReversedBy,
            ReversalReason = payment.ReversalReason,
            Allocations = payment.Allocations.Select(a => new PaymentAllocationDto
            {
                Id = a.Id,
                TenantId = a.TenantId,
                PaymentId = a.PaymentId,
                InvoiceId = a.InvoiceId,
                InvoiceNumber = a.Invoice?.InvoiceNumber ?? string.Empty,
                CustomerId = payment.CustomerId,
                CustomerName = GetCustomerDisplayName(payment.Customer),
                InvoiceDate = a.Invoice?.InvoiceDate,
                InvoiceDueDate = a.Invoice?.DueDate,
                InvoiceTotal = a.Invoice?.TotalAmount ?? 0m,
                InvoicePaidAmount = a.Invoice?.PaidAmount ?? 0m,
                InvoiceBalanceAmount = a.Invoice != null ? a.Invoice.GetEffectiveBalance() : 0m,
                InvoiceStatus = a.Invoice?.Status ?? string.Empty,
                AllocatedAmount = a.AllocatedAmount,
                IsReversed = a.IsReversed,
                ReversedAtUtc = a.ReversedAtUtc,
                ReversedBy = a.ReversedBy,
                ReversalReason = a.ReversalReason,
                CreatedAtUtc = a.CreatedAtUtc
            }).ToList(),
            AuditHistory = auditLogs.Select(l => new PaymentAuditEventDto
            {
                Id = l.Id,
                Action = l.Action,
                UserName = l.UserName,
                Timestamp = l.Timestamp,
                Changes = l.Changes
            }).ToList()
        };
    }

    private static EligibleInvoiceBalanceDto MapToEligibleInvoiceBalanceDto(Invoice invoice)
    {
        var isEligible = invoice.IsEligibleForPayment(out var reason);
        return new EligibleInvoiceBalanceDto
        {
            InvoiceId = invoice.Id,
            TenantId = invoice.TenantId,
            InvoiceNumber = invoice.InvoiceNumber,
            CustomerId = invoice.CustomerId,
            CustomerName = GetCustomerDisplayName(invoice.Customer),
            CustomerCode = invoice.Customer?.CustomerCode ?? string.Empty,
            CustomerEmail = invoice.Customer?.Email,
            InvoiceDate = invoice.InvoiceDate,
            DueDate = invoice.DueDate,
            Currency = invoice.GetCurrency(),
            InvoiceTotal = invoice.TotalAmount,
            PreviouslyPaid = invoice.PaidAmount,
            CurrentOutstanding = invoice.GetEffectiveBalance(),
            Status = invoice.Status,
            IsEligibleForPayment = isEligible,
            IneligibilityReason = reason
        };
    }
}
