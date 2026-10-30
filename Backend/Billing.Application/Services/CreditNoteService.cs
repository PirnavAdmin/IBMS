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

        var invoice = await _invoiceRepository.GetByIdAsync(request.InvoiceId, tenantId, cancellationToken);
        if (invoice == null)
        {
            return ApiResponse<CreditNoteDetailDto>.Fail($"Invoice with ID {request.InvoiceId} was not found for this tenant.");
        }

        if (restrictedCustomerId.HasValue && invoice.CustomerId != restrictedCustomerId.Value)
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("You are not authorized to create credit notes against this invoice.");
        }

        if (!invoice.IsEligibleForCredit(out var ineligibilityReason))
        {
            return ApiResponse<CreditNoteDetailDto>.Fail(ineligibilityReason ?? "Invoice is not eligible for credit note.");
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
            Type = string.Equals(request.Type, "Partial", StringComparison.OrdinalIgnoreCase) ? "Partial" : "Full",
            Reason = request.Reason.Trim(),
            Notes = request.Notes?.Trim(),
            Status = "Draft",
            CreatedBy = userDisplayName,
            CreatedAtUtc = DateTime.UtcNow,
            RowVersion = DateTime.UtcNow
        };

        var invoiceCredits = await _creditNoteRepository.GetByInvoiceIdAsync(invoice.Id, tenantId, cancellationToken);
        var issuedCredits = invoiceCredits.Where(IsIssuedCredit).ToList();
        var effectiveInvoiceItems = GetEffectiveInvoiceItems(invoice);

        var previouslyCreditedQuantities = GetPreviouslyCreditedQuantities(issuedCredits, effectiveInvoiceItems);
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
                return ApiResponse<CreditNoteDetailDto>.Fail("Full credit must include every remaining eligible invoice line at its remaining quantity.");
            }
        }
        else if (requestedItems.Count == 0)
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("At least one line item must be selected for partial credit.");
        }

        var remainingCreditable = GetEffectiveRemainingCreditableAmount(invoice, issuedCredits);
        var calculationError = PopulateCreditNoteItems(creditNote, invoice, effectiveInvoiceItems, requestedItems, previouslyCreditedQuantities, remainingCreditable);
        if (calculationError != null)
            return ApiResponse<CreditNoteDetailDto>.Fail(calculationError);

        if (creditNote.TotalAmount > remainingCreditable)
        {
            return ApiResponse<CreditNoteDetailDto>.Fail($"Total credit amount ({creditNote.TotalAmount:F2}) cannot exceed remaining eligible creditable amount ({remainingCreditable:F2}).");
        }

        creditNote.RemainingRefundableAmount = creditNote.TotalAmount;

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
                TotalAmount = savedCreditNote.TotalAmount,
                Type = savedCreditNote.Type,
                Reason = savedCreditNote.Reason
            }),
            UserName = userDisplayName,
            Timestamp = DateTime.UtcNow
        });

        return ApiResponse<CreditNoteDetailDto>.Ok(MapToDetailDto(savedCreditNote, invoice), "Credit Note draft created successfully.");
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
        var creditNote = await _creditNoteRepository.GetByIdForUpdateAsync(id, tenantId, cancellationToken);
        if (creditNote == null)
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("Credit note not found.");
        }

        if (restrictedCustomerId.HasValue && creditNote.CustomerId != restrictedCustomerId.Value)
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("You are not authorized to edit this credit note.");
        }

        if (!creditNote.CanEdit())
        {
            return ApiResponse<CreditNoteDetailDto>.Fail($"Credit note cannot be edited in '{creditNote.Status}' status.");
        }

        var invoice = await _invoiceRepository.GetByIdAsync(creditNote.InvoiceId, tenantId, cancellationToken);
        if (invoice == null)
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("Associated invoice not found.");
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
        var issuedCredits = invoiceCredits.Where(IsIssuedCredit).ToList();
        var effectiveInvoiceItems = GetEffectiveInvoiceItems(invoice);

        var previouslyCreditedQuantities = GetPreviouslyCreditedQuantities(issuedCredits, effectiveInvoiceItems);
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
                return ApiResponse<CreditNoteDetailDto>.Fail("Full credit must include every remaining eligible invoice line at its remaining quantity.");
            }
        }
        else if (requestedItems.Count == 0)
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("At least one line item must be selected for partial credit.");
        }

        var remainingCreditable = GetEffectiveRemainingCreditableAmount(invoice, issuedCredits);
        var calculationError = PopulateCreditNoteItems(creditNote, invoice, effectiveInvoiceItems, requestedItems, previouslyCreditedQuantities, remainingCreditable);
        if (calculationError != null)
            return ApiResponse<CreditNoteDetailDto>.Fail(calculationError);

        if (creditNote.TotalAmount > remainingCreditable)
        {
            return ApiResponse<CreditNoteDetailDto>.Fail($"Total credit amount ({creditNote.TotalAmount:F2}) cannot exceed remaining eligible creditable amount ({remainingCreditable:F2}).");
        }

        creditNote.RemainingRefundableAmount = creditNote.TotalAmount;
        creditNote.UpdatedAtUtc = DateTime.UtcNow;
        creditNote.RowVersion = DateTime.UtcNow;

        var updated = await _creditNoteRepository.UpdateAsync(creditNote, cancellationToken);
        return ApiResponse<CreditNoteDetailDto>.Ok(MapToDetailDto(updated, invoice), "Credit note draft updated successfully.");
    }

    public async Task<ApiResponse<CreditNoteDetailDto>> SubmitForApprovalAsync(
        int tenantId,
        int id,
        string userDisplayName,
        List<string> userRoles,
        List<string> userPermissions,
        CancellationToken cancellationToken = default)
    {
        var creditNote = await _creditNoteRepository.GetByIdForUpdateAsync(id, tenantId, cancellationToken);
        if (creditNote == null)
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("Credit note not found.");
        }

        if (!creditNote.CanSubmit())
        {
            return ApiResponse<CreditNoteDetailDto>.Fail($"Credit note in '{creditNote.Status}' status cannot be submitted for approval.");
        }

        if (string.IsNullOrWhiteSpace(creditNote.Reason))
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("A valid credit reason is mandatory before submitting.");
        }

        if (creditNote.TotalAmount <= 0)
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("Credit note total amount must be greater than zero.");
        }

        creditNote.Status = "PendingApproval";
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
        });

        var invoice = await _invoiceRepository.GetByIdAsync(creditNote.InvoiceId, tenantId, cancellationToken);
        return ApiResponse<CreditNoteDetailDto>.Ok(MapToDetailDto(updated, invoice), "Credit note submitted for approval successfully.");
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

        var creditNote = await _creditNoteRepository.GetByIdForUpdateAsync(id, tenantId, cancellationToken);
        if (creditNote == null)
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("Credit note not found.");
        }

        if (!creditNote.CanApproveOrReject())
        {
            return ApiResponse<CreditNoteDetailDto>.Fail($"Credit note in '{creditNote.Status}' status cannot be approved. Only 'PendingApproval' credit notes can be approved.");
        }

        creditNote.Status = "Approved";
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
        });

        var invoice = await _invoiceRepository.GetByIdAsync(creditNote.InvoiceId, tenantId, cancellationToken);
        return ApiResponse<CreditNoteDetailDto>.Ok(MapToDetailDto(updated, invoice), "Credit note approved successfully.");
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

        var creditNote = await _creditNoteRepository.GetByIdForUpdateAsync(id, tenantId, cancellationToken);
        if (creditNote == null)
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("Credit note not found.");
        }

        if (!creditNote.CanApproveOrReject())
        {
            return ApiResponse<CreditNoteDetailDto>.Fail($"Credit note in '{creditNote.Status}' status cannot be rejected.");
        }

        creditNote.Status = "Rejected";
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
        });

        var invoice = await _invoiceRepository.GetByIdAsync(creditNote.InvoiceId, tenantId, cancellationToken);
        return ApiResponse<CreditNoteDetailDto>.Ok(MapToDetailDto(updated, invoice), "Credit note rejected.");
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

        var lockKey = $"{tenantId}:CreditNoteIssue:{id}";
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

            var invoice = await _invoiceRepository.GetByIdForUpdateAsync(creditNote.InvoiceId, tenantId);
            if (invoice == null)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail("Invoice associated with credit note was not found.");
            }

            // Calculate existing issued credits for this invoice
            var currentIssuedCredits = await _creditNoteRepository.GetTotalIssuedCreditsForInvoiceAsync(invoice.Id, tenantId, cancellationToken);
            var remainingCreditable = Math.Max(0m, Math.Round(invoice.TotalAmount - currentIssuedCredits, 2, MidpointRounding.AwayFromZero));

            if (creditNote.TotalAmount > remainingCreditable)
            {
                if (remainingCreditable > 0m && (creditNote.TotalAmount - remainingCreditable) <= 0.50m && creditNote.Items.Count > 0)
                {
                    var roundingDiff = Math.Round(remainingCreditable - creditNote.TotalAmount, 2, MidpointRounding.AwayFromZero);
                    var lastItem = creditNote.Items.Last();
                    lastItem.TotalAmount = Math.Round(lastItem.TotalAmount + roundingDiff, 2, MidpointRounding.AwayFromZero);
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
            creditNote.RemainingRefundableAmount = creditNote.TotalAmount;

            await _creditNoteRepository.UpdateAsync(creditNote, cancellationToken);

            // Update invoice balances and status
            var newTotalIssuedCredits = currentIssuedCredits + creditNote.TotalAmount;
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
                    InvoiceNewBalance = invoice.BalanceAmount,
                    InvoiceNewStatus = invoice.Status
                }),
                UserName = userDisplayName,
                Timestamp = DateTime.UtcNow
            });

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
        if (request == null || string.IsNullOrWhiteSpace(request.Reason))
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("Cancellation reason is required.");
        }

        var creditNote = await _creditNoteRepository.GetByIdForUpdateAsync(id, tenantId, cancellationToken);
        if (creditNote == null)
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("Credit note not found.");
        }

        if (!creditNote.CanCancel())
        {
            return ApiResponse<CreditNoteDetailDto>.Fail($"Credit note in '{creditNote.Status}' status cannot be cancelled. Issued or refunded credit notes cannot be cancelled.");
        }

        creditNote.Status = "Cancelled";
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
        });

        var invoice = await _invoiceRepository.GetByIdAsync(creditNote.InvoiceId, tenantId, cancellationToken);
        return ApiResponse<CreditNoteDetailDto>.Ok(MapToDetailDto(updated, invoice), "Credit note cancelled successfully.");
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

        if (request == null || request.RefundAmount <= 0)
        {
            return ApiResponse<CreditNoteDetailDto>.Fail("Refund amount must be greater than zero.");
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
                return ApiResponse<CreditNoteDetailDto>.Fail($"Refund cannot be processed for credit note in '{creditNote.Status}' status. It must be 'Issued' or 'PartiallyRefunded'.");
            }

            var roundedRefund = Math.Round(request.RefundAmount, 2, MidpointRounding.AwayFromZero);
            if (roundedRefund > creditNote.RemainingRefundableAmount)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail($"Refund amount ({roundedRefund:F2}) exceeds remaining refundable amount ({creditNote.RemainingRefundableAmount:F2}).");
            }

            // Generate Refund Number
            var refundNumber = $"REF-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";

            var refund = new CreditNoteRefund
            {
                TenantId = tenantId,
                CreditNoteId = creditNote.Id,
                RefundNumber = refundNumber,
                RefundDate = DateTime.UtcNow,
                RefundAmount = roundedRefund,
                PaymentMethod = request.PaymentMethod,
                ReferenceNumber = request.ReferenceNumber?.Trim(),
                Notes = request.Notes?.Trim(),
                ProcessedBy = userDisplayName,
                CreatedAtUtc = DateTime.UtcNow
            };

            await _creditNoteRepository.AddRefundAsync(refund, cancellationToken);
            creditNote.Refunds.Add(refund);

            creditNote.RefundedAmount = Math.Round(creditNote.RefundedAmount + roundedRefund, 2, MidpointRounding.AwayFromZero);
            creditNote.RecalculateRefundableBalance();

            await _creditNoteRepository.UpdateAsync(creditNote, cancellationToken);

            await _auditLogRepository.AddAsync(new AuditLog
            {
                TenantId = tenantId,
                EntityName = "CreditNote",
                EntityId = refund.Id.ToString(),
                Action = "ProcessRefund",
                Changes = JsonSerializer.Serialize(new
                {
                    CreditNoteId = creditNote.Id,
                    RefundNumber = refund.RefundNumber,
                    RefundAmount = refund.RefundAmount,
                    PaymentMethod = refund.PaymentMethod,
                    NewCreditNoteStatus = creditNote.Status,
                    RemainingRefundable = creditNote.RemainingRefundableAmount
                }),
                UserName = userDisplayName,
                Timestamp = DateTime.UtcNow
            });

            await _unitOfWork.CommitTransactionAsync();

            var invoice = await _invoiceRepository.GetByIdAsync(creditNote.InvoiceId, tenantId, cancellationToken);
            return ApiResponse<CreditNoteDetailDto>.Ok(MapToDetailDto(creditNote, invoice), "Refund processed successfully.");
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

    private static bool IsIssuedCredit(CreditNote creditNote) =>
        string.Equals(creditNote.Status, "Issued", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(creditNote.Status, "PartiallyRefunded", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(creditNote.Status, "Refunded", StringComparison.OrdinalIgnoreCase);

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
        IEnumerable<CreditNote> issuedCredits,
        IReadOnlyList<InvoiceItem>? effectiveInvoiceItems = null)
    {
        var dict = issuedCredits
            .SelectMany(creditNote => creditNote.Items)
            .Where(item => item.InvoiceItemId.HasValue)
            .GroupBy(item => item.InvoiceItemId!.Value)
            .ToDictionary(group => group.Key, group => group.Sum(item => item.Quantity));

        if (effectiveInvoiceItems != null && effectiveInvoiceItems.Count == 1 && effectiveInvoiceItems[0].Id == 0 && !dict.ContainsKey(0))
        {
            var unlinkedQty = issuedCredits
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

    private static Dictionary<int, decimal> GetExtraInvoiceDiscountShares(Invoice invoice, IReadOnlyList<InvoiceItem> items)
    {
        var result = new Dictionary<int, decimal>();
        if (items.Count == 0)
        {
            return result;
        }

        var lineDiscountsSum = items.Sum(i => Math.Max(0m, i.DiscountAmount));
        var extraInvoiceDiscount = Math.Max(0m, Math.Round(invoice.DiscountAmount - lineDiscountsSum, 2, MidpointRounding.AwayFromZero));
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

        decimal allocated = 0m;
        for (int idx = 0; idx < itemNets.Count; idx++)
        {
            var (item, net) = itemNets[idx];
            decimal share;
            if (idx == itemNets.Count - 1)
            {
                share = Math.Max(0m, Math.Round(extraInvoiceDiscount - allocated, 2, MidpointRounding.AwayFromZero));
            }
            else
            {
                share = Math.Round(extraInvoiceDiscount * net / totalNet, 2, MidpointRounding.AwayFromZero);
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
        decimal authoritativeRemaining)
    {
        var seenInvoiceItemIds = new HashSet<int>();
        var extraDiscountsByItemId = GetExtraInvoiceDiscountShares(invoice, effectiveInvoiceItems);
        var taxComputedBeforeExtraDiscount = extraDiscountsByItemId.Values.Sum() > 0m &&
            Math.Abs(invoice.TaxAmount - effectiveInvoiceItems.Sum(i => i.TaxAmount)) <= 0.05m;

        decimal subtotal = 0m;
        decimal taxAmount = 0m;
        decimal totalAmount = 0m;

        foreach (var requestedItem in requestedItems)
        {
            if (requestedItem.Quantity <= 0m)
                return $"Quantity for '{requestedItem.Description}' must be greater than zero.";

            InvoiceItem? sourceItem = null;
            if (requestedItem.InvoiceItemId.HasValue)
            {
                sourceItem = effectiveInvoiceItems.FirstOrDefault(item => item.Id == requestedItem.InvoiceItemId.Value);
                if (sourceItem == null)
                    return $"Invoice item with ID {requestedItem.InvoiceItemId.Value} was not found on this invoice.";
            }
            else if (effectiveInvoiceItems.Count == 1 && effectiveInvoiceItems[0].Id == 0)
            {
                sourceItem = effectiveInvoiceItems[0];
            }

            if (sourceItem != null)
            {
                if (!seenInvoiceItemIds.Add(sourceItem.Id))
                    return $"Invoice line '{sourceItem.Description}' can only be selected once.";

                var previouslyCredited = previouslyCreditedQuantities.GetValueOrDefault(sourceItem.Id);
                var remainingQuantity = Math.Max(0m, sourceItem.Quantity - previouslyCredited);
                if (requestedItem.Quantity > remainingQuantity)
                    return $"Credit quantity ({requestedItem.Quantity}) for '{sourceItem.Description}' cannot exceed its remaining eligible quantity ({remainingQuantity}).";
            }

            var unitPrice = sourceItem?.UnitPrice ?? requestedItem.UnitPrice;
            var originalQuantity = sourceItem?.Quantity ?? requestedItem.Quantity;
            var lineOnlyDiscount = sourceItem != null && originalQuantity > 0m
                ? Math.Round(sourceItem.DiscountAmount * requestedItem.Quantity / originalQuantity, 2, MidpointRounding.AwayFromZero)
                : requestedItem.DiscountAmount;
            var extraDiscountShare = sourceItem != null && originalQuantity > 0m
                ? Math.Round(extraDiscountsByItemId.GetValueOrDefault(sourceItem.Id) * requestedItem.Quantity / originalQuantity, 2, MidpointRounding.AwayFromZero)
                : 0m;
            var discount = Math.Round(lineOnlyDiscount + extraDiscountShare, 2, MidpointRounding.AwayFromZero);

            var taxType = sourceItem?.TaxType ?? requestedItem.TaxType;
            var taxRate = sourceItem?.TaxRate ?? requestedItem.TaxRate ?? 0m;
            var isTaxInclusive = string.Equals(taxType, "Inclusive", StringComparison.OrdinalIgnoreCase);

            decimal lineSubtotal;
            decimal lineTax;
            decimal lineTotal;

            if (isTaxInclusive)
            {
                var netInclusive = Math.Max(0m, Math.Round(requestedItem.Quantity * unitPrice - discount, 2, MidpointRounding.AwayFromZero));
                var baseAmount = taxRate > 0m ? netInclusive / (1m + (taxRate / 100m)) : netInclusive;
                lineTax = taxRate > 0m ? Math.Round(netInclusive - baseAmount, 2, MidpointRounding.AwayFromZero) : 0m;
                lineSubtotal = Math.Max(0m, Math.Round(netInclusive - lineTax, 2, MidpointRounding.AwayFromZero));
                lineTotal = netInclusive;
            }
            else
            {
                lineSubtotal = Math.Max(0m, Math.Round(requestedItem.Quantity * unitPrice - discount, 2, MidpointRounding.AwayFromZero));
                var taxableBase = extraDiscountShare > 0m && taxComputedBeforeExtraDiscount
                    ? Math.Max(0m, Math.Round(requestedItem.Quantity * unitPrice - lineOnlyDiscount, 2, MidpointRounding.AwayFromZero))
                    : lineSubtotal;
                lineTax = Math.Round(taxableBase * (taxRate / 100m), 2, MidpointRounding.AwayFromZero);
                lineTotal = Math.Round(lineSubtotal + lineTax, 2, MidpointRounding.AwayFromZero);
            }

            subtotal += lineSubtotal;
            taxAmount += lineTax;
            totalAmount += lineTotal;
            creditNote.Items.Add(new CreditNoteItem
            {
                CreditNoteId = creditNote.Id,
                InvoiceItemId = requestedItem.InvoiceItemId == 0 ? null : requestedItem.InvoiceItemId,
                ProductId = sourceItem?.ProductId ?? requestedItem.ProductId,
                Description = !string.IsNullOrWhiteSpace(sourceItem?.Description) ? sourceItem.Description : requestedItem.Description,
                Quantity = requestedItem.Quantity,
                UnitPrice = unitPrice,
                DiscountAmount = discount,
                TaxType = taxType,
                TaxRate = taxRate,
                TaxAmount = lineTax,
                TotalAmount = lineTotal,
                HSNSAC = sourceItem?.HSNSAC ?? requestedItem.HSNSAC
            });
        }

        creditNote.Subtotal = subtotal;
        creditNote.TaxAmount = taxAmount;
        creditNote.TotalAmount = totalAmount;

        // InvoiceService rounds the saved invoice grand total to whole rupees.
        // Whenever all remaining eligible quantities are selected (whether Type is
        // "Full" or "Partial"), or when a partial selection exceeds the remaining
        // balance strictly by whole-rupee rounding (<= 0.50), carry that rounding
        // adjustment into the credit so it reconciles cleanly.
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
                var lastLine = creditNote.Items.Last();
                lastLine.TotalAmount = Math.Round(lastLine.TotalAmount + adjustment, 2, MidpointRounding.AwayFromZero);
                creditNote.TotalAmount = authoritativeRemaining;
            }
            else if (!fullySelected && adjustment < 0m && Math.Abs(adjustment) <= 0.50m)
            {
                var lastLine = creditNote.Items.Last();
                lastLine.TotalAmount = Math.Round(lastLine.TotalAmount + adjustment, 2, MidpointRounding.AwayFromZero);
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
            TotalAmount = invoice.TotalAmount,
            PaidAmount = invoice.PaidAmount,
            CreditedAmount = effectiveCreditedAmount,
            BalanceAmount = invoice.BalanceAmount,
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

    private static bool IsUserAuthorizedForApproval(List<string> userRoles, List<string> userPermissions)
    {
        if (userRoles.Any(r => ApprovalAuthorizedRoles.Contains(r)))
            return true;

        if (userPermissions.Any(p => ApprovalAuthorizedPermissions.Contains(p)))
            return true;

        return false;
    }

    private static CreditNoteDetailDto MapToDetailDto(CreditNote cn, Invoice? inv)
    {
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
            TaxAmount = cn.TaxAmount,
            TotalAmount = cn.TotalAmount,
            RefundedAmount = cn.RefundedAmount,
            RemainingRefundableAmount = cn.RemainingRefundableAmount,
            Status = cn.Status,
            Reason = cn.Reason,
            Notes = cn.Notes,
            Currency = inv?.GetCurrency() ?? "INR",

            InvoiceTotalAmount = inv?.TotalAmount ?? 0m,
            InvoicePaidAmount = inv?.PaidAmount ?? 0m,
            InvoiceCreditedAmount = inv?.CreditedAmount ?? 0m,
            InvoiceBalanceAmount = inv?.BalanceAmount ?? 0m,
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

            Items = cn.Items.Select(i => new CreditNoteItemDto
            {
                Id = i.Id,
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

            Refunds = cn.Refunds.Select(r => new CreditNoteRefundDto
            {
                Id = r.Id,
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
    }
}
