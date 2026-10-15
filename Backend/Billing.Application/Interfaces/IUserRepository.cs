using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IUserRepository
{
    Task<User?> GetByIdAsync(int id);

    Task<User?> GetByEmailAsync(string email);

    Task<User?> GetByUsernameAsync(string username);

    Task<User?> GetByEmailOrUsernameAsync(string identifier);

    Task AddAsync(User user);

    Task UpdateAsync(User user);

    Task DeleteAsync(User user);

    Task<(List<User> Users, int TotalCount)> GetPagedUsersAsync(string? search, string? status, string? role, int? tenantId, string? identityType, int pageNumber, int pageSize);

    Task<User?> GetByExternalSubjectAsync(string provider, string subjectId);
}