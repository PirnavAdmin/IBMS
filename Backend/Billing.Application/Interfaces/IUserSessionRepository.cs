using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IUserSessionRepository
{
    Task CreateSessionAsync(UserSession session);

    Task<UserSession?> GetByIdAsync(int id);

    Task<UserSession?> GetByTokenHashAsync(string tokenHash);

    Task<List<UserSession>> GetActiveSessionsByUserIdAsync(int userId);

    Task<List<UserSession>> GetAllSessionsByUserIdAsync(int userId);

    Task RevokeSessionAsync(int sessionId, string reason, string? replacedByHash = null);

    Task RevokeAllUserSessionsAsync(int userId, string reason);

    Task UpdateActivityAsync(int sessionId, DateTime? newSessionExpiry = null);

    Task UpdateSessionAsync(UserSession session);
}
