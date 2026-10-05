using Billing.Contracts;
using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IInvoiceService
{
    Task<ApiResponse<Invoice>> CreateDraftAsync(Invoice invoice, int tenantId);
    Task<ApiResponse<Invoice>> UpdateDraftAsync(int id, Invoice invoice, int tenantId);
    Task<ApiResponse<Invoice>> IssueInvoiceAsync(int id, int tenantId);
    Task<ApiResponse<Invoice>> CancelInvoiceAsync(int id, int tenantId, string reason);
    Task<ApiResponse<Invoice>> VoidInvoiceAsync(int id, int tenantId, string reason);
    Task<ApiResponse<bool>> DeliverInvoiceAsync(int id, int tenantId);
}

