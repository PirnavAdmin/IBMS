using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IChargeRepository
{
    Task<ChargeConfiguration?> GetByIdAsync(int id, int tenantId);
    Task<ChargeConfiguration?> GetByIdForUpdateAsync(int id, int tenantId);
    Task<ChargeConfiguration?> GetByCodeAsync(string code, int tenantId);
    Task<List<ChargeConfiguration>> GetAllAsync(int tenantId, bool? activeOnly = null, string? chargeType = null);
    Task<ChargeConfiguration> AddAsync(ChargeConfiguration charge);
    Task<ChargeConfiguration> UpdateAsync(ChargeConfiguration charge);
    Task<bool> DeleteAsync(int id, int tenantId);
}
