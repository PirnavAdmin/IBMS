using Billing.Contracts;
using Billing.Contracts.CreditNote;

namespace Billing.Application.Interfaces;

public interface ICreditNoteService
{
    Task<ApiResponse<CreditNoteDetailDto>> CreateCreditNoteAsync(
        int tenantId,
        CreateCreditNoteRequest request,
        string userDisplayName,
        List<string> userRoles,
        List<string> userPermissions,
        int? restrictedCustomerId = null,
        CancellationToken cancellationToken = default);

    Task<ApiResponse<CreditNoteDetailDto>> UpdateCreditNoteDraftAsync(
        int tenantId,
        int id,
        UpdateCreditNoteRequest request,
        string userDisplayName,
        List<string> userRoles,
        List<string> userPermissions,
        int? restrictedCustomerId = null,
        CancellationToken cancellationToken = default);

    Task<ApiResponse<CreditNoteDetailDto>> SubmitForApprovalAsync(
        int tenantId,
        int id,
        string userDisplayName,
        List<string> userRoles,
        List<string> userPermissions,
        CancellationToken cancellationToken = default);

    Task<ApiResponse<CreditNoteDetailDto>> ApproveCreditNoteAsync(
        int tenantId,
        int id,
        string userDisplayName,
        List<string> userRoles,
        List<string> userPermissions,
        CancellationToken cancellationToken = default);

    Task<ApiResponse<CreditNoteDetailDto>> RejectCreditNoteAsync(
        int tenantId,
        int id,
        RejectCreditNoteRequest request,
        string userDisplayName,
        List<string> userRoles,
        List<string> userPermissions,
        CancellationToken cancellationToken = default);

    Task<ApiResponse<CreditNoteDetailDto>> IssueCreditNoteAsync(
        int tenantId,
        int id,
        string userDisplayName,
        List<string> userRoles,
        List<string> userPermissions,
        CancellationToken cancellationToken = default);

    Task<ApiResponse<CreditNoteDetailDto>> CancelCreditNoteAsync(
        int tenantId,
        int id,
        CancelCreditNoteRequest request,
        string userDisplayName,
        List<string> userRoles,
        List<string> userPermissions,
        CancellationToken cancellationToken = default);

    Task<ApiResponse<CreditNoteDetailDto>> ProcessRefundAsync(
        int tenantId,
        int id,
        ProcessRefundRequest request,
        string userDisplayName,
        List<string> userRoles,
        List<string> userPermissions,
        CancellationToken cancellationToken = default);

    Task<ApiResponse<PagedResult<CreditNoteListItemDto>>> GetPagedCreditNotesAsync(
        int tenantId,
        CreditNoteFilterRequest filter,
        List<string> userRoles,
        int? restrictedCustomerId = null,
        CancellationToken cancellationToken = default);

    Task<ApiResponse<CreditNoteDetailDto>> GetCreditNoteByIdAsync(
        int tenantId,
        int id,
        List<string> userRoles,
        int? restrictedCustomerId = null,
        CancellationToken cancellationToken = default);

    Task<ApiResponse<InvoiceCreditableSummaryDto>> GetInvoiceCreditableSummaryAsync(
        int tenantId,
        int invoiceId,
        List<string> userRoles,
        int? restrictedCustomerId = null,
        CancellationToken cancellationToken = default);
}
