using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IUserRepository
{
    Task<User?> GetByEmailAsync(string email);

    Task<User?> GetByIdAsync(int id);

    Task AddAsync(User user);

    Task UpdateAsync(User user);
}
