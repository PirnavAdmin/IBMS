namespace Billing.Application.Interfaces;

public interface ICurrentUserService
{
    string? UserId { get; }
    int? TenantId { get; }
    string? UserName { get; }
}
