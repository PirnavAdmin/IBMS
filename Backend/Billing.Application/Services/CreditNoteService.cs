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

    public CreditNoteService(
        ICreditNoteRepository creditNoteRepository,
        IInvoiceRepository invoiceRepository,
        ICustomerRepository customerRepository,
        INumberGenerationService numberGenerationService,
        IAuditLogRepository auditLogRepository,
        IUnitOfWork unitOfWork)
    {
        _creditNoteRepository = creditNoteRepository;
        _invoiceRepository = invoiceRepository;
        _customerRepository = customerRepository;
        _numberGenerationService = numberGenerationService;
        _auditLogRepository = auditLogRepository;
        _unitOfWork = unitOfWork;
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

        var previouslyCreditedQuantities = GetPreviouslyCreditedQuantities(issuedCredits);
        var requestedItems = request.Items ?? new List<CreateCreditNoteItemRequest>();
        if (string.Equals(creditNote.Type, "Full", StringComparison.OrdinalIgnoreCase))
        {
            var remainingLines = invoice.Items
                .Select(item => new
                {
                    Item = item,
                    Quantity = Math.Max(0m, item.Quantity - previouslyCreditedQuantities.GetValueOrDefault(item.Id))
                })
                .Where(line => line.Quantity > 0m)
                .ToList();
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
        var calculationError = PopulateCreditNoteItems(creditNote, invoice, requestedItems, previouslyCreditedQuantities);
        if (calculationError != null)
            return ApiResponse<CreditNoteDetailDto>.Fail(calculationError);

        var remainingCreditable = invoice.GetRemainingCreditableAmount();
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

        var previouslyCreditedQuantities = GetPreviouslyCreditedQuantities(issuedCredits);
        var requestedItems = request.Items ?? new List<CreateCreditNoteItemRequest>();
        if (string.Equals(creditNote.Type, "Full", StringComparison.OrdinalIgnoreCase))
        {
            var remainingLines = invoice.Items
                .Select(item => new
                {
                    Item = item,
                    Quantity = Math.Max(0m, item.Quantity - previouslyCreditedQuantities.GetValueOrDefault(item.Id))
                })
                .Where(line => line.Quantity > 0m)
                .ToList();
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
        var calculationError = PopulateCreditNoteItems(creditNote, invoice, requestedItems, previouslyCreditedQuantities);
        if (calculationError != null)
            return ApiResponse<CreditNoteDetailDto>.Fail(calculationError);

        var remainingCreditable = invoice.GetRemainingCreditableAmount();
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
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<CreditNoteDetailDto>.Fail($"Credit note amount ({creditNote.TotalAmount:F2}) exceeds the invoice's remaining creditable amount ({remainingCreditable:F2}).");
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

            await _unitOfWork.CommitTransactionAsync();

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
                EntityName = "CreditNoteRefund",
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

    private static Dictionary<int, decimal> GetPreviouslyCreditedQuantities(IEnumerable<CreditNote> issuedCredits) =>
        issuedCredits
            .SelectMany(creditNote => creditNote.Items)
            .Where(item => item.InvoiceItemId.HasValue)
            .GroupBy(item => item.InvoiceItemId!.Value)
            .ToDictionary(group => group.Key, group => group.Sum(item => item.Quantity));

    private static string? PopulateCreditNoteItems(
        CreditNote creditNote,
        Invoice invoice,
        IReadOnlyCollection<CreateCreditNoteItemRequest> requestedItems,
        IReadOnlyDictionary<int, decimal> previouslyCreditedQuantities)
    {
        var seenInvoiceItemIds = new HashSet<int>();
        decimal subtotal = 0m;
        decimal taxAmount = 0m;
        decimal totalAmount = 0m;

        foreach (var requestedItem in requestedItems)
        {
            if (requestedItem.Quantity <= 0m)
                return $"Quantity for '{requestedItem.Description}' must be greater than zero.";

            var sourceItem = requestedItem.InvoiceItemId.HasValue
                ? invoice.Items.FirstOrDefault(item => item.Id == requestedItem.InvoiceItemId.Value)
                : null;
            if (requestedItem.InvoiceItemId.HasValue && sourceItem == null)
                return $"Invoice item with ID {requestedItem.InvoiceItemId.Value} was not found on this invoice.";

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
            var discount = sourceItem != null && originalQuantity > 0m
                ? Math.Round(sourceItem.DiscountAmount * requestedItem.Quantity / originalQuantity, 2, MidpointRounding.AwayFromZero)
                : requestedItem.DiscountAmount;
            var lineSubtotal = Math.Max(0m, Math.Round(requestedItem.Quantity * unitPrice - discount, 2, MidpointRounding.AwayFromZero));
            var taxRate = sourceItem?.TaxRate ?? requestedItem.TaxRate ?? 0m;
            var lineTax = Math.Round(lineSubtotal * (taxRate / 100m), 2, MidpointRounding.AwayFromZero);
            var lineTotal = Math.Round(lineSubtotal + lineTax, 2, MidpointRounding.AwayFromZero);

            subtotal += lineSubtotal;
            taxAmount += lineTax;
            totalAmount += lineTotal;
            creditNote.Items.Add(new CreditNoteItem
            {
                CreditNoteId = creditNote.Id,
                InvoiceItemId = requestedItem.InvoiceItemId,
                ProductId = sourceItem?.ProductId ?? requestedItem.ProductId,
                Description = sourceItem?.Description ?? requestedItem.Description,
                Quantity = requestedItem.Quantity,
                UnitPrice = unitPrice,
                DiscountAmount = discount,
                TaxType = sourceItem?.TaxType ?? requestedItem.TaxType,
                TaxRate = taxRate,
                TaxAmount = lineTax,
                TotalAmount = lineTotal,
                HSNSAC = sourceItem?.HSNSAC ?? requestedItem.HSNSAC
            });
        }

        creditNote.Subtotal = subtotal;
        creditNote.TaxAmount = taxAmount;
        creditNote.TotalAmount = totalAmount;
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
        var issuedCredits = existingCredits.Where(c => string.Equals(c.Status, "Issued", StringComparison.OrdinalIgnoreCase) ||
                                                       string.Equals(c.Status, "PartiallyRefunded", StringComparison.OrdinalIgnoreCase) ||
                                                       string.Equals(c.Status, "Refunded", StringComparison.OrdinalIgnoreCase)).ToList();

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
            CreditedAmount = invoice.CreditedAmount,
            BalanceAmount = invoice.BalanceAmount,
            RemainingCreditableAmount = invoice.GetRemainingCreditableAmount(),
            IsEligibleForCredit = isEligible,
            IneligibilityReason = reason
        };

        foreach (var item in invoice.Items)
        {
            var previouslyCreditedQty = issuedCredits.SelectMany(c => c.Items)
                .Where(ci => ci.InvoiceItemId == item.Id)
                .Sum(ci => ci.Quantity);

            var previouslyCreditedAmt = issuedCredits.SelectMany(c => c.Items)
                .Where(ci => ci.InvoiceItemId == item.Id)
                .Sum(ci => ci.TotalAmount);

            summary.Items.Add(new InvoiceCreditableLineItemDto
            {
                InvoiceItemId = item.Id,
                ProductId = item.ProductId,
                Description = item.Description,
                OriginalQuantity = item.Quantity,
                PreviouslyCreditedQuantity = previouslyCreditedQty,
                RemainingEligibleQuantity = Math.Max(0m, item.Quantity - previouslyCreditedQty),
                UnitPrice = item.UnitPrice,
                DiscountAmount = item.DiscountAmount,
                TaxType = item.TaxType,
                TaxRate = item.TaxRate,
                TaxAmount = item.TaxAmount,
                TotalAmount = item.TotalAmount,
                PreviouslyCreditedAmount = previouslyCreditedAmt,
                RemainingEligibleAmount = Math.Max(0m, item.TotalAmount - previouslyCreditedAmt),
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
