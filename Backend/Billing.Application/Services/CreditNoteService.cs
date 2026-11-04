using System.Collections.Concurrent;
using System.Text.Json;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.CreditNote;
using Billing.Contracts.Numbering;
using Billing.Domain.Entities;

namespace Billing.Application.Services;

public class CreditNoteService : ICreditNoteService
{
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> ConcurrencyLocks = new();

    private static readonly decimal[] AllowedGstRates = { 0m, 5m, 12m, 18m, 28m };

    private static readonly HashSet<string> ApprovalAuthorizedRoles = new(StringComparer.OrdinalIgnoreCase)
    {
        "SuperAdmin",
        "TenantAdmin",
        "Admin",
        "BillingManager",
        "Finance",
        "FinanceAdmin",
        "Accountant"
    };

    private static readonly HashSet<string> ApprovalAuthorizedPermissions = new(StringComparer.OrdinalIgnoreCase)
    {
        "all",
        "billing.admin",
        "creditnote.approve",
        "creditnotes.approve",
        "creditnote.issue",
        "creditnotes.issue"
    };

    private static readonly HashSet<string> CreateOrEditAuthorizedRoles = new(StringComparer.OrdinalIgnoreCase)
    {
        "SuperAdmin",
        "TenantAdmin",
        "Admin",
        "BillingManager",
        "Finance",
        "FinanceAdmin",
        "Accountant",
        "Staff",
        "BillingStaff",
        "User"
    };

    private static readonly HashSet<string> CreateOrEditAuthorizedPermissions = new(StringComparer.OrdinalIgnoreCase)
    {
        "all",
        "billing.admin",
        "billing.create",
        "billing.edit",
        "creditnote.create",
        "creditnotes.create",
        "creditnote.edit",
        "creditnotes.edit",
        "creditnote.manage",
        "creditnotes.manage",
        "creditnote.approve",
        "creditnotes.approve",
        "creditnote.issue",
        "creditnotes.issue"
    };

    private static readonly HashSet<string> AllowedRefundPaymentMethods = new(StringComparer.OrdinalIgnoreCase)
    {
        "Bank Transfer",
        "Original Payment Method",
        "UPI",
        "Cheque",
        "Check",
        "Cash",
        "Credit Card",
        "Debit Card",
        "Card",
        "Gateway",
        "Online",
        "Wire Transfer",
        "NEFT",
        "RTGS",
        "IMPS",
        "Wallet",
        "Other"
    };

    private readonly ICreditNoteRepository _creditNoteRepository;
    private readonly IInvoiceRepository _invoiceRepository;
    private readonly ICustomerRepository _customerRepository;
    private readonly INumberGenerationService _numberGenerationService;
    private readonly IAuditLogRepository _auditLogRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IOutboxService? _outboxService;
    private readonly INotificationService? _notificationService;

    public CreditNoteService(
        ICreditNoteRepository creditNoteRepository,
        IInvoiceRepository invoiceRepository,
        ICustomerRepository customerRepository,
        INumberGenerationService numberGenerationService,
        IAuditLogRepository auditLogRepository,
        IUnitOfWork unitOfWork,
        IOutboxService? outboxService = null,
        INotificationService? notificationService = null)
    {
        _creditNoteRepository = creditNoteRepository;
        _invoiceRepository = invoiceRepository;
        _customerRepository = customerRepository;
        _numberGenerationService = numberGenerationService;
        _auditLogRepository = auditLogRepository;
        _unitOfWork = unitOfWork;
        _outboxService = outboxService;
        _notificationService = notificationService;
    }

    public async Task<ApiResponse<CreditNoteDetailDto>> CreateCreditNoteAsync(
        int tenantId,
        CreateCreditNoteRequest request,
        string userDisplayName,
        List<string> userRoles,
        List<string> userPermissions,
        int? restrictedCustomerId = null,
        CancellationToken cancellationToken = default)
    {
        if (request == null)
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("Invalid request payload.");
        }

