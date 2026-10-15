using Billing.Application.Interfaces;
using Billing.Domain.Entities;

namespace Billing.Tests.Unit.Fakes;

public class FakeUserRepository : IUserRepository
{
    public List<User> Users { get; } = new();

    public Task<User?> GetByIdAsync(int id)
    {
        return Task.FromResult(Users.FirstOrDefault(u => u.Id == id));
    }

    public Task<User?> GetByEmailAsync(string email)
    {
        return Task.FromResult(Users.FirstOrDefault(u => u.Email.Equals(email, StringComparison.OrdinalIgnoreCase)));
    }

    public Task<User?> GetByUsernameAsync(string username)
    {
        return Task.FromResult(Users.FirstOrDefault(u => u.Username.Equals(username, StringComparison.OrdinalIgnoreCase)));
    }

    public Task<User?> GetByEmailOrUsernameAsync(string identifier)
    {
        var match = Users.FirstOrDefault(u =>
            u.Email.Equals(identifier, StringComparison.OrdinalIgnoreCase) ||
            u.Username.Equals(identifier, StringComparison.OrdinalIgnoreCase));

        return Task.FromResult(match);
    }

    public Task AddAsync(User user)
    {
        if (user.Id == 0)
        {
            user.Id = Users.Any() ? Users.Max(u => u.Id) + 1 : 1;
        }
        Users.Add(user);
        return Task.CompletedTask;
    }

    public Task UpdateAsync(User user)
    {
        var existing = Users.FirstOrDefault(u => u.Id == user.Id);
        if (existing != null)
        {
            Users.Remove(existing);
            Users.Add(user);
        }
        return Task.CompletedTask;
    }

    public Task DeleteAsync(User user)
    {
        var existing = Users.FirstOrDefault(u => u.Id == user.Id);
        if (existing != null)
        {
            Users.Remove(existing);
        }
        return Task.CompletedTask;
    }

    public Task<(List<User> Users, int TotalCount)> GetPagedUsersAsync(
        string? search,
        string? status,
        string? role,
        int? tenantId,
        string? identityType,
        int pageNumber,
        int pageSize)
    {
        var query = Users.AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            query = query.Where(u =>
                (u.Name != null && u.Name.Contains(s, StringComparison.OrdinalIgnoreCase)) ||
                (u.Email != null && u.Email.Contains(s, StringComparison.OrdinalIgnoreCase)) ||
                (u.Username != null && u.Username.Contains(s, StringComparison.OrdinalIgnoreCase)));
        }

        if (!string.IsNullOrWhiteSpace(status))
        {
            query = query.Where(u => string.Equals(u.Status, status, StringComparison.OrdinalIgnoreCase));
        }

        if (tenantId.HasValue)
        {
            query = query.Where(u => u.TenantId == tenantId.Value);
        }

        if (!string.IsNullOrWhiteSpace(identityType))
        {
            query = query.Where(u => string.Equals(u.IdentityType, identityType, StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(role))
        {
            query = query.Where(u => u.Roles.Any(r => string.Equals(r, role, StringComparison.OrdinalIgnoreCase)));
        }

        var total = query.Count();
        var paged = query.Skip((pageNumber - 1) * pageSize).Take(pageSize).ToList();
        return Task.FromResult((paged, total));
    }

    public Task<User?> GetByExternalSubjectAsync(string provider, string subjectId)
    {
        var match = Users.FirstOrDefault(u =>
            string.Equals(u.ExternalProvider, provider, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(u.ExternalSubjectId, subjectId, StringComparison.OrdinalIgnoreCase));
        return Task.FromResult(match);
    }
}
