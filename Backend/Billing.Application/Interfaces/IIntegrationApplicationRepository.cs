using Billing.Contracts.Webhook;
using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IIntegrationApplicationRepository
{
    Task<IntegrationApplication?> GetByIdAsync(int id, int tenantId);
    Task<IntegrationApplication?> GetByClientIdAsync(string clientId);
    Task<(List<IntegrationApplication> Items, int TotalCount)> GetPagedListAsync(IntegrationQueryParameters query, int tenantId);
    Task<IntegrationApplication> AddAsync(IntegrationApplication app);
    Task UpdateAsync(IntegrationApplication app);
    Task DeleteAsync(IntegrationApplication app);
}
