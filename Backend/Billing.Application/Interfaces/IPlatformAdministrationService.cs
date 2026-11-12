using Billing.Contracts;
using Billing.Contracts.Platform;

namespace Billing.Application.Interfaces;

public interface IPlatformAdministrationService
{
    // Dashboard (BR-02)
    Task<PlatformDashboardDto> GetDashboardSummaryAsync(CancellationToken cancellationToken = default);

    // Tenant Lifecycle (BR-03)
    Task<PagedResult<PlatformTenantDto>> GetTenantsAsync(string? search, string? status, int pageNumber, int pageSize, CancellationToken cancellationToken = default);
    Task<PlatformTenantDetailDto?> GetTenantByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<(bool Success, string Message, PlatformTenantDetailDto? Tenant, string? ErrorCode)> CreateTenantAsync(CreateTenantRequest request, string currentUserName, CancellationToken cancellationToken = default);
    Task<(bool Success, string Message, PlatformTenantDetailDto? Tenant, string? ErrorCode)> UpdateTenantAsync(int id, UpdateTenantRequest request, string currentUserName, CancellationToken cancellationToken = default);
    Task<(bool Success, string Message, PlatformTenantDto? Tenant, string? ErrorCode)> UpdateTenantStatusAsync(int id, UpdateTenantStatusRequest request, string currentUserName, CancellationToken cancellationToken = default);
    Task<List<TenantAdminUserDto>> GetTenantAdminsAsync(int id, CancellationToken cancellationToken = default);

    // Platform User Management (BR-04)
    Task<PagedResult<PlatformUserDto>> GetPlatformUsersAsync(string? search, string? status, string? role, int? tenantId, string? identityType, int pageNumber, int pageSize, CancellationToken cancellationToken = default);
    Task<(bool Success, string Message, PlatformUserDto? User, string? ErrorCode)> CreatePlatformUserAsync(CreatePlatformUserRequest request, string currentUserName, CancellationToken cancellationToken = default);
    Task<(bool Success, string Message, string? ErrorCode)> UpdateUserStatusAsync(int id, string status, string? reason, string currentUserName, CancellationToken cancellationToken = default);
    Task<(bool Success, string Message, PlatformUserDto? User, string? ErrorCode)> AssignUserRolesAsync(int id, List<string> roles, string currentUserName, CancellationToken cancellationToken = default);
    Task<(bool Success, string Message, PlatformUserDto? User, string? ErrorCode)> AssignTenantAndAppAsync(int id, int? tenantId, string applicationId, string currentUserName, CancellationToken cancellationToken = default);
    Task<(bool Success, string Message, PlatformUserDto? User, string? ErrorCode)> ApproveUserRegistrationAsync(int id, ApproveUserRegistrationRequest? request, string currentUserName, CancellationToken cancellationToken = default);
    Task<(bool Success, string Message, PlatformUserDto? User, string? ErrorCode)> RejectUserRegistrationAsync(int id, string? reason, string currentUserName, CancellationToken cancellationToken = default);

    // Platform Audit (BR-05)
    Task<PagedResult<PlatformAuditLogDto>> GetPlatformAuditLogsAsync(PlatformAuditFilterRequest filter, CancellationToken cancellationToken = default);

    // Platform Settings (BR-06)
    Task<PlatformSettingsDto> GetPlatformSettingsAsync(CancellationToken cancellationToken = default);
    Task<(bool Success, string Message, PlatformSettingsDto? Settings, string? ErrorCode)> UpdatePlatformSettingsAsync(UpdatePlatformSettingsRequest request, string currentUserName, CancellationToken cancellationToken = default);
}
