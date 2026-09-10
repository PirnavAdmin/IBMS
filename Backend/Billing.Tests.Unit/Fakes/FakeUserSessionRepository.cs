using Billing.Application.Interfaces;
using Billing.Domain.Entities;

namespace Billing.Tests.Unit.Fakes;

public class FakeUserSessionRepository : IUserSessionRepository
{
    public List<UserSession> Sessions { get; } = new();

    private int _nextId = 1;

    public Task CreateSessionAsync(UserSession session)
    {
        if (session.Id == 0)
        {
            session.Id = _nextId++;
        }
        Sessions.Add(session);
        return Task.CompletedTask;
    }

    public Task<UserSession?> GetByIdAsync(int id)
    {
        return Task.FromResult(Sessions.FirstOrDefault(s => s.Id == id));
    }

    public Task<UserSession?> GetByTokenHashAsync(string tokenHash)
    {
        return Task.FromResult(Sessions.FirstOrDefault(s => s.RefreshTokenHash == tokenHash));
    }

    public Task<List<UserSession>> GetActiveSessionsByUserIdAsync(int userId)
    {
        var now = DateTime.UtcNow;
        var result = Sessions
            .Where(s => s.UserId == userId &&
                        !s.IsRevoked &&
                        s.RefreshTokenExpiresAtUtc > now &&
                        s.SessionExpiresAtUtc > now)
            .OrderByDescending(s => s.LastActivityAtUtc)
            .ToList();

        return Task.FromResult(result);
    }

    public Task<List<UserSession>> GetAllSessionsByUserIdAsync(int userId)
    {
        var result = Sessions
            .Where(s => s.UserId == userId)
            .OrderByDescending(s => s.CreatedAtUtc)
            .ToList();

        return Task.FromResult(result);
    }

    public Task RevokeSessionAsync(int sessionId, string reason, string? replacedByHash = null)
    {
        var session = Sessions.FirstOrDefault(s => s.Id == sessionId);
        if (session != null && !session.IsRevoked)
        {
            session.IsRevoked = true;
            session.RevokedAtUtc = DateTime.UtcNow;
            session.LogoutAtUtc ??= DateTime.UtcNow;
            session.RevocationReason = reason;
            if (!string.IsNullOrWhiteSpace(replacedByHash))
            {
                session.ReplacedByTokenHash = replacedByHash;
            }
        }
        return Task.CompletedTask;
    }

    public Task RevokeAllUserSessionsAsync(int userId, string reason)
    {
        var active = Sessions.Where(s => s.UserId == userId && !s.IsRevoked).ToList();
        var now = DateTime.UtcNow;
        foreach (var s in active)
        {
            s.IsRevoked = true;
            s.RevokedAtUtc = now;
            s.LogoutAtUtc ??= now;
            s.RevocationReason = reason;
        }
        return Task.CompletedTask;
    }

    public Task UpdateActivityAsync(int sessionId, DateTime? newSessionExpiry = null)
    {
        var session = Sessions.FirstOrDefault(s => s.Id == sessionId);
        if (session != null && !session.IsRevoked)
        {
            session.LastActivityAtUtc = DateTime.UtcNow;
            if (newSessionExpiry.HasValue)
            {
                session.SessionExpiresAtUtc = newSessionExpiry.Value;
            }
        }
        return Task.CompletedTask;
    }

    public Task UpdateSessionAsync(UserSession session)
    {
        var existing = Sessions.FirstOrDefault(s => s.Id == session.Id);
        if (existing != null)
        {
            Sessions.Remove(existing);
            Sessions.Add(session);
        }
        return Task.CompletedTask;
    }
}
