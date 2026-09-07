using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IUserSessionRepository
{
    Task<UserSession?> GetByRefreshTokenHashAsync(string refreshTokenHash);

    Task<List<UserSession>> GetActiveSessionsByUserIdAsync(int userId);

    Task AddAsync(UserSession session);

    Task UpdateAsync(UserSession session);

    Task RevokeAllUserSessionsAsync(int userId);
}
