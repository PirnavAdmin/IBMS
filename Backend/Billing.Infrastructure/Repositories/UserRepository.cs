using Billing.Application.Interfaces;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Repositories;

public class UserRepository : IUserRepository
{
    private readonly BillingDbContext _context;

    public UserRepository(BillingDbContext context)
    {
        _context = context;
    }

    public async Task<User?> GetByIdAsync(int id)
    {
        return await _context.Users
            .Include(u => u.Tenant)
            .Include(u => u.Sessions)
            .FirstOrDefaultAsync(x => x.Id == id);
    }

    public async Task<User?> GetByEmailAsync(string email)
    {
        return await _context.Users
            .Include(u => u.Tenant)
            .FirstOrDefaultAsync(x => x.Email.ToLower() == email.ToLower());
    }

    public async Task<User?> GetByUsernameAsync(string username)
    {
        return await _context.Users
            .Include(u => u.Tenant)
            .FirstOrDefaultAsync(x => x.Username.ToLower() == username.ToLower());
    }

    public async Task<User?> GetByEmailOrUsernameAsync(string identifier)
    {
        var lower = identifier.Trim().ToLower();
        return await _context.Users
            .Include(u => u.Tenant)
            .FirstOrDefaultAsync(x => x.Email.ToLower() == lower || x.Username.ToLower() == lower);
    }

    public async Task AddAsync(User user)
    {
        _context.Users.Add(user);

        await _context.SaveChangesAsync();
    }

    public async Task UpdateAsync(User user)
    {
        _context.Users.Update(user);

        await _context.SaveChangesAsync();
    }
}