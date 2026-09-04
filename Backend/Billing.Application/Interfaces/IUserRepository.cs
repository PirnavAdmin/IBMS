using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IUserRepository
{
    Task<User?> GetByEmailAsync(string email);

    Task AddAsync(User user);

    Task UpdateAsync(User user);
}