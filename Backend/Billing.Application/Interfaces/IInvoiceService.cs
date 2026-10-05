using Billing.Contracts;
using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IInvoiceService
{
    Task<ApiResponse<Invoice>> CreateDraftAsync(Invoice invoice, int tenantId, string? userName = null);
    Task<ApiResponse<Invoice>> UpdateDraftAsync(int id, Invoice invoice, int tenantId, string? userName = null);
    Task<ApiResponse<Invoice>> IssueInvoiceAsync(int id, int tenantId, string? userName = null);
    Task<ApiResponse<Invoice>> CancelInvoiceAsync(int id, int tenantId, string reason, string? userName = null);
    Task<ApiResponse<Invoice>> VoidInvoiceAsync(int id, int tenantId, string reason, string? userName = null);
    Task<ApiResponse<bool>> DeliverInvoiceAsync(int id, int tenantId, string? userName = null);
}
