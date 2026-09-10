using Billing.Application.Interfaces;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Repositories;

public class UserSessionRepository : IUserSessionRepository
{
    private readonly BillingDbContext _context;

    public UserSessionRepository(BillingDbContext context)
    {
        _context = context;
    }

    public async Task CreateSessionAsync(UserSession session)
    {
        await _context.UserSessions.AddAsync(session);
        await _context.SaveChangesAsync();
    }

    public async Task<UserSession?> GetByIdAsync(int id)
    {
        return await _context.UserSessions
            .Include(s => s.User)
            .FirstOrDefaultAsync(s => s.Id == id);
    }

    public async Task<UserSession?> GetByTokenHashAsync(string tokenHash)
    {
        return await _context.UserSessions
            .Include(s => s.User)
            .FirstOrDefaultAsync(s => s.RefreshTokenHash == tokenHash);
    }

    public async Task<List<UserSession>> GetActiveSessionsByUserIdAsync(int userId)
    {
        var now = DateTime.UtcNow;
        return await _context.UserSessions
            .Where(s => s.UserId == userId &&
                        !s.IsRevoked &&
                        s.RefreshTokenExpiresAtUtc > now &&
                        s.SessionExpiresAtUtc > now)
            .OrderByDescending(s => s.LastActivityAtUtc)
            .ToListAsync();
    }

    public async Task<List<UserSession>> GetAllSessionsByUserIdAsync(int userId)
    {
        return await _context.UserSessions
            .Where(s => s.UserId == userId)
            .OrderByDescending(s => s.CreatedAtUtc)
            .ToListAsync();
    }

    public async Task RevokeSessionAsync(int sessionId, string reason, string? replacedByHash = null)
    {
        var session = await _context.UserSessions.FirstOrDefaultAsync(s => s.Id == sessionId);
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

            await _context.SaveChangesAsync();
        }
    }

    public async Task RevokeAllUserSessionsAsync(int userId, string reason)
    {
        var activeSessions = await _context.UserSessions
            .Where(s => s.UserId == userId && !s.IsRevoked)
            .ToListAsync();

        var now = DateTime.UtcNow;
        foreach (var session in activeSessions)
        {
            session.IsRevoked = true;
            session.RevokedAtUtc = now;
            session.LogoutAtUtc ??= now;
            session.RevocationReason = reason;
        }

        if (activeSessions.Any())
        {
            await _context.SaveChangesAsync();
        }
    }

    public async Task UpdateActivityAsync(int sessionId, DateTime? newSessionExpiry = null)
    {
        var session = await _context.UserSessions.FirstOrDefaultAsync(s => s.Id == sessionId);
        if (session != null && !session.IsRevoked)
        {
            session.LastActivityAtUtc = DateTime.UtcNow;
            if (newSessionExpiry.HasValue)
            {
                session.SessionExpiresAtUtc = newSessionExpiry.Value;
            }

            await _context.SaveChangesAsync();
        }
    }

    public async Task UpdateSessionAsync(UserSession session)
    {
        _context.UserSessions.Update(session);
        await _context.SaveChangesAsync();
    }
}
