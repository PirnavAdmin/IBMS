using Billing.Contracts.Administration;

namespace Billing.Application.Interfaces;

public interface IUserAdministrationService
{
    Task<(List<UserDto> Users, int TotalCount)> GetUsersAsync(UserQueryParameters query);
    Task<UserDto?> GetUserByIdAsync(int id);
    Task<(bool Success, string Message, UserDto? User)> CreateUserAsync(CreateUserRequest request);
    Task<(bool Success, string Message, UserDto? User)> UpdateUserAsync(int id, UpdateUserRequest request);
    Task<(bool Success, string Message)> UpdateUserStatusAsync(int id, string status);
    Task<(bool Success, string Message, UserDto? User)> AssignUserRolesAsync(int id, List<string> roles);
    Task<(bool Success, string Message, UserDto? User)> AssignTenantAndAppAsync(int id, int? tenantId, string applicationId);
    Task<(bool Success, string Message, UserDto? User)> MapHostIdentityAsync(HostIdentityMappingRequest request);
    Task<(bool Success, string Message)> DeleteUserAsync(int id);
}
