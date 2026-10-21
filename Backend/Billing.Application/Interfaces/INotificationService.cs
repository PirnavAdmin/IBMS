using Billing.Contracts;
using Billing.Contracts.Notification;

namespace Billing.Application.Interfaces;

public interface INotificationService
{
    Task<ApiResponse<NotificationLogDto>> SendInvoiceNotificationAsync(int invoiceId, int tenantId, string eventType = "InvoiceSent", string? userName = null, byte[]? pdfBytes = null, string? pdfFileName = null);
    Task<ApiResponse<NotificationLogDto>> SendPaymentNotificationAsync(int paymentId, int tenantId, string eventType = "PaymentReceived", string? userName = null);
    Task<ApiResponse<NotificationLogDto>> SendQuotationNotificationAsync(int quotationId, int tenantId, string? userName = null, byte[]? pdfBytes = null, string? pdfFileName = null);
    Task<ApiResponse<NotificationLogDto>> SendCreditNoteNotificationAsync(int creditNoteId, int tenantId, string? userName = null, byte[]? pdfBytes = null, string? pdfFileName = null);
    Task<ApiResponse<int>> ProcessOverdueInvoicesAsync(int tenantId, string? userName = null);
    Task<ApiResponse<NotificationLogDto>> RetryNotificationAsync(int logId, int tenantId, string? userName = null);
    Task<ApiResponse<PagedResult<NotificationLogDto>>> GetNotificationHistoryAsync(int tenantId, NotificationLogQueryParameters parameters);
}
