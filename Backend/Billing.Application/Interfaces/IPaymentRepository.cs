using Billing.Contracts;
using Billing.Contracts.Payment;
using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IPaymentRepository
{
    Task<Payment?> GetByIdAsync(int tenantId, int id);
    Task<Payment?> GetByIdForUpdateAsync(int tenantId, int id);
    Task<Payment?> GetByIdempotencyKeyAsync(int tenantId, string idempotencyKey);
    Task<Payment?> GetByProviderTransactionAsync(int tenantId, string providerName, string providerTransactionId);
    Task<bool> ExistsPaymentNumberAsync(int tenantId, string paymentNumber);
    Task<PagedResult<Payment>> GetPagedListAsync(int tenantId, PaymentListFilterRequest filter, int? restrictedCustomerId = null);
    Task<decimal> GetEffectiveAllocatedSumForInvoiceAsync(int tenantId, int invoiceId);
    Task<Payment> AddAsync(Payment payment);
    Task UpdateAsync(Payment payment);
}