        if (request.InvoiceId <= 0)
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("A valid InvoiceId is required.");
        }

        if (string.IsNullOrWhiteSpace(request.Reason))
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("A valid credit reason is required.");
        }

        if (!IsSupportedCreditType(request.Type))
        {
            return ApiResponse<CreditNoteDetailDto>.Fail($"Unsupported credit note type '{request.Type}'. Supported types are 'Full' and 'Partial'.");
        }

        var lockKey = $"{tenantId}:InvoiceCredit:{request.InvoiceId}";
        var semaphore = ConcurrencyLocks.GetOrAdd(lockKey, _ => new SemaphoreSlim(1, 1));

        await semaphore.WaitAsync(cancellationToken);
        try
        {
            await _unitOfWork.BeginTransactionAsync();

            var invoice = await _invoiceRepository.GetByIdAsync(request.InvoiceId, tenantId, cancellationToken);
            if (invoice == null)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail($"Invoice with ID {request.InvoiceId} was not found for this tenant.");
            }

            if (restrictedCustomerId.HasValue && invoice.CustomerId != restrictedCustomerId.Value)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail("You are not authorized to create credit notes against this invoice.");
            }

            if (!IsUserAuthorizedForCreateOrEdit(userRoles, userPermissions, restrictedCustomerId))
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail("You do not have permission to create credit notes.");
            }

            if (!invoice.IsEligibleForCredit(out var ineligibilityReason))
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail(ineligibilityReason ?? "Invoice is not eligible for credit note.");
            }

            var invoiceCredits = await _creditNoteRepository.GetByInvoiceIdAsync(invoice.Id, tenantId, cancellationToken);

            if (!string.IsNullOrWhiteSpace(request.IdempotencyKey))
            {
                var trimmedKey = request.IdempotencyKey.Trim();
                var duplicate = invoiceCredits.FirstOrDefault(cn =>
                    !IsInactiveCredit(cn) &&
                    string.Equals(cn.IdempotencyKey, trimmedKey, StringComparison.Ordinal));
                if (duplicate != null)
                {
                    await _unitOfWork.RollbackTransactionAsync();
                    return ApiResponse<CreditNoteDetailDto>.Fail("Duplicate credit note request detected for the provided idempotency key.");
                }
            }

            var issuedCredits = invoiceCredits.Where(IsIssuedCredit).ToList();
            var activeCredits = invoiceCredits.Where(cn => !IsInactiveCredit(cn)).ToList();
            var effectiveInvoiceItems = GetEffectiveInvoiceItems(invoice);

            var previouslyCreditedQuantities = GetPreviouslyCreditedQuantities(issuedCredits, effectiveInvoiceItems);
            var activeReservedQuantities = GetPreviouslyCreditedQuantities(activeCredits, effectiveInvoiceItems);
            var requestedItems = request.Items ?? new List<CreateCreditNoteItemRequest>();

            var remainingLines = effectiveInvoiceItems
                .Select(item => new
                {
                    Item = item,
                    Quantity = Math.Max(0m, item.Quantity - previouslyCreditedQuantities.GetValueOrDefault(item.Id))
                })
                .Where(line => line.Quantity > 0m)
                .ToList();

            if (remainingLines.Count == 0)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail($"Invoice '{invoice.InvoiceNumber}' has no remaining eligible item quantities to credit.");
            }

            var normalizedType = string.Equals(request.Type, "Partial", StringComparison.OrdinalIgnoreCase) ? "Partial" : "Full";

            if (string.Equals(normalizedType, "Full", StringComparison.OrdinalIgnoreCase))
            {
                if (requestedItems.Count == 0)
                {
                    requestedItems = remainingLines.Select(line => new CreateCreditNoteItemRequest
                    {
                        InvoiceItemId = line.Item.Id,
                        Description = line.Item.Description,
                        Quantity = line.Quantity
                    }).ToList();
                }

                var requestedById = requestedItems
                    .Where(item => item.InvoiceItemId.HasValue)
                    .GroupBy(item => item.InvoiceItemId!.Value)
                    .ToDictionary(group => group.Key, group => group.ToList());

                if (requestedById.Count != requestedItems.Count || remainingLines.Any(line =>
                        !requestedById.TryGetValue(line.Item.Id, out var lines) || lines.Count != 1 || lines[0].Quantity != line.Quantity) ||
                    requestedById.Keys.Any(id => remainingLines.All(line => line.Item.Id != id)))
                {
                    await _unitOfWork.RollbackTransactionAsync();
                    return ApiResponse<CreditNoteDetailDto>.Fail("Full credit must include every remaining eligible invoice line at its remaining quantity.");
                }
            }
            else if (requestedItems.Count == 0)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail("At least one line item must be selected for partial credit.");
            }

            // Generate Credit Note Number
            var numberResult = await _numberGenerationService.GenerateNextNumberAsync(new GenerateNumberRequest
            {
                DocumentType = "CreditNote",
                TransactionDate = request.CreditDate ?? DateTime.UtcNow
            }, tenantId);

            var creditNoteNumber = numberResult.Success && !string.IsNullOrWhiteSpace(numberResult.Data?.GeneratedNumber)
                ? numberResult.Data.GeneratedNumber
                : $"CN-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";

            var creditNote = new CreditNote
            {
                TenantId = tenantId,
                CreditNoteNumber = creditNoteNumber,
                InvoiceId = invoice.Id,
                CustomerId = invoice.CustomerId,
                CreditDate = request.CreditDate ?? DateTime.UtcNow,
                Type = normalizedType,
                Reason = request.Reason.Trim(),
                Notes = request.Notes?.Trim(),
                IdempotencyKey = request.IdempotencyKey?.Trim(),
                Status = "Draft",
                CreatedBy = userDisplayName,
                CreatedAtUtc = DateTime.UtcNow,
                RowVersion = DateTime.UtcNow
            };

            var remainingCreditable = GetEffectiveRemainingCreditableAmount(invoice, issuedCredits);
            if (remainingCreditable <= 0m)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail($"Invoice '{invoice.InvoiceNumber}' has no remaining creditable balance.");
            }

            var calculationError = PopulateCreditNoteItems(
                creditNote,
                invoice,
                effectiveInvoiceItems,
                requestedItems,
                previouslyCreditedQuantities,
                activeReservedQuantities,
                issuedCredits,
                remainingCreditable);
            if (calculationError != null)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail(calculationError);
            }

            if (creditNote.TotalAmount <= 0m)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail("Credit note total amount must be greater than zero.");
            }

            if (creditNote.TotalAmount > remainingCreditable)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail($"Total credit amount ({creditNote.TotalAmount:F2}) cannot exceed remaining eligible creditable amount ({remainingCreditable:F2}).");
            }

            var activeReservedAmount = activeCredits.Sum(c => c.TotalAmount);
            var availableUnreservedAmount = Math.Max(0m, Math.Round(invoice.TotalAmount - Math.Max(invoice.CreditedAmount, activeReservedAmount), 2, MidpointRounding.AwayFromZero));
            if (creditNote.TotalAmount > availableUnreservedAmount + 0.50m)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail($"Total credit amount ({creditNote.TotalAmount:F2}) exceeds available unreserved invoice credit ({availableUnreservedAmount:F2}) due to existing active credit notes.");
            }

            // Formula (Step 6): Remaining Refundable Amount = Issued Credit Amount - Successfully Refunded Amount.
            // Draft credit notes are not yet issued, so RemainingRefundableAmount is 0 until Issued.
            creditNote.RemainingRefundableAmount = 0m;

            var savedCreditNote = await _creditNoteRepository.AddAsync(creditNote, cancellationToken);

            await _auditLogRepository.AddAsync(new AuditLog
            {
                TenantId = tenantId,
                EntityName = "CreditNote",
                EntityId = savedCreditNote.Id.ToString(),
                Action = "CreateDraft",
                Changes = JsonSerializer.Serialize(new
                {
                    CreditNoteNumber = savedCreditNote.CreditNoteNumber,
                    InvoiceId = savedCreditNote.InvoiceId,
                    Subtotal = savedCreditNote.Subtotal,
                    DiscountAmount = savedCreditNote.DiscountAmount,
                    TaxAmount = savedCreditNote.TaxAmount,
                    TotalAmount = savedCreditNote.TotalAmount,
                    Type = savedCreditNote.Type,
                    Reason = savedCreditNote.Reason
                }),
                UserName = userDisplayName,
                Timestamp = DateTime.UtcNow
            }, cancellationToken);

            await _unitOfWork.CommitTransactionAsync();

            return ApiResponse<CreditNoteDetailDto>.Ok(MapToDetailDto(savedCreditNote, invoice), "Credit Note draft created successfully.");
        }
        catch (Exception ex)
        {
            await _unitOfWork.RollbackTransactionAsync();
            return ApiResponse<CreditNoteDetailDto>.Fail($"Failed to create credit note: {ex.Message}");
        }
        finally
        {
            semaphore.Release();
        }
    }

    public async Task<ApiResponse<CreditNoteDetailDto>> UpdateCreditNoteDraftAsync(
        int tenantId,
        int id,
        UpdateCreditNoteRequest request,
        string userDisplayName,
        List<string> userRoles,
        List<string> userPermissions,
        int? restrictedCustomerId = null,
        CancellationToken cancellationToken = default)
    {
        if (request == null)
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("Invalid request payload.");
        }

        if (string.IsNullOrWhiteSpace(request.Reason))
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("A valid credit reason is required.");
        }

        if (!IsSupportedCreditType(request.Type))
        {
            return ApiResponse<CreditNoteDetailDto>.Fail($"Unsupported credit note type '{request.Type}'. Supported types are 'Full' and 'Partial'.");
        }

        var existing = await _creditNoteRepository.GetByIdAsync(id, tenantId, cancellationToken);
        if (existing == null)
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("Credit note not found.");
        }

        var lockKey = $"{tenantId}:InvoiceCredit:{existing.InvoiceId}";
        var semaphore = ConcurrencyLocks.GetOrAdd(lockKey, _ => new SemaphoreSlim(1, 1));

        await semaphore.WaitAsync(cancellationToken);
        try
        {
            await _unitOfWork.BeginTransactionAsync();

            var creditNote = await _creditNoteRepository.GetByIdForUpdateAsync(id, tenantId, cancellationToken);
            if (creditNote == null)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail("Credit note not found.");
            }

            if (restrictedCustomerId.HasValue && creditNote.CustomerId != restrictedCustomerId.Value)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail("You are not authorized to edit this credit note.");
            }

            if (!IsUserAuthorizedForCreateOrEdit(userRoles, userPermissions, restrictedCustomerId))
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail("You do not have permission to edit credit notes.");
            }

            if (!creditNote.CanEdit())
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail($"Credit note cannot be edited in '{creditNote.Status}' status.");
            }

            var invoice = await _invoiceRepository.GetByIdAsync(creditNote.InvoiceId, tenantId, cancellationToken);
            if (invoice == null)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail("Associated invoice not found.");
            }

            if (!invoice.IsEligibleForCredit(out var ineligibilityReason))
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail(ineligibilityReason ?? "Invoice is not eligible for credit note.");
            }

            creditNote.Reason = request.Reason.Trim();
            creditNote.Notes = request.Notes?.Trim();
            if (request.CreditDate.HasValue)
            {
                creditNote.CreditDate = request.CreditDate.Value;
            }
            creditNote.Type = string.Equals(request.Type, "Partial", StringComparison.OrdinalIgnoreCase) ? "Partial" : "Full";

            creditNote.Items.Clear();

            var invoiceCredits = await _creditNoteRepository.GetByInvoiceIdAsync(invoice.Id, tenantId, cancellationToken);
            var issuedCredits = invoiceCredits.Where(c => c.Id != creditNote.Id && IsIssuedCredit(c)).ToList();
            var otherActiveCredits = invoiceCredits.Where(c => c.Id != creditNote.Id && !IsInactiveCredit(c)).ToList();
            var effectiveInvoiceItems = GetEffectiveInvoiceItems(invoice);

            var previouslyCreditedQuantities = GetPreviouslyCreditedQuantities(issuedCredits, effectiveInvoiceItems);
            var activeReservedQuantities = GetPreviouslyCreditedQuantities(otherActiveCredits, effectiveInvoiceItems);
            var requestedItems = request.Items ?? new List<CreateCreditNoteItemRequest>();
            var remainingLines = effectiveInvoiceItems
                .Select(item => new
                {
                    Item = item,
                    Quantity = Math.Max(0m, item.Quantity - previouslyCreditedQuantities.GetValueOrDefault(item.Id))
                })
                .Where(line => line.Quantity > 0m)
                .ToList();

            if (string.Equals(creditNote.Type, "Full", StringComparison.OrdinalIgnoreCase))
            {
                if (requestedItems.Count == 0)
                {
                    requestedItems = remainingLines.Select(line => new CreateCreditNoteItemRequest
                    {
                        InvoiceItemId = line.Item.Id,
                        Description = line.Item.Description,
                        Quantity = line.Quantity
                    }).ToList();
                }
                var requestedById = requestedItems
                    .Where(item => item.InvoiceItemId.HasValue)
                    .GroupBy(item => item.InvoiceItemId!.Value)
                    .ToDictionary(group => group.Key, group => group.ToList());
                if (requestedById.Count != requestedItems.Count || remainingLines.Any(line =>
                        !requestedById.TryGetValue(line.Item.Id, out var lines) || lines.Count != 1 || lines[0].Quantity != line.Quantity) ||
                    requestedById.Keys.Any(id => remainingLines.All(line => line.Item.Id != id)))
                {
                    await _unitOfWork.RollbackTransactionAsync();
                    return ApiResponse<CreditNoteDetailDto>.Fail("Full credit must include every remaining eligible invoice line at its remaining quantity.");
                }
            }
            else if (requestedItems.Count == 0)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail("At least one line item must be selected for partial credit.");
            }

            var remainingCreditable = GetEffectiveRemainingCreditableAmount(invoice, issuedCredits);
            var calculationError = PopulateCreditNoteItems(
                creditNote,
                invoice,
                effectiveInvoiceItems,
                requestedItems,
                previouslyCreditedQuantities,
                activeReservedQuantities,
                issuedCredits,
                remainingCreditable);
            if (calculationError != null)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail(calculationError);
            }

            if (creditNote.TotalAmount <= 0m)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail("Credit note total amount must be greater than zero.");
            }

            if (creditNote.TotalAmount > remainingCreditable)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail($"Total credit amount ({creditNote.TotalAmount:F2}) cannot exceed remaining eligible creditable amount ({remainingCreditable:F2}).");
            }

            creditNote.RemainingRefundableAmount = 0m;
            creditNote.UpdatedAtUtc = DateTime.UtcNow;
            creditNote.RowVersion = DateTime.UtcNow;

            var updated = await _creditNoteRepository.UpdateAsync(creditNote, cancellationToken);

            await _auditLogRepository.AddAsync(new AuditLog
            {
                TenantId = tenantId,
                EntityName = "CreditNote",
                EntityId = creditNote.Id.ToString(),
                Action = "UpdateDraft",
                Changes = JsonSerializer.Serialize(new
                {
                    CreditNoteNumber = creditNote.CreditNoteNumber,
                    Subtotal = creditNote.Subtotal,
                    DiscountAmount = creditNote.DiscountAmount,
                    TaxAmount = creditNote.TaxAmount,
                    TotalAmount = creditNote.TotalAmount,
                    Type = creditNote.Type,
                    Reason = creditNote.Reason
                }),
                UserName = userDisplayName,
                Timestamp = DateTime.UtcNow
            }, cancellationToken);

            await _unitOfWork.CommitTransactionAsync();

            return ApiResponse<CreditNoteDetailDto>.Ok(MapToDetailDto(updated, invoice), "Credit note draft updated successfully.");
        }
        catch (Exception ex)
        {
            await _unitOfWork.RollbackTransactionAsync();
            return ApiResponse<CreditNoteDetailDto>.Fail($"Failed to update credit note draft: {ex.Message}");
        }
        finally
        {
            semaphore.Release();
        }
    }

    public async Task<ApiResponse<CreditNoteDetailDto>> SubmitForApprovalAsync(
        int tenantId,
        int id,
        string userDisplayName,
        List<string> userRoles,
        List<string> userPermissions,
        CancellationToken cancellationToken = default)
    {
        if (!IsUserAuthorizedForCreateOrEdit(userRoles, userPermissions, null))
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("You do not have permission to submit credit notes for approval.");
        }

        var existing = await _creditNoteRepository.GetByIdAsync(id, tenantId, cancellationToken);
        if (existing == null)
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("Credit note not found.");
        }

        var lockKey = $"{tenantId}:InvoiceCredit:{existing.InvoiceId}";
        var semaphore = ConcurrencyLocks.GetOrAdd(lockKey, _ => new SemaphoreSlim(1, 1));

        await semaphore.WaitAsync(cancellationToken);
        try
        {
            await _unitOfWork.BeginTransactionAsync();

            var creditNote = await _creditNoteRepository.GetByIdForUpdateAsync(id, tenantId, cancellationToken);
            if (creditNote == null)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail("Credit note not found.");
            }

            if (!creditNote.CanSubmit())
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail($"Credit note in '{creditNote.Status}' status cannot be submitted for approval.");
            }

            if (string.IsNullOrWhiteSpace(creditNote.Reason))
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail("A valid credit reason is mandatory before submitting.");
            }

            if (creditNote.TotalAmount <= 0m || creditNote.Items.Count == 0)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail("Credit note total amount must be greater than zero and contain at least one item.");
            }

            var invoice = await _invoiceRepository.GetByIdAsync(creditNote.InvoiceId, tenantId, cancellationToken);
            if (invoice == null)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail("Associated invoice not found.");
            }

            if (!invoice.IsEligibleForCredit(out var ineligibilityReason))
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail(ineligibilityReason ?? "Invoice is no longer eligible for credit.");
            }

            var eligibilityError = await ValidateExistingCreditNoteEligibilityAsync(creditNote, invoice, tenantId, cancellationToken);
            if (eligibilityError != null)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail(eligibilityError);
            }

            creditNote.Status = "PendingApproval";
            creditNote.RemainingRefundableAmount = 0m;
            creditNote.UpdatedAtUtc = DateTime.UtcNow;
            creditNote.RowVersion = DateTime.UtcNow;

            var updated = await _creditNoteRepository.UpdateAsync(creditNote, cancellationToken);

            await _auditLogRepository.AddAsync(new AuditLog
            {
                TenantId = tenantId,
                EntityName = "CreditNote",
                EntityId = creditNote.Id.ToString(),
                Action = "SubmitForApproval",
                Changes = JsonSerializer.Serialize(new { Status = "PendingApproval", SubmittedBy = userDisplayName }),
                UserName = userDisplayName,
                Timestamp = DateTime.UtcNow
            }, cancellationToken);

            await _unitOfWork.CommitTransactionAsync();

            return ApiResponse<CreditNoteDetailDto>.Ok(MapToDetailDto(updated, invoice), "Credit note submitted for approval successfully.");
        }
        catch (Exception ex)
        {
            await _unitOfWork.RollbackTransactionAsync();
            return ApiResponse<CreditNoteDetailDto>.Fail($"Failed to submit credit note: {ex.Message}");
        }
        finally
        {
            semaphore.Release();
        }
    }

    public async Task<ApiResponse<CreditNoteDetailDto>> ApproveCreditNoteAsync(
        int tenantId,
        int id,
        string userDisplayName,
        List<string> userRoles,
        List<string> userPermissions,
        CancellationToken cancellationToken = default)
    {
        if (!IsUserAuthorizedForApproval(userRoles, userPermissions))
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("You do not have permission to approve credit notes.");
        }

        var existing = await _creditNoteRepository.GetByIdAsync(id, tenantId, cancellationToken);
        if (existing == null)
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("Credit note not found.");
        }

        var lockKey = $"{tenantId}:InvoiceCredit:{existing.InvoiceId}";
        var semaphore = ConcurrencyLocks.GetOrAdd(lockKey, _ => new SemaphoreSlim(1, 1));

        await semaphore.WaitAsync(cancellationToken);
        try
        {
            await _unitOfWork.BeginTransactionAsync();

            var creditNote = await _creditNoteRepository.GetByIdForUpdateAsync(id, tenantId, cancellationToken);
            if (creditNote == null)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail("Credit note not found.");
            }

            if (!creditNote.CanApproveOrReject())
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail($"Credit note in '{creditNote.Status}' status cannot be approved. Only 'PendingApproval' credit notes can be approved.");
            }

            if (IsSelfApprovalBlocked(creditNote.CreatedBy, userDisplayName, userRoles))
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail("Separation of duties violation: You cannot approve a credit note that you created.");
            }

            var invoice = await _invoiceRepository.GetByIdAsync(creditNote.InvoiceId, tenantId, cancellationToken);
            if (invoice == null)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail("Associated invoice not found.");
            }

            if (!invoice.IsEligibleForCredit(out var ineligibilityReason))
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail(ineligibilityReason ?? "Invoice is no longer eligible for credit.");
            }

            var eligibilityError = await ValidateExistingCreditNoteEligibilityAsync(creditNote, invoice, tenantId, cancellationToken);
            if (eligibilityError != null)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail(eligibilityError);
            }

            creditNote.Status = "Approved";
            creditNote.RemainingRefundableAmount = 0m;
            creditNote.ApprovedBy = userDisplayName;
            creditNote.ApprovedAtUtc = DateTime.UtcNow;
            creditNote.UpdatedAtUtc = DateTime.UtcNow;
            creditNote.RowVersion = DateTime.UtcNow;

            var updated = await _creditNoteRepository.UpdateAsync(creditNote, cancellationToken);

            await _auditLogRepository.AddAsync(new AuditLog
            {
                TenantId = tenantId,
                EntityName = "CreditNote",
                EntityId = creditNote.Id.ToString(),
                Action = "Approve",
                Changes = JsonSerializer.Serialize(new { Status = "Approved", ApprovedBy = userDisplayName, ApprovedAt = creditNote.ApprovedAtUtc }),
                UserName = userDisplayName,
                Timestamp = DateTime.UtcNow
            }, cancellationToken);

            await _unitOfWork.CommitTransactionAsync();

            return ApiResponse<CreditNoteDetailDto>.Ok(MapToDetailDto(updated, invoice), "Credit note approved successfully.");
        }
        catch (Exception ex)
        {
            await _unitOfWork.RollbackTransactionAsync();
            return ApiResponse<CreditNoteDetailDto>.Fail($"Failed to approve credit note: {ex.Message}");
        }
        finally
        {
            semaphore.Release();
        }
    }

    public async Task<ApiResponse<CreditNoteDetailDto>> RejectCreditNoteAsync(
        int tenantId,
        int id,
        RejectCreditNoteRequest request,
        string userDisplayName,
        List<string> userRoles,
        List<string> userPermissions,
        CancellationToken cancellationToken = default)
    {
        if (!IsUserAuthorizedForApproval(userRoles, userPermissions))
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("You do not have permission to reject credit notes.");
        }

        if (request == null || string.IsNullOrWhiteSpace(request.Reason))
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("Rejection reason is required.");
        }

        var existing = await _creditNoteRepository.GetByIdAsync(id, tenantId, cancellationToken);
        if (existing == null)
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("Credit note not found.");
        }

        var lockKey = $"{tenantId}:InvoiceCredit:{existing.InvoiceId}";
        var semaphore = ConcurrencyLocks.GetOrAdd(lockKey, _ => new SemaphoreSlim(1, 1));

        await semaphore.WaitAsync(cancellationToken);
        try
        {
            await _unitOfWork.BeginTransactionAsync();

            var creditNote = await _creditNoteRepository.GetByIdForUpdateAsync(id, tenantId, cancellationToken);
            if (creditNote == null)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail("Credit note not found.");
            }

            if (!creditNote.CanApproveOrReject())
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail($"Credit note in '{creditNote.Status}' status cannot be rejected.");
            }

            creditNote.Status = "Rejected";
            creditNote.RemainingRefundableAmount = 0m;
            creditNote.RejectionReason = request.Reason.Trim();
            creditNote.RejectedBy = userDisplayName;
            creditNote.RejectedAtUtc = DateTime.UtcNow;
            creditNote.UpdatedAtUtc = DateTime.UtcNow;
            creditNote.RowVersion = DateTime.UtcNow;

            var updated = await _creditNoteRepository.UpdateAsync(creditNote, cancellationToken);

            await _auditLogRepository.AddAsync(new AuditLog
            {
                TenantId = tenantId,
                EntityName = "CreditNote",
                EntityId = creditNote.Id.ToString(),
                Action = "Reject",
                Changes = JsonSerializer.Serialize(new { Status = "Rejected", RejectedBy = userDisplayName, Reason = creditNote.RejectionReason }),
                UserName = userDisplayName,
                Timestamp = DateTime.UtcNow
            }, cancellationToken);

            await _unitOfWork.CommitTransactionAsync();

            var invoice = await _invoiceRepository.GetByIdAsync(creditNote.InvoiceId, tenantId, cancellationToken);
            return ApiResponse<CreditNoteDetailDto>.Ok(MapToDetailDto(updated, invoice), "Credit note rejected.");
        }
        catch (Exception ex)
        {
            await _unitOfWork.RollbackTransactionAsync();
            return ApiResponse<CreditNoteDetailDto>.Fail($"Failed to reject credit note: {ex.Message}");
        }
        finally
        {
            semaphore.Release();
        }
    }

    public async Task<ApiResponse<CreditNoteDetailDto>> IssueCreditNoteAsync(
        int tenantId,
        int id,
        string userDisplayName,
        List<string> userRoles,
        List<string> userPermissions,
        CancellationToken cancellationToken = default)
    {
        if (!IsUserAuthorizedForApproval(userRoles, userPermissions))
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("You do not have permission to issue credit notes.");
        }

        var existing = await _creditNoteRepository.GetByIdAsync(id, tenantId, cancellationToken);
        if (existing == null)
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("Credit note not found.");
        }

        // Lock at the Invoice level so concurrent credit note issuances against the same invoice are serialized
        var lockKey = $"{tenantId}:InvoiceCredit:{existing.InvoiceId}";
        var semaphore = ConcurrencyLocks.GetOrAdd(lockKey, _ => new SemaphoreSlim(1, 1));

        await semaphore.WaitAsync(cancellationToken);
        try
        {
            await _unitOfWork.BeginTransactionAsync();

            var creditNote = await _creditNoteRepository.GetByIdForUpdateAsync(id, tenantId, cancellationToken);
            if (creditNote == null)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail("Credit note not found.");
            }

            if (!creditNote.CanIssue())
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail($"Credit note in '{creditNote.Status}' status cannot be issued. It must be in 'Approved' status.");
            }

            if (IsSelfApprovalBlocked(creditNote.CreatedBy, userDisplayName, userRoles))
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail("Separation of duties violation: You cannot issue a credit note that you created.");
            }

            var invoice = await _invoiceRepository.GetByIdForUpdateAsync(creditNote.InvoiceId, tenantId);
            if (invoice == null)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail("Invoice associated with credit note was not found.");
            }

            if (!invoice.IsEligibleForCredit(out var ineligibilityReason))
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail(ineligibilityReason ?? "Invoice is not eligible for credit note issuance.");
            }

            var allInvoiceCredits = await _creditNoteRepository.GetByInvoiceIdAsync(invoice.Id, tenantId, cancellationToken);
            var issuedCredits = allInvoiceCredits.Where(c => c.Id != creditNote.Id && IsIssuedCredit(c)).ToList();
            var effectiveInvoiceItems = GetEffectiveInvoiceItems(invoice);
            var previouslyCreditedQuantities = GetPreviouslyCreditedQuantities(issuedCredits, effectiveInvoiceItems);

            // Re-validate item-level quantities against all previously issued credit notes on this invoice
            foreach (var line in creditNote.Items)
            {
                var matchId = line.InvoiceItemId ?? (effectiveInvoiceItems.Count == 1 && effectiveInvoiceItems[0].Id == 0 ? 0 : -1);
                var sourceItem = effectiveInvoiceItems.FirstOrDefault(i => i.Id == matchId);
                if (sourceItem != null)
                {
                    var prevQty = previouslyCreditedQuantities.GetValueOrDefault(sourceItem.Id);
                    var remainingQty = Math.Max(0m, sourceItem.Quantity - prevQty);
                    if (line.Quantity > remainingQty)
                    {
                        await _unitOfWork.RollbackTransactionAsync();
                        return ApiResponse<CreditNoteDetailDto>.Fail($"Credit quantity ({line.Quantity}) for '{sourceItem.Description}' exceeds remaining eligible quantity ({remainingQty}) at issuance.");
                    }
                }
            }

            // Calculate existing issued credits for this invoice (respecting both persisted invoice.CreditedAmount and issued credit notes)
            var currentIssuedCreditsRepo = await _creditNoteRepository.GetTotalIssuedCreditsForInvoiceAsync(invoice.Id, tenantId, cancellationToken);
            var effectiveCurrentIssuedCredits = Math.Max(
                Math.Max(0m, Math.Round(invoice.CreditedAmount, 2, MidpointRounding.AwayFromZero)),
                Math.Max(0m, Math.Round(currentIssuedCreditsRepo, 2, MidpointRounding.AwayFromZero)));
            var remainingCreditable = Math.Max(0m, Math.Round(invoice.TotalAmount - effectiveCurrentIssuedCredits, 2, MidpointRounding.AwayFromZero));

            if (creditNote.TotalAmount > remainingCreditable)
            {
                if (remainingCreditable > 0m && (creditNote.TotalAmount - remainingCreditable) <= 0.50m && creditNote.Items.Count > 0)
                {
                    var roundingDiff = Math.Round(remainingCreditable - creditNote.TotalAmount, 2, MidpointRounding.AwayFromZero);
                    creditNote.RoundingAmount = Math.Round(creditNote.RoundingAmount + roundingDiff, 2, MidpointRounding.AwayFromZero);
                    creditNote.TotalAmount = remainingCreditable;
                }
                else
                {
                    await _unitOfWork.RollbackTransactionAsync();
                    return ApiResponse<CreditNoteDetailDto>.Fail($"Credit note amount ({creditNote.TotalAmount:F2}) exceeds the invoice's remaining creditable amount ({remainingCreditable:F2}).");
                }
            }

            // Update credit note status to Issued
            creditNote.Status = "Issued";
            creditNote.IssuedBy = userDisplayName;
            creditNote.IssuedAtUtc = DateTime.UtcNow;
            creditNote.UpdatedAtUtc = DateTime.UtcNow;
            creditNote.RowVersion = DateTime.UtcNow;
            creditNote.RecalculateRefundableBalance();

            await _creditNoteRepository.UpdateAsync(creditNote, cancellationToken);

            // Update invoice balances and status
            var newTotalIssuedCredits = Math.Round(effectiveCurrentIssuedCredits + creditNote.TotalAmount, 2, MidpointRounding.AwayFromZero);
            invoice.RecalculateBalanceAndStatus(effectiveCreditedTotal: newTotalIssuedCredits);

            await _invoiceRepository.UpdateAsync(invoice, cancellationToken);

            await _auditLogRepository.AddAsync(new AuditLog
            {
                TenantId = tenantId,
                EntityName = "CreditNote",
                EntityId = creditNote.Id.ToString(),
                Action = "Issue",
                Changes = JsonSerializer.Serialize(new
                {
                    Status = "Issued",
                    IssuedBy = userDisplayName,
                    IssuedAmount = creditNote.TotalAmount,
                    InvoiceId = invoice.Id,
                    InvoiceNewCreditedAmount = invoice.CreditedAmount,
                    InvoiceNewBalance = invoice.BalanceAmount,
                    InvoiceRemainingCreditable = invoice.GetRemainingCreditableAmount(),
                    InvoiceNewStatus = invoice.Status
                }),
                UserName = userDisplayName,
                Timestamp = DateTime.UtcNow
            }, cancellationToken);

            if (_outboxService != null)
            {
                await _outboxService.PublishEventAsync(tenantId, "credit_note.applied", new
                {
                    CreditNoteId = creditNote.Id,
                    CreditNoteNumber = creditNote.CreditNoteNumber,
                    InvoiceId = invoice.Id,
                    CustomerId = creditNote.CustomerId,
                    Amount = creditNote.TotalAmount,
                    IssuedBy = userDisplayName,
                    IssuedAtUtc = DateTime.UtcNow
                });
            }

            await _unitOfWork.CommitTransactionAsync();

            if (_notificationService != null)
            {
                try
                {
                    await _notificationService.SendCreditNoteNotificationAsync(creditNote.Id, tenantId, userDisplayName);
                }
                catch
                {
                    // Notification failure should not fail credit note issuance
                }
            }

            return ApiResponse<CreditNoteDetailDto>.Ok(MapToDetailDto(creditNote, invoice), "Credit note issued and invoice balance adjusted successfully.");
        }
        catch (Exception ex)
        {
            await _unitOfWork.RollbackTransactionAsync();
            return ApiResponse<CreditNoteDetailDto>.Fail($"Failed to issue credit note: {ex.Message}");
        }
        finally
        {
            semaphore.Release();
        }
    }

    public async Task<ApiResponse<CreditNoteDetailDto>> CancelCreditNoteAsync(
        int tenantId,
        int id,
        CancelCreditNoteRequest request,
        string userDisplayName,
        List<string> userRoles,
        List<string> userPermissions,
        CancellationToken cancellationToken = default)
    {
        if (!IsUserAuthorizedForCreateOrEdit(userRoles, userPermissions, null))
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("You do not have permission to cancel credit notes.");
        }

        if (request == null || string.IsNullOrWhiteSpace(request.Reason))
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("Cancellation reason is required.");
        }

        var existing = await _creditNoteRepository.GetByIdAsync(id, tenantId, cancellationToken);
        if (existing == null)
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("Credit note not found.");
        }

        var lockKey = $"{tenantId}:InvoiceCredit:{existing.InvoiceId}";
        var semaphore = ConcurrencyLocks.GetOrAdd(lockKey, _ => new SemaphoreSlim(1, 1));

        await semaphore.WaitAsync(cancellationToken);
        try
        {
            await _unitOfWork.BeginTransactionAsync();

            var creditNote = await _creditNoteRepository.GetByIdForUpdateAsync(id, tenantId, cancellationToken);
            if (creditNote == null)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail("Credit note not found.");
            }

            if (!creditNote.CanCancel())
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail($"Credit note in '{creditNote.Status}' status cannot be cancelled. Issued or refunded credit notes cannot be cancelled.");
            }

            creditNote.Status = "Cancelled";
            creditNote.RemainingRefundableAmount = 0m;
            creditNote.CancellationReason = request.Reason.Trim();
            creditNote.CancelledBy = userDisplayName;
            creditNote.CancelledAtUtc = DateTime.UtcNow;
            creditNote.UpdatedAtUtc = DateTime.UtcNow;
            creditNote.RowVersion = DateTime.UtcNow;

            var updated = await _creditNoteRepository.UpdateAsync(creditNote, cancellationToken);

            await _auditLogRepository.AddAsync(new AuditLog
            {
                TenantId = tenantId,
                EntityName = "CreditNote",
                EntityId = creditNote.Id.ToString(),
                Action = "Cancel",
                Changes = JsonSerializer.Serialize(new { Status = "Cancelled", CancelledBy = userDisplayName, Reason = creditNote.CancellationReason }),
                UserName = userDisplayName,
                Timestamp = DateTime.UtcNow
            }, cancellationToken);

            await _unitOfWork.CommitTransactionAsync();

            var invoice = await _invoiceRepository.GetByIdAsync(creditNote.InvoiceId, tenantId, cancellationToken);
            return ApiResponse<CreditNoteDetailDto>.Ok(MapToDetailDto(updated, invoice), "Credit note cancelled successfully.");
        }
        catch (Exception ex)
        {
            await _unitOfWork.RollbackTransactionAsync();
            return ApiResponse<CreditNoteDetailDto>.Fail($"Failed to cancel credit note: {ex.Message}");
        }
        finally
        {
            semaphore.Release();
        }
    }

    public async Task<ApiResponse<CreditNoteDetailDto>> ProcessRefundAsync(
        int tenantId,
        int id,
        ProcessRefundRequest request,
        string userDisplayName,
        List<string> userRoles,
        List<string> userPermissions,
        CancellationToken cancellationToken = default)
    {
        if (!IsUserAuthorizedForApproval(userRoles, userPermissions))
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("You do not have permission to process refunds.");
        }

        if (request == null || request.RefundAmount <= 0m)
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("Refund amount must be greater than zero.");
        }

        if (decimal.Round(request.RefundAmount, 2) != request.RefundAmount)
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("Refund amount cannot have more than two decimal places.");
        }

        if (string.IsNullOrWhiteSpace(request.PaymentMethod) || !AllowedRefundPaymentMethods.Contains(request.PaymentMethod.Trim()))
        {
            return ApiResponse<CreditNoteDetailDto>.Fail($"Invalid or unsupported refund payment method '{request.PaymentMethod}'.");
        }

        var lockKey = $"{tenantId}:CreditNoteRefund:{id}";
        var semaphore = ConcurrencyLocks.GetOrAdd(lockKey, _ => new SemaphoreSlim(1, 1));

        await semaphore.WaitAsync(cancellationToken);
        try
        {
            await _unitOfWork.BeginTransactionAsync();

            var creditNote = await _creditNoteRepository.GetByIdForUpdateAsync(id, tenantId, cancellationToken);
            if (creditNote == null)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail("Credit note not found.");
            }

            if (!creditNote.CanRefund())
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail($"Refund cannot be processed for credit note in '{creditNote.Status}' status. It must be 'Issued' or 'PartiallyRefunded' with a positive remaining refundable balance.");
            }

            var authoritativeRemainingRefundable = Math.Max(0m, Math.Round(creditNote.TotalAmount - creditNote.RefundedAmount, 2, MidpointRounding.AwayFromZero));
            var roundedRefund = Math.Round(request.RefundAmount, 2, MidpointRounding.AwayFromZero);
            if (roundedRefund > authoritativeRemainingRefundable)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail($"Refund amount ({roundedRefund:F2}) exceeds remaining refundable amount ({authoritativeRemainingRefundable:F2}).");
            }

            var normalizedRef = string.IsNullOrWhiteSpace(request.ReferenceNumber) ? null : request.ReferenceNumber.Trim();
            if (!string.IsNullOrWhiteSpace(normalizedRef))
            {
                var duplicateRefund = creditNote.Refunds.FirstOrDefault(r =>
                    !string.Equals(r.Status, CreditNoteRefund.RefundStatuses.Failed, StringComparison.OrdinalIgnoreCase) &&
                    string.Equals(r.ReferenceNumber, normalizedRef, StringComparison.OrdinalIgnoreCase));
                if (duplicateRefund != null)
                {
                    await _unitOfWork.RollbackTransactionAsync();
                    return ApiResponse<CreditNoteDetailDto>.Fail($"Duplicate refund detected: A refund with reference number '{normalizedRef}' has already been processed for this credit note.");
                }
            }

            if (request.SimulateProviderFailure ||
                (!string.IsNullOrWhiteSpace(normalizedRef) &&
                 (normalizedRef.StartsWith("FAIL-", StringComparison.OrdinalIgnoreCase) ||
                  normalizedRef.StartsWith("ERR-", StringComparison.OrdinalIgnoreCase))))
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail("Refund processing failed: Payment provider rejected or could not confirm the refund transaction.");
            }

            // Generate Refund Number
            var numberResult = await _numberGenerationService.GenerateNextNumberAsync(new GenerateNumberRequest
            {
                DocumentType = "Refund",
                TransactionDate = request.RefundDate ?? DateTime.UtcNow
            }, tenantId);

            var refundNumber = numberResult.Success && !string.IsNullOrWhiteSpace(numberResult.Data?.GeneratedNumber)
                ? numberResult.Data.GeneratedNumber
                : $"REF-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";

            var refundStatus = !string.IsNullOrWhiteSpace(normalizedRef)
                ? CreditNoteRefund.RefundStatuses.Completed
                : CreditNoteRefund.RefundStatuses.ManualVerification;

            var refund = new CreditNoteRefund
            {
                TenantId = tenantId,
                CreditNoteId = creditNote.Id,
                RefundNumber = refundNumber,
                RefundDate = request.RefundDate ?? DateTime.UtcNow,
                RefundAmount = roundedRefund,
                PaymentMethod = request.PaymentMethod.Trim(),
                ReferenceNumber = normalizedRef,
                Notes = request.Notes?.Trim(),
                Status = refundStatus,
                ProcessedBy = userDisplayName,
                CreatedAtUtc = DateTime.UtcNow
            };

            var savedRefund = await _creditNoteRepository.AddRefundAsync(refund, cancellationToken);
            if (creditNote.Refunds.All(r => r.Id != savedRefund.Id && r.RefundNumber != savedRefund.RefundNumber))
            {
                creditNote.Refunds.Add(savedRefund);
            }

            creditNote.RefundedAmount = Math.Round(creditNote.RefundedAmount + roundedRefund, 2, MidpointRounding.AwayFromZero);
            creditNote.RecalculateRefundableBalance();

            await _creditNoteRepository.UpdateAsync(creditNote, cancellationToken);

            await _auditLogRepository.AddAsync(new AuditLog
            {
                TenantId = tenantId,
                EntityName = "CreditNote",
                EntityId = savedRefund.Id.ToString(),
                Action = "ProcessRefund",
                Changes = JsonSerializer.Serialize(new
                {
                    CreditNoteId = creditNote.Id,
                    RefundNumber = savedRefund.RefundNumber,
                    RefundAmount = savedRefund.RefundAmount,
                    PaymentMethod = savedRefund.PaymentMethod,
                    ReferenceNumber = savedRefund.ReferenceNumber,
                    RefundStatus = savedRefund.Status,
                    NewCreditNoteStatus = creditNote.Status,
                    RemainingRefundable = creditNote.RemainingRefundableAmount
                }),
                UserName = userDisplayName,
                Timestamp = DateTime.UtcNow
            }, cancellationToken);

            await _unitOfWork.CommitTransactionAsync();

            var invoice = await _invoiceRepository.GetByIdAsync(creditNote.InvoiceId, tenantId, cancellationToken);
            var responseMessage = !string.IsNullOrWhiteSpace(normalizedRef)
                ? "Refund transaction recorded with reference number; actual bank credit is subject to payment provider / bank settlement confirmation."
                : "Refund recorded for manual verification; actual bank credit is subject to payment provider / bank confirmation.";

            return ApiResponse<CreditNoteDetailDto>.Ok(MapToDetailDto(creditNote, invoice), responseMessage);
        }
        catch (Exception ex)
        {
            await _unitOfWork.RollbackTransactionAsync();
            return ApiResponse<CreditNoteDetailDto>.Fail($"Failed to process refund: {ex.Message}");
        }
        finally
        {
            semaphore.Release();
        }
    }

    public async Task<ApiResponse<PagedResult<CreditNoteListItemDto>>> GetPagedCreditNotesAsync(
        int tenantId,
        CreditNoteFilterRequest filter,
        List<string> userRoles,
        int? restrictedCustomerId = null,
        CancellationToken cancellationToken = default)
    {
        var result = await _creditNoteRepository.GetPagedAsync(tenantId, filter ?? new CreditNoteFilterRequest(), restrictedCustomerId, cancellationToken);
        return ApiResponse<PagedResult<CreditNoteListItemDto>>.Ok(result);
    }

    public async Task<ApiResponse<CreditNoteDetailDto>> GetCreditNoteByIdAsync(
        int tenantId,
        int id,
        List<string> userRoles,
        int? restrictedCustomerId = null,
        CancellationToken cancellationToken = default)
    {
        var creditNote = await _creditNoteRepository.GetByIdAsync(id, tenantId, cancellationToken);
        if (creditNote == null)
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("Credit note not found.");
        }

        if (restrictedCustomerId.HasValue && creditNote.CustomerId != restrictedCustomerId.Value)
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("You are not authorized to view this credit note.");
        }

        var invoice = await _invoiceRepository.GetByIdAsync(creditNote.InvoiceId, tenantId, cancellationToken);
        return ApiResponse<CreditNoteDetailDto>.Ok(MapToDetailDto(creditNote, invoice));
    }

    private async Task<string?> ValidateExistingCreditNoteEligibilityAsync(
        CreditNote creditNote,
        Invoice invoice,
        int tenantId,
        CancellationToken cancellationToken)
    {
        var allInvoiceCredits = await _creditNoteRepository.GetByInvoiceIdAsync(invoice.Id, tenantId, cancellationToken);
        var issuedCredits = allInvoiceCredits.Where(c => c.Id != creditNote.Id && IsIssuedCredit(c)).ToList();
        var effectiveInvoiceItems = GetEffectiveInvoiceItems(invoice);
        var previouslyCreditedQuantities = GetPreviouslyCreditedQuantities(issuedCredits, effectiveInvoiceItems);

        foreach (var line in creditNote.Items)
        {
            var matchId = line.InvoiceItemId ?? (effectiveInvoiceItems.Count == 1 && effectiveInvoiceItems[0].Id == 0 ? 0 : -1);
            var sourceItem = effectiveInvoiceItems.FirstOrDefault(i => i.Id == matchId);
            if (sourceItem != null)
            {
                var prevQty = previouslyCreditedQuantities.GetValueOrDefault(sourceItem.Id);
                var remainingQty = Math.Max(0m, sourceItem.Quantity - prevQty);
                if (line.Quantity > remainingQty)
                {
                    return $"Credit quantity ({line.Quantity}) for '{sourceItem.Description}' exceeds remaining eligible quantity ({remainingQty}).";
                }
            }
        }

        var remainingCreditable = GetEffectiveRemainingCreditableAmount(invoice, issuedCredits);
        if (creditNote.TotalAmount > remainingCreditable + 0.50m)
        {
            return $"Credit note amount ({creditNote.TotalAmount:F2}) exceeds the invoice's remaining creditable amount ({remainingCreditable:F2}).";
        }

        return null;
    }

    private static bool IsSupportedCreditType(string? type) =>
        string.Equals(type, "Full", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(type, "Partial", StringComparison.OrdinalIgnoreCase);

    private static bool IsIssuedCredit(CreditNote creditNote) =>
        string.Equals(creditNote.Status, "Issued", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(creditNote.Status, "PartiallyRefunded", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(creditNote.Status, "Refunded", StringComparison.OrdinalIgnoreCase);

    private static bool IsInactiveCredit(CreditNote creditNote) =>
        string.Equals(creditNote.Status, "Cancelled", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(creditNote.Status, "Canceled", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(creditNote.Status, "Rejected", StringComparison.OrdinalIgnoreCase);

    private static bool IsTaxInclusiveType(string? taxType) =>
        !string.IsNullOrWhiteSpace(taxType) &&
        taxType.Contains("Inclusive", StringComparison.OrdinalIgnoreCase);

    private static bool IsInterStateTaxType(string? taxType) =>
        !string.IsNullOrWhiteSpace(taxType) &&
        (taxType.Contains("IGST", StringComparison.OrdinalIgnoreCase) ||
         taxType.Contains("INTER", StringComparison.OrdinalIgnoreCase));

    private static bool IsValidTaxRate(decimal taxRate, InvoiceItem? sourceItem = null)
    {
        if (taxRate < 0m || taxRate > 100m)
        {
            return false;
        }

        if (AllowedGstRates.Any(r => Math.Abs(r - taxRate) < 0.0001m))
        {
            return true;
        }

        // Allow synthetic derived rate on header-only invoices
        if (sourceItem != null && sourceItem.Id == 0 && Math.Abs((sourceItem.TaxRate ?? 0m) - taxRate) < 0.01m)
        {
            return true;
        }

        return false;
    }

    private static List<InvoiceItem> GetEffectiveInvoiceItems(Invoice invoice)
    {
        if (invoice.Items != null && invoice.Items.Count > 0)
        {
            return invoice.Items.ToList();
        }

        if (invoice.TotalAmount <= 0m)
        {
            return new List<InvoiceItem>();
        }

        var netSubtotal = Math.Max(0m, invoice.Subtotal - invoice.DiscountAmount);
        var effectiveTaxRate = netSubtotal > 0m && invoice.TaxAmount > 0m
            ? Math.Round(invoice.TaxAmount / netSubtotal * 100m, 2, MidpointRounding.AwayFromZero)
            : 0m;

        return new List<InvoiceItem>
        {
            new()
            {
                Id = 0,
                InvoiceId = invoice.Id,
                Description = $"Invoice {invoice.InvoiceNumber}",
                Quantity = 1m,
                UnitPrice = invoice.Subtotal > 0m ? invoice.Subtotal : invoice.TotalAmount,
                DiscountAmount = invoice.DiscountAmount,
                TaxType = "GST",
                TaxRate = effectiveTaxRate,
                TaxAmount = invoice.TaxAmount,
                TotalAmount = invoice.TotalAmount
            }
        };
    }

    private static decimal GetEffectiveRemainingCreditableAmount(Invoice invoice, IReadOnlyCollection<CreditNote> issuedCredits)
    {
        var issuedSum = issuedCredits.Sum(c => c.TotalAmount);
        var effectiveCredited = Math.Max(
            Math.Max(0m, Math.Round(invoice.CreditedAmount, 2, MidpointRounding.AwayFromZero)),
            Math.Max(0m, Math.Round(issuedSum, 2, MidpointRounding.AwayFromZero)));
        var total = Math.Max(0m, Math.Round(invoice.TotalAmount, 2, MidpointRounding.AwayFromZero));
        return Math.Max(0m, Math.Round(total - effectiveCredited, 2, MidpointRounding.AwayFromZero));
    }

    private static Dictionary<int, decimal> GetPreviouslyCreditedQuantities(
        IEnumerable<CreditNote> creditNotes,
        IReadOnlyList<InvoiceItem>? effectiveInvoiceItems = null)
    {
        var dict = creditNotes
            .SelectMany(creditNote => creditNote.Items)
            .Where(item => item.InvoiceItemId.HasValue)
            .GroupBy(item => item.InvoiceItemId!.Value)
            .ToDictionary(group => group.Key, group => group.Sum(item => item.Quantity));

        if (effectiveInvoiceItems != null && effectiveInvoiceItems.Count == 1 && effectiveInvoiceItems[0].Id == 0 && !dict.ContainsKey(0))
        {
            var unlinkedQty = creditNotes
                .SelectMany(creditNote => creditNote.Items)
                .Where(item => !item.InvoiceItemId.HasValue || item.InvoiceItemId.Value == 0)
                .Sum(item => item.Quantity);
            if (unlinkedQty > 0m)
            {
                dict[0] = unlinkedQty;
            }
        }

        return dict;
    }

    private static Dictionary<int, decimal> GetPreviouslyCreditedDiscounts(
        IEnumerable<CreditNote> issuedCredits,
        IReadOnlyList<InvoiceItem>? effectiveInvoiceItems = null)
    {
        var dict = issuedCredits
            .SelectMany(creditNote => creditNote.Items)
            .Where(item => item.InvoiceItemId.HasValue)
            .GroupBy(item => item.InvoiceItemId!.Value)
            .ToDictionary(group => group.Key, group => group.Sum(item => item.DiscountAmount));

        if (effectiveInvoiceItems != null && effectiveInvoiceItems.Count == 1 && effectiveInvoiceItems[0].Id == 0 && !dict.ContainsKey(0))
        {
            var unlinkedDiscount = issuedCredits
                .SelectMany(creditNote => creditNote.Items)
                .Where(item => !item.InvoiceItemId.HasValue || item.InvoiceItemId.Value == 0)
                .Sum(item => item.DiscountAmount);
            if (unlinkedDiscount > 0m)
            {
                dict[0] = unlinkedDiscount;
            }
        }

        return dict;
    }

    private static Dictionary<int, decimal> GetExtraInvoiceDiscountShares(Invoice invoice, IReadOnlyList<InvoiceItem> items)
    {
        var result = new Dictionary<int, decimal>();
        if (items.Count == 0 || invoice.DiscountAmount <= 0m)
        {
            return result;
        }

        var grossSum = items.Sum(i => Math.Max(0m, Math.Round(i.Quantity * i.UnitPrice, 2, MidpointRounding.AwayFromZero)));
        var lineDiscountsSum = items.Sum(i => Math.Max(0m, Math.Round(i.DiscountAmount, 2, MidpointRounding.AwayFromZero)));

        decimal extraInvoiceDiscount;
        if (lineDiscountsSum <= 0m)
        {
            extraInvoiceDiscount = Math.Max(0m, Math.Round(invoice.DiscountAmount, 2, MidpointRounding.AwayFromZero));
        }
        else
        {
            // Distinguish between:
            // Convention A (InvoiceService): invoice.DiscountAmount = lineDiscountsSum + extraInvoiceDiscount
            // Convention B (Separate header discount): invoice.DiscountAmount = extraInvoiceDiscount alone
            var subtractExtra = Math.Max(0m, Math.Round(invoice.DiscountAmount - lineDiscountsSum, 2, MidpointRounding.AwayFromZero));
            var netUnderConventionA = Math.Max(0m, grossSum - lineDiscountsSum - subtractExtra);
            var netUnderConventionB = Math.Max(0m, grossSum - lineDiscountsSum - invoice.DiscountAmount);

            var expectedTotalA = Math.Round(netUnderConventionA + invoice.TaxAmount + invoice.ChargesAmount + invoice.RoundingAmount, 2, MidpointRounding.AwayFromZero);
            var expectedTotalB = Math.Round(netUnderConventionB + invoice.TaxAmount + invoice.ChargesAmount + invoice.RoundingAmount, 2, MidpointRounding.AwayFromZero);

            if (netUnderConventionB >= 0m &&
                Math.Abs(expectedTotalB - invoice.TotalAmount) + 0.02m < Math.Abs(expectedTotalA - invoice.TotalAmount))
            {
                extraInvoiceDiscount = Math.Round(invoice.DiscountAmount, 2, MidpointRounding.AwayFromZero);
            }
            else
            {
                extraInvoiceDiscount = subtractExtra;
            }
        }

        if (extraInvoiceDiscount <= 0m)
        {
            return result;
        }

        var itemNets = items
            .Select(i => (Item: i, Net: Math.Max(0m, Math.Round(i.Quantity * i.UnitPrice - i.DiscountAmount, 2, MidpointRounding.AwayFromZero))))
            .ToList();
        var totalNet = itemNets.Sum(x => x.Net);
        if (totalNet <= 0m)
        {
            return result;
        }

        var cappedExtraDiscount = Math.Min(extraInvoiceDiscount, totalNet);
        decimal allocated = 0m;
        var lastPositiveIdx = itemNets.FindLastIndex(x => x.Net > 0m);

        for (int idx = 0; idx < itemNets.Count; idx++)
        {
            var (item, net) = itemNets[idx];
            if (net <= 0m)
            {
                result[item.Id] = 0m;
                continue;
            }

            decimal share;
            if (idx == lastPositiveIdx)
            {
                share = Math.Clamp(Math.Round(cappedExtraDiscount - allocated, 2, MidpointRounding.AwayFromZero), 0m, net);
            }
            else
            {
                share = Math.Clamp(Math.Round(cappedExtraDiscount * net / totalNet, 2, MidpointRounding.AwayFromZero), 0m, net);
                allocated += share;
            }
            result[item.Id] = share;
        }

        return result;
    }

    private static string? PopulateCreditNoteItems(
        CreditNote creditNote,
        Invoice invoice,
        IReadOnlyList<InvoiceItem> effectiveInvoiceItems,
        IReadOnlyCollection<CreateCreditNoteItemRequest> requestedItems,
        IReadOnlyDictionary<int, decimal> previouslyCreditedQuantities,
        IReadOnlyDictionary<int, decimal> activeReservedQuantities,
        IReadOnlyCollection<CreditNote> issuedCredits,
        decimal authoritativeRemaining)
    {
        var seenInvoiceItemIds = new HashSet<int>();
        var extraDiscountsByItemId = GetExtraInvoiceDiscountShares(invoice, effectiveInvoiceItems);
        var previouslyCreditedDiscounts = GetPreviouslyCreditedDiscounts(issuedCredits, effectiveInvoiceItems);

        var totalExtraDiscount = extraDiscountsByItemId.Values.Sum();
        var preExtraTaxSum = effectiveInvoiceItems.Sum(i =>
            IsTaxInclusiveType(i.TaxType)
                ? 0m
                : Math.Round(Math.Max(0m, i.Quantity * i.UnitPrice - i.DiscountAmount) * ((i.TaxRate ?? 0m) / 100m), 2, MidpointRounding.AwayFromZero));
        var postExtraTaxSum = effectiveInvoiceItems.Sum(i =>
        {
            var extra = extraDiscountsByItemId.GetValueOrDefault(i.Id, 0m);
            return IsTaxInclusiveType(i.TaxType)
                ? 0m
                : Math.Round(Math.Max(0m, i.Quantity * i.UnitPrice - i.DiscountAmount - extra) * ((i.TaxRate ?? 0m) / 100m), 2, MidpointRounding.AwayFromZero);
        });

        // Standard GST rule computes tax on the discounted taxable amount (after both line and invoice discounts).
        // Only use pre-extra-discount tax if the source invoice itself demonstrably computed tax before the extra discount.
        var taxComputedBeforeExtraDiscount = totalExtraDiscount > 0m &&
            Math.Abs(invoice.TaxAmount - postExtraTaxSum) > 0.05m &&
            Math.Abs(invoice.TaxAmount - preExtraTaxSum) <= 0.05m;

        decimal subtotal = 0m;
        decimal totalDiscount = 0m;
        decimal taxAmount = 0m;
        decimal totalCgst = 0m;
        decimal totalSgst = 0m;
        decimal totalIgst = 0m;
        decimal totalAmount = 0m;

        foreach (var requestedItem in requestedItems)
        {
            if (requestedItem.Quantity <= 0m)
            {
                return $"Quantity for '{requestedItem.Description}' must be greater than zero.";
            }

            if (requestedItem.UnitPrice < 0m)
            {
                return $"Unit price for '{requestedItem.Description}' cannot be negative.";
            }

            if (requestedItem.DiscountAmount < 0m)
            {
                return $"Discount amount for '{requestedItem.Description}' cannot be negative.";
            }

            if (requestedItem.TaxRate.HasValue && !IsValidTaxRate(requestedItem.TaxRate.Value))
            {
                return $"Invalid tax rate ({requestedItem.TaxRate.Value}%) for '{requestedItem.Description}'. Supported GST tax rates are 0%, 5%, 12%, 18%, and 28%.";
            }

            InvoiceItem? sourceItem = null;
            if (requestedItem.InvoiceItemId.HasValue)
            {
                sourceItem = effectiveInvoiceItems.FirstOrDefault(item => item.Id == requestedItem.InvoiceItemId.Value);
                if (sourceItem == null)
                {
                    return $"Invoice item with ID {requestedItem.InvoiceItemId.Value} was not found on this invoice.";
                }
            }
            else if (effectiveInvoiceItems.Count == 1 && effectiveInvoiceItems[0].Id == 0)
            {
                sourceItem = effectiveInvoiceItems[0];
            }
            else if (effectiveInvoiceItems.Count == 1)
            {
                sourceItem = effectiveInvoiceItems[0];
            }
            else
            {
                return $"A valid source InvoiceItemId is required for '{requestedItem.Description}'.";
            }

            if (!seenInvoiceItemIds.Add(sourceItem.Id))
            {
                return $"Invoice line '{sourceItem.Description}' can only be selected once.";
            }

            var previouslyCredited = previouslyCreditedQuantities.GetValueOrDefault(sourceItem.Id);
            var remainingQuantity = Math.Max(0m, sourceItem.Quantity - previouslyCredited);
            if (requestedItem.Quantity > remainingQuantity)
            {
                return $"Credit quantity ({requestedItem.Quantity}) for '{sourceItem.Description}' cannot exceed its remaining eligible quantity ({remainingQuantity}).";
            }

            var reservedByActive = activeReservedQuantities.GetValueOrDefault(sourceItem.Id);
            var remainingUnreservedQuantity = Math.Max(0m, sourceItem.Quantity - Math.Max(previouslyCredited, reservedByActive));
            if (requestedItem.Quantity > remainingUnreservedQuantity)
            {
                return $"Credit quantity ({requestedItem.Quantity}) for '{sourceItem.Description}' cannot exceed available unreserved quantity ({remainingUnreservedQuantity}) due to existing active credit notes.";
            }

            var unitPrice = sourceItem.UnitPrice;
            var originalQuantity = sourceItem.Quantity;
            var lineGross = Math.Round(requestedItem.Quantity * unitPrice, 2, MidpointRounding.AwayFromZero);

            var itemTotalLineDiscount = Math.Max(0m, sourceItem.DiscountAmount);
            var itemTotalExtraDiscount = extraDiscountsByItemId.GetValueOrDefault(sourceItem.Id);
            var itemCombinedDiscount = Math.Min(
                Math.Round(originalQuantity * unitPrice, 2, MidpointRounding.AwayFromZero),
                Math.Round(itemTotalLineDiscount + itemTotalExtraDiscount, 2, MidpointRounding.AwayFromZero));

            var prevDiscountForItem = previouslyCreditedDiscounts.GetValueOrDefault(sourceItem.Id);
            var remainingItemDiscount = Math.Max(0m, Math.Round(itemCombinedDiscount - prevDiscountForItem, 2, MidpointRounding.AwayFromZero));

            decimal lineOnlyDiscount;
            decimal extraDiscountShare;
            decimal discount;

            if (originalQuantity > 0m)
            {
                lineOnlyDiscount = Math.Round(itemTotalLineDiscount * requestedItem.Quantity / originalQuantity, 2, MidpointRounding.AwayFromZero);
                extraDiscountShare = Math.Round(itemTotalExtraDiscount * requestedItem.Quantity / originalQuantity, 2, MidpointRounding.AwayFromZero);

                if (requestedItem.Quantity == remainingQuantity && previouslyCredited > 0m)
                {
                    discount = Math.Min(lineGross, remainingItemDiscount);
                    extraDiscountShare = Math.Max(0m, Math.Round(discount - lineOnlyDiscount, 2, MidpointRounding.AwayFromZero));
                }
                else
                {
                    discount = Math.Min(lineGross, Math.Min(remainingItemDiscount, Math.Round(lineOnlyDiscount + extraDiscountShare, 2, MidpointRounding.AwayFromZero)));
                }
            }
            else
            {
                lineOnlyDiscount = 0m;
                extraDiscountShare = 0m;
                discount = 0m;
            }

            var taxType = !string.IsNullOrWhiteSpace(sourceItem.TaxType) ? sourceItem.TaxType : (requestedItem.TaxType ?? "GST");
            var taxRate = sourceItem.TaxRate ?? requestedItem.TaxRate ?? 0m;
            if (!IsValidTaxRate(taxRate, sourceItem))
            {
                return $"Invalid tax rate ({taxRate}%) on invoice item '{sourceItem.Description}'. Supported GST tax rates are 0%, 5%, 12%, 18%, and 28%.";
            }

            var isTaxInclusive = IsTaxInclusiveType(taxType);
            var isInterState = IsInterStateTaxType(taxType) || IsInterStateTaxType(requestedItem.TaxType);

            decimal lineSubtotal;
            decimal lineTax;
            decimal lineTotal;

            if (isTaxInclusive)
            {
                var netInclusive = Math.Max(0m, Math.Round(lineGross - discount, 2, MidpointRounding.AwayFromZero));
                var baseAmount = taxRate > 0m
                    ? Math.Round(netInclusive / (1m + (taxRate / 100m)), 2, MidpointRounding.AwayFromZero)
                    : netInclusive;
                lineTax = taxRate > 0m
                    ? Math.Max(0m, Math.Round(netInclusive - baseAmount, 2, MidpointRounding.AwayFromZero))
                    : 0m;
                lineSubtotal = Math.Max(0m, Math.Round(netInclusive - lineTax, 2, MidpointRounding.AwayFromZero));
                lineTotal = netInclusive;
            }
            else
            {
                lineSubtotal = Math.Max(0m, Math.Round(lineGross - discount, 2, MidpointRounding.AwayFromZero));
                var taxableBase = extraDiscountShare > 0m && taxComputedBeforeExtraDiscount
                    ? Math.Max(0m, Math.Round(lineGross - lineOnlyDiscount, 2, MidpointRounding.AwayFromZero))
                    : lineSubtotal;
                lineTax = Math.Round(taxableBase * (taxRate / 100m), 2, MidpointRounding.AwayFromZero);
                lineTotal = Math.Round(lineSubtotal + lineTax, 2, MidpointRounding.AwayFromZero);
            }

            decimal lineCgst;
            decimal lineSgst;
            decimal lineIgst;
            if (isInterState)
            {
                lineCgst = 0m;
                lineSgst = 0m;
                lineIgst = lineTax;
            }
            else
            {
                lineCgst = Math.Round(lineTax / 2m, 2, MidpointRounding.AwayFromZero);
                lineSgst = Math.Round(lineTax - lineCgst, 2, MidpointRounding.AwayFromZero);
                lineIgst = 0m;
            }

            subtotal = Math.Round(subtotal + lineSubtotal, 2, MidpointRounding.AwayFromZero);
            totalDiscount = Math.Round(totalDiscount + discount, 2, MidpointRounding.AwayFromZero);
            taxAmount = Math.Round(taxAmount + lineTax, 2, MidpointRounding.AwayFromZero);
            totalCgst = Math.Round(totalCgst + lineCgst, 2, MidpointRounding.AwayFromZero);
            totalSgst = Math.Round(totalSgst + lineSgst, 2, MidpointRounding.AwayFromZero);
            totalIgst = Math.Round(totalIgst + lineIgst, 2, MidpointRounding.AwayFromZero);
            totalAmount = Math.Round(totalAmount + lineTotal, 2, MidpointRounding.AwayFromZero);

            creditNote.Items.Add(new CreditNoteItem
            {
                CreditNoteId = creditNote.Id,
                InvoiceItemId = sourceItem.Id == 0 ? null : sourceItem.Id,
                ProductId = sourceItem.ProductId ?? requestedItem.ProductId,
                Description = !string.IsNullOrWhiteSpace(sourceItem.Description) ? sourceItem.Description : requestedItem.Description,
                Quantity = requestedItem.Quantity,
                UnitPrice = unitPrice,
                DiscountAmount = discount,
                TaxableAmount = lineSubtotal,
                TaxType = taxType,
                TaxRate = taxRate,
                TaxAmount = lineTax,
                CgstAmount = lineCgst,
                SgstAmount = lineSgst,
                IgstAmount = lineIgst,
                IsTaxInclusive = isTaxInclusive,
                TotalAmount = lineTotal,
                HSNSAC = sourceItem.HSNSAC ?? requestedItem.HSNSAC
            });
        }

        creditNote.Subtotal = subtotal;
        creditNote.DiscountAmount = totalDiscount;
        creditNote.TaxAmount = taxAmount;
        creditNote.CgstAmount = totalCgst;
        creditNote.SgstAmount = totalSgst;
        creditNote.IgstAmount = totalIgst;
        creditNote.RoundingAmount = 0m;
        creditNote.TotalAmount = totalAmount;

        // Reconcile invoice-level rounding differences at the credit note header level
        // WITHOUT mutating individual item TotalAmounts (preserving item-level Subtotal + Tax == Total consistency).
        if (creditNote.Items.Count > 0 && authoritativeRemaining > 0m)
        {
            var remainingLineIds = effectiveInvoiceItems
                .Where(item => item.Quantity - previouslyCreditedQuantities.GetValueOrDefault(item.Id) > 0m)
                .Select(item => item.Id)
                .ToHashSet();

            var fullySelected = remainingLineIds.Count > 0 &&
                remainingLineIds.Count == creditNote.Items.Count &&
                creditNote.Items.All(item =>
                {
                    var matchId = item.InvoiceItemId ?? (effectiveInvoiceItems.Count == 1 && effectiveInvoiceItems[0].Id == 0 ? 0 : -1);
                    var source = effectiveInvoiceItems.FirstOrDefault(invoiceItem => invoiceItem.Id == matchId);
                    return source != null && item.Quantity == source.Quantity - previouslyCreditedQuantities.GetValueOrDefault(source.Id);
                });

            var adjustment = Math.Round(authoritativeRemaining - creditNote.TotalAmount, 2, MidpointRounding.AwayFromZero);
            var maxFullAdjustment = Math.Max(1.00m, Math.Abs(invoice.RoundingAmount) + invoice.ChargesAmount + 0.50m);

            if (fullySelected && adjustment != 0m && Math.Abs(adjustment) <= maxFullAdjustment)
            {
                creditNote.RoundingAmount = adjustment;
                creditNote.TotalAmount = authoritativeRemaining;
            }
            else if (!fullySelected && adjustment < 0m && Math.Abs(adjustment) <= 0.50m)
            {
                creditNote.RoundingAmount = adjustment;
                creditNote.TotalAmount = authoritativeRemaining;
            }
        }

        return null;
    }

    public async Task<ApiResponse<InvoiceCreditableSummaryDto>> GetInvoiceCreditableSummaryAsync(
        int tenantId,
        int invoiceId,
        List<string> userRoles,
        int? restrictedCustomerId = null,
        CancellationToken cancellationToken = default)
    {
        var invoice = await _invoiceRepository.GetByIdAsync(invoiceId, tenantId, cancellationToken);
        if (invoice == null)
        {
            return ApiResponse<InvoiceCreditableSummaryDto>.Fail("Invoice not found.");
        }

        if (restrictedCustomerId.HasValue && invoice.CustomerId != restrictedCustomerId.Value)
        {
            return ApiResponse<InvoiceCreditableSummaryDto>.Fail("You are not authorized to view this invoice.");
        }

        var customer = await _customerRepository.GetByIdAsync(invoice.CustomerId, tenantId);
        var isEligible = invoice.IsEligibleForCredit(out var reason);

        // Fetch existing credit notes for line-item calculations
        var existingCredits = await _creditNoteRepository.GetByInvoiceIdAsync(invoiceId, tenantId, cancellationToken);
        var issuedCredits = existingCredits.Where(IsIssuedCredit).ToList();
        var effectiveInvoiceItems = GetEffectiveInvoiceItems(invoice);
        var extraDiscountsByItemId = GetExtraInvoiceDiscountShares(invoice, effectiveInvoiceItems);
        var remainingCreditable = GetEffectiveRemainingCreditableAmount(invoice, issuedCredits);
        var issuedCreditedSum = issuedCredits.Sum(c => c.TotalAmount);
        var effectiveCreditedAmount = Math.Max(invoice.CreditedAmount, issuedCreditedSum);

        if (remainingCreditable <= 0m && isEligible)
        {
            isEligible = false;
            reason = $"Invoice '{invoice.InvoiceNumber}' has already been fully credited.";
        }

        var summary = new InvoiceCreditableSummaryDto
        {
            InvoiceId = invoice.Id,
            InvoiceNumber = invoice.InvoiceNumber,
            CustomerId = invoice.CustomerId,
            CustomerName = customer != null ? (customer.CompanyName ?? customer.Name) : "Unknown Customer",
            Currency = invoice.GetCurrency(),
            InvoiceDate = invoice.InvoiceDate,
            InvoiceStatus = invoice.Status,
            Subtotal = invoice.Subtotal,
            DiscountAmount = invoice.DiscountAmount,
            TaxAmount = invoice.TaxAmount,
            TotalAmount = invoice.TotalAmount,
            PaidAmount = invoice.PaidAmount,
            CreditedAmount = effectiveCreditedAmount,
            BalanceAmount = invoice.GetEffectiveBalance(),
            RemainingCreditableAmount = remainingCreditable,
            IsEligibleForCredit = isEligible,
            IneligibilityReason = reason
        };

        foreach (var item in effectiveInvoiceItems)
        {
            var previouslyCreditedQty = issuedCredits.SelectMany(c => c.Items)
                .Where(ci => ci.InvoiceItemId == item.Id || (item.Id == 0 && !ci.InvoiceItemId.HasValue))
                .Sum(ci => ci.Quantity);

            var previouslyCreditedAmt = issuedCredits.SelectMany(c => c.Items)
                .Where(ci => ci.InvoiceItemId == item.Id || (item.Id == 0 && !ci.InvoiceItemId.HasValue))
                .Sum(ci => ci.TotalAmount);

            var extraDiscount = extraDiscountsByItemId.GetValueOrDefault(item.Id);
            var effectiveItemDiscount = Math.Round(item.DiscountAmount + extraDiscount, 2, MidpointRounding.AwayFromZero);
            var effectiveItemTotal = Math.Max(0m, Math.Round(item.TotalAmount - extraDiscount, 2, MidpointRounding.AwayFromZero));

            summary.Items.Add(new InvoiceCreditableLineItemDto
            {
                InvoiceItemId = item.Id,
                ProductId = item.ProductId,
                Description = item.Description,
                OriginalQuantity = item.Quantity,
                PreviouslyCreditedQuantity = previouslyCreditedQty,
                RemainingEligibleQuantity = Math.Max(0m, item.Quantity - previouslyCreditedQty),
                UnitPrice = item.UnitPrice,
                DiscountAmount = effectiveItemDiscount,
                TaxType = item.TaxType,
                TaxRate = item.TaxRate,
                TaxAmount = item.TaxAmount,
                TotalAmount = effectiveItemTotal,
                PreviouslyCreditedAmount = previouslyCreditedAmt,
                RemainingEligibleAmount = Math.Max(0m, effectiveItemTotal - previouslyCreditedAmt),
                HSNSAC = item.HSNSAC
            });
        }

        return ApiResponse<InvoiceCreditableSummaryDto>.Ok(summary);
    }

    private static bool IsUserAuthorizedForApproval(List<string>? userRoles, List<string>? userPermissions)
    {
        if (userRoles != null && userRoles.Any(r => ApprovalAuthorizedRoles.Contains(r)))
        {
            return true;
        }

        if (userPermissions != null && userPermissions.Any(p => ApprovalAuthorizedPermissions.Contains(p)))
        {
            return true;
        }

        return false;
    }

    private static bool IsUserAuthorizedForCreateOrEdit(List<string>? userRoles, List<string>? userPermissions, int? restrictedCustomerId)
    {
        if (restrictedCustomerId.HasValue && restrictedCustomerId.Value == -1)
        {
            return false;
        }

        if (userRoles != null && userRoles.Any(r => CreateOrEditAuthorizedRoles.Contains(r)))
        {
            return true;
        }

        if (userPermissions != null && userPermissions.Any(p => CreateOrEditAuthorizedPermissions.Contains(p)))
        {
            return true;
        }

        return false;
    }

    private static bool IsSelfApprovalBlocked(string? createdBy, string? actorDisplayName, List<string>? userRoles)
    {
        if (string.IsNullOrWhiteSpace(createdBy) || string.IsNullOrWhiteSpace(actorDisplayName))
        {
            return false;
        }

        if (!string.Equals(createdBy.Trim(), actorDisplayName.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        if (userRoles != null && userRoles.Any(r => string.Equals(r, "SuperAdmin", StringComparison.OrdinalIgnoreCase)))
        {
            return false;
        }

        return true;
    }

    private static CreditNoteDetailDto MapToDetailDto(CreditNote cn, Invoice? inv)
    {
        var items = cn.Items.Select(i =>
        {
            var isInterState = IsInterStateTaxType(i.TaxType);
            var cgst = i.CgstAmount > 0m || isInterState ? i.CgstAmount : Math.Round(i.TaxAmount / 2m, 2, MidpointRounding.AwayFromZero);
            var sgst = i.SgstAmount > 0m || isInterState ? i.SgstAmount : Math.Round(i.TaxAmount - cgst, 2, MidpointRounding.AwayFromZero);
            var igst = i.IgstAmount > 0m || !isInterState ? i.IgstAmount : i.TaxAmount;
            var isInclusive = i.IsTaxInclusive || IsTaxInclusiveType(i.TaxType);
            var taxable = i.TaxableAmount > 0m
                ? i.TaxableAmount
                : (isInclusive
                    ? Math.Max(0m, Math.Round(i.TotalAmount - i.TaxAmount, 2, MidpointRounding.AwayFromZero))
                    : Math.Max(0m, Math.Round(i.Quantity * i.UnitPrice - i.DiscountAmount, 2, MidpointRounding.AwayFromZero)));

            return new CreditNoteItemDto
            {
                Id = i.Id,
                InvoiceItemId = i.InvoiceItemId,
                ProductId = i.ProductId,
                Description = i.Description,
                Quantity = i.Quantity,
                UnitPrice = i.UnitPrice,
                DiscountAmount = i.DiscountAmount,
                TaxableAmount = taxable,
                TaxType = i.TaxType,
                TaxRate = i.TaxRate,
                TaxAmount = i.TaxAmount,
                CgstAmount = cgst,
                SgstAmount = sgst,
                IgstAmount = igst,
                IsTaxInclusive = isInclusive,
                TotalAmount = i.TotalAmount,
                HSNSAC = i.HSNSAC
            };
        }).ToList();

        var totalDiscount = cn.DiscountAmount > 0m ? cn.DiscountAmount : items.Sum(x => x.DiscountAmount);
        var totalCgst = cn.CgstAmount > 0m ? cn.CgstAmount : items.Sum(x => x.CgstAmount);
        var totalSgst = cn.SgstAmount > 0m ? cn.SgstAmount : items.Sum(x => x.SgstAmount);
        var totalIgst = cn.IgstAmount > 0m ? cn.IgstAmount : items.Sum(x => x.IgstAmount);
        var rawTotal = Math.Round(cn.Subtotal + cn.TaxAmount, 2, MidpointRounding.AwayFromZero);
        var rounding = cn.RoundingAmount != 0m ? cn.RoundingAmount : Math.Round(cn.TotalAmount - rawTotal, 2, MidpointRounding.AwayFromZero);
        var remainingRefundable = IsIssuedCredit(cn)
            ? Math.Max(0m, Math.Round(cn.TotalAmount - cn.RefundedAmount, 2, MidpointRounding.AwayFromZero))
            : 0m;

        return new CreditNoteDetailDto
        {
            Id = cn.Id,
            TenantId = cn.TenantId,
            CreditNoteNumber = cn.CreditNoteNumber,
            InvoiceId = cn.InvoiceId,
            InvoiceNumber = inv?.InvoiceNumber ?? cn.Invoice?.InvoiceNumber ?? string.Empty,
            CustomerId = cn.CustomerId,
            CustomerName = inv?.Customer != null
                ? (inv.Customer.CompanyName ?? inv.Customer.Name)
                : (cn.Customer != null ? (cn.Customer.CompanyName ?? cn.Customer.Name) : string.Empty),
            CreditDate = cn.CreditDate,
            Type = cn.Type,
            Subtotal = cn.Subtotal,
            DiscountAmount = totalDiscount,
            TaxAmount = cn.TaxAmount,
            CgstAmount = totalCgst,
            SgstAmount = totalSgst,
            IgstAmount = totalIgst,
            RoundingAmount = rounding,
            TotalAmount = cn.TotalAmount,
            RefundedAmount = cn.RefundedAmount,
            RemainingRefundableAmount = remainingRefundable,
            Status = cn.Status,
            Reason = cn.Reason,
            Notes = cn.Notes,
            Currency = inv?.GetCurrency() ?? "INR",

            InvoiceTotalAmount = inv?.TotalAmount ?? 0m,
            InvoicePaidAmount = inv?.PaidAmount ?? 0m,
            InvoiceCreditedAmount = inv?.CreditedAmount ?? 0m,
            InvoiceBalanceAmount = inv?.GetEffectiveBalance() ?? 0m,
            InvoiceRemainingCreditableAmount = inv?.GetRemainingCreditableAmount() ?? 0m,
            InvoiceStatus = inv?.Status ?? string.Empty,

            CreatedBy = cn.CreatedBy,
            CreatedAtUtc = cn.CreatedAtUtc,
            ApprovedBy = cn.ApprovedBy,
            ApprovedAtUtc = cn.ApprovedAtUtc,
            RejectionReason = cn.RejectionReason,
            RejectedBy = cn.RejectedBy,
            RejectedAtUtc = cn.RejectedAtUtc,
            IssuedBy = cn.IssuedBy,
            IssuedAtUtc = cn.IssuedAtUtc,
            CancelledBy = cn.CancelledBy,
            CancelledAtUtc = cn.CancelledAtUtc,
            CancellationReason = cn.CancellationReason,
            UpdatedAtUtc = cn.UpdatedAtUtc,

            Items = items,

            Refunds = cn.Refunds.Select(r => new CreditNoteRefundDto
            {
                Id = r.Id,
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
            }).ToList()
        };
    }
}
