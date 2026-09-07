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

    public async Task<UserSession?> GetByRefreshTokenHashAsync(string refreshTokenHash)
    {
        return await _context.UserSessions
            .Include(s => s.User)
            .FirstOrDefaultAsync(s => s.RefreshTokenHash == refreshTokenHash);
    }

    public async Task<List<UserSession>> GetActiveSessionsByUserIdAsync(int userId)
    {
        return await _context.UserSessions
            .Where(s => s.UserId == userId && !s.IsRevoked && s.ExpiresAt > DateTime.UtcNow)
            .ToListAsync();
    }

    public async Task AddAsync(UserSession session)
    {
        _context.UserSessions.Add(session);
        await _context.SaveChangesAsync();
    }

    public async Task UpdateAsync(UserSession session)
    {
        _context.UserSessions.Update(session);
        await _context.SaveChangesAsync();
    }

    public async Task RevokeAllUserSessionsAsync(int userId)
    {
        var activeSessions = await _context.UserSessions
            .Where(s => s.UserId == userId && !s.IsRevoked)
            .ToListAsync();

        if (activeSessions.Any())
        {
            var now = DateTime.UtcNow;
            foreach (var session in activeSessions)
            {
                session.IsRevoked = true;
                session.RevokedAt = now;
            }

            await _context.SaveChangesAsync();
        }
    }
}
