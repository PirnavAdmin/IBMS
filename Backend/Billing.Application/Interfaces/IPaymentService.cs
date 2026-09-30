using Billing.Contracts;
using Billing.Contracts.Payment;

namespace Billing.Application.Interfaces;

public record PaymentOperationResult<T>(
    bool IsSuccess,
    T? Data = default,
    string? ErrorMessage = null,
    string? ErrorCode = null,
    int StatusCode = 200,
    bool IsIdempotentReplay = false,
    List<string>? ValidationErrors = null)
{
    public static PaymentOperationResult<T> Success(T data, int statusCode = 200, bool isIdempotentReplay = false)
        => new(true, data, null, null, statusCode, isIdempotentReplay);

    public static PaymentOperationResult<T> Failure(
        string errorMessage,
        string errorCode = "VALIDATION_ERROR",
        int statusCode = 400,
        List<string>? validationErrors = null)
        => new(false, default, errorMessage, errorCode, statusCode, false, validationErrors);
}

public interface IPaymentService
{
    Task<PaymentOperationResult<PaymentDetailDto>> CreatePaymentAsync(
        int tenantId,
        CreatePaymentRequest request,
        string performedBy,
        IEnumerable<string>? userRoles = null,
        IEnumerable<string>? userPermissions = null,
        int? restrictedCustomerId = null);

    Task<PaymentOperationResult<PagedResult<PaymentListItemDto>>> GetPagedPaymentsAsync(
        int tenantId,
        PaymentListFilterRequest filter,
        IEnumerable<string>? userRoles = null,
        int? restrictedCustomerId = null);

    Task<PaymentOperationResult<PaymentDetailDto>> GetPaymentByIdAsync(
        int tenantId,
        int paymentId,
        IEnumerable<string>? userRoles = null,
        int? restrictedCustomerId = null);

    Task<PaymentOperationResult<PaymentDetailDto>> ReversePaymentAsync(
        int tenantId,
        int paymentId,
        ReversePaymentRequest request,
        string performedBy,
        IEnumerable<string>? userRoles = null,
        IEnumerable<string>? userPermissions = null);

    Task<PaymentOperationResult<PaymentDetailDto>> UpdatePaymentStatusAsync(
        int tenantId,
        int paymentId,
        UpdatePaymentStatusRequest request,
        string performedBy,
        IEnumerable<string>? userRoles = null,
        IEnumerable<string>? userPermissions = null);

    Task<PaymentOperationResult<List<EligibleInvoiceBalanceDto>>> GetEligibleInvoicesAsync(
        int tenantId,
        int? customerId = null,
        int? restrictedCustomerId = null);

    Task<PaymentOperationResult<EligibleInvoiceBalanceDto>> GetInvoiceBalanceAsync(
        int tenantId,
        int invoiceId,
        int? restrictedCustomerId = null);

    Task<PaymentOperationResult<List<PaymentAuditEventDto>>> GetPaymentAuditHistoryAsync(
        int tenantId,
        int paymentId,
        int? restrictedCustomerId = null);
}
