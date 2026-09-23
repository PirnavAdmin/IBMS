using Billing.Contracts;

namespace Billing.Application.Interfaces;

public interface IQuotationActionService
{
    Task<ApiResponse<bool>> CalculateAndFreezeSnapshotAsync(int quotationId, int tenantId);
    Task<ApiResponse<string>> GenerateQuotationNumberAsync(int tenantId);
    Task<ApiResponse<bool>> SendQuotationAsync(int quotationId, int tenantId, string userId);
    Task<ApiResponse<bool>> ApproveQuotationAsync(int quotationId, int tenantId, string approverId);
    Task<ApiResponse<bool>> CancelQuotationAsync(int quotationId, int tenantId, string reason, string userId);
    Task<ApiResponse<int>> ConvertToInvoiceAsync(int quotationId, int tenantId, string userId);
}
