using Billing.Contracts;
using Billing.Contracts.Quotation;

namespace Billing.Application.Interfaces;

public interface IQuotationService
{
    Task<ApiResponse<PagedResult<QuotationResponse>>> GetPagedListAsync(QuotationListFilterRequest filter, int tenantId);
    Task<ApiResponse<QuotationDetailResponse>> GetByIdAsync(int id, int tenantId);
    Task<ApiResponse<QuotationDetailResponse>> CreateDraftAsync(CreateQuotationRequest request, int tenantId, string? userId = null);
    Task<ApiResponse<QuotationDetailResponse>> UpdateDraftAsync(int id, UpdateQuotationRequest request, int tenantId);
}
