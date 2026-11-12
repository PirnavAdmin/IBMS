using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Platform;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;

namespace Billing.Infrastructure.Services;

public class PlatformAdministrationService : IPlatformAdministrationService
{
    private const string PlatformSettingsCacheKey = "IBMS:PlatformSettings:Global";

    private readonly BillingDbContext _context;
    private readonly ITenantRepository _tenantRepository;
    private readonly IUserRepository _userRepository;
    private readonly IRoleRepository _roleRepository;
    private readonly IUserSessionRepository _userSessionRepository;
    private readonly IAuditLogRepository _auditLogRepository;
    private readonly ITenantProvisioningService _tenantProvisioningService;
    private readonly ILogger<PlatformAdministrationService>? _logger;
    private readonly ICurrentUserService? _currentUserService;
    private readonly IMemoryCache? _memoryCache;

    private static readonly ConcurrentDictionary<string, SemaphoreSlim> _tenantLocks = new();

    public PlatformAdministrationService(
        BillingDbContext context,
        ITenantRepository tenantRepository,
        IUserRepository userRepository,
        IRoleRepository roleRepository,
        IUserSessionRepository userSessionRepository,
        IAuditLogRepository auditLogRepository,
        ITenantProvisioningService tenantProvisioningService,
        ILogger<PlatformAdministrationService>? logger = null,
        ICurrentUserService? currentUserService = null,
        IMemoryCache? memoryCache = null)
    {
        _context = context;
        _tenantRepository = tenantRepository;
        _userRepository = userRepository;
        _roleRepository = roleRepository;
        _userSessionRepository = userSessionRepository;
        _auditLogRepository = auditLogRepository;
        _tenantProvisioningService = tenantProvisioningService;
        _logger = logger;
        _currentUserService = currentUserService;
        _memoryCache = memoryCache;
    }

    #region Dashboard (BR-02)

    public async Task<PlatformDashboardDto> GetDashboardSummaryAsync(CancellationToken cancellationToken = default)
    {
        var totalTenants = await _context.Tenants.CountAsync(t => t.Status != "PendingApproval" && t.Status != "Rejected", cancellationToken);
        var activeTenants = await _context.Tenants.CountAsync(t => t.Status == "Active", cancellationToken);
        var suspendedTenants = await _context.Tenants.CountAsync(t => t.Status == "Suspended", cancellationToken);
        var inactiveTenants = await _context.Tenants.CountAsync(t => t.Status == "Inactive", cancellationToken);

        var totalPlatformUsers = await _context.Users.CountAsync(u => u.Status != "PendingApproval" && u.Status != "Rejected", cancellationToken);
        var activePlatformUsers = await _context.Users.CountAsync(u => u.Status == "Active", cancellationToken);
        var pendingUserApprovals = await _context.Users.CountAsync(u => u.Status == "PendingApproval", cancellationToken);

        var recentTenantsRaw = await _context.Tenants
            .AsNoTracking()
            .Include(t => t.Users)
            .Where(t => t.Status != "PendingApproval" && t.Status != "Rejected")
            .OrderByDescending(t => t.CreatedAtUtc)
            .Take(5)
            .ToListAsync(cancellationToken);

        var recentTenants = recentTenantsRaw.Select(t => new PlatformTenantSummaryDto
        {
            Id = t.Id,
            Name = t.Name,
            TenantCode = t.TenantCode,
            CompanyEmail = t.CompanyEmail,
            Status = t.Status,
            CreatedAtUtc = t.CreatedAtUtc,
            UserCount = t.Users.Count,
            AdminEmail = t.Users.FirstOrDefault(u => u.RolesString.Contains("TenantAdmin") || u.RolesString.Contains("Admin"))?.Email
        }).ToList();

        var recentEventsRaw = await _context.AuditLogs
            .AsNoTracking()
            .Include(a => a.Tenant)
            .Where(a => a.EntityName == "Tenant" ||
                        a.EntityName == "User" ||
                        a.EntityName == "Role" ||
                        a.EntityName == "PlatformSettings")
            .OrderByDescending(a => a.Timestamp)
            .Take(10)
            .ToListAsync(cancellationToken);

        var recentAdminEvents = recentEventsRaw.Select(a => new PlatformAuditEventSummaryDto
        {
            Id = a.Id,
            Timestamp = a.Timestamp,
            Actor = a.UserName,
            Action = a.Action,
            EntityName = a.EntityName,
            EntityId = a.EntityId,
            TenantId = a.TenantId,
            TenantCode = a.Tenant?.TenantCode,
            Status = string.IsNullOrWhiteSpace(a.ResultStatus) ? "Success" : a.ResultStatus,
            Changes = a.Changes
        }).ToList();

        var definitions = new Dictionary<string, string>
        {
            { "Active", "Tenant workspace is fully operational; users can authenticate and execute permitted billing operations." },
            { "Suspended", "Tenant workspace is administratively suspended; users cannot authenticate, active sessions are revoked, and background dispatches are skipped." },
            { "Inactive", "Tenant workspace is deactivated; operational access is disabled." }
        };

        return new PlatformDashboardDto
        {
            TotalTenants = totalTenants,
            ActiveTenants = activeTenants,
            SuspendedTenants = suspendedTenants,
            InactiveTenants = inactiveTenants,
            TotalPlatformUsers = totalPlatformUsers,
            ActivePlatformUsers = activePlatformUsers,
            PendingUserApprovals = pendingUserApprovals,
            RecentTenants = recentTenants,
            RecentAdminEvents = recentAdminEvents,
            TenantStatusDefinitions = definitions
        };
    }

    #endregion

    #region Tenant Management (BR-03)

    public async Task<PagedResult<PlatformTenantDto>> GetTenantsAsync(string? search, string? status, int pageNumber, int pageSize, CancellationToken cancellationToken = default)
    {
        var page = pageNumber > 0 ? pageNumber : 1;
        var size = pageSize > 0 && pageSize <= 100 ? pageSize : 10;

        var (items, totalCount) = await _tenantRepository.GetPagedAsync(search, status, page, size);

        var tenantIds = items.Select(t => t.Id).ToList();

        var invoiceCounts = await _context.Invoices
            .AsNoTracking()
            .Where(i => tenantIds.Contains(i.TenantId))
            .GroupBy(i => i.TenantId)
            .Select(g => new { TenantId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.TenantId, g => g.Count, cancellationToken);

        var dtos = items.Select(t => new PlatformTenantDto
        {
            Id = t.Id,
            Name = t.Name,
            TenantCode = t.TenantCode,
            CompanyEmail = t.CompanyEmail,
            Phone = t.Phone,
            TaxId = t.TaxId,
            Address = t.Address,
            Status = t.Status,
            IsActive = t.IsActive,
            CreatedAtUtc = t.CreatedAtUtc,
            UpdatedAtUtc = t.UpdatedAtUtc ?? t.CreatedAtUtc,
            UserCount = t.Users.Count,
            InvoiceCount = invoiceCounts.TryGetValue(t.Id, out var invCount) ? invCount : 0
        }).ToList();

        return new PagedResult<PlatformTenantDto>(dtos, totalCount, page, size);
    }

    public async Task<PlatformTenantDetailDto?> GetTenantByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        var tenant = await _tenantRepository.GetByIdAsync(id);
        if (tenant == null) return null;

        var invoiceCount = await _context.Invoices.CountAsync(i => i.TenantId == id, cancellationToken);
        var customerCount = await _context.Customers.CountAsync(c => c.TenantId == id, cancellationToken);
        var admins = await _tenantRepository.GetTenantAdminsAsync(id);

        return new PlatformTenantDetailDto
        {
            Id = tenant.Id,
            Name = tenant.Name,
            TenantCode = tenant.TenantCode,
            CompanyEmail = tenant.CompanyEmail,
            Phone = tenant.Phone,
            TaxId = tenant.TaxId,
            Address = tenant.Address,
            Status = tenant.Status,
            IsActive = tenant.IsActive,
            CreatedAtUtc = tenant.CreatedAtUtc,
            UpdatedAtUtc = tenant.UpdatedAtUtc ?? tenant.CreatedAtUtc,
            UserCount = tenant.Users.Count,
            InvoiceCount = invoiceCount,
            CustomerCount = customerCount,
            AssignedAdmins = admins.Select(u => new TenantAdminUserDto
            {
                Id = u.Id,
                Name = u.Name,
                Email = u.Email,
                Username = u.Username,
                Status = u.Status,
                IsActive = u.IsActive,
                CreatedAtUtc = u.CreatedAtUtc,
                Roles = u.Roles
            }).ToList()
        };
    }

    public async Task<(bool Success, string Message, PlatformTenantDetailDto? Tenant, string? ErrorCode)> CreateTenantAsync(CreateTenantRequest request, string currentUserName, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length < 2)
        {
            return (false, "Tenant name is required (minimum 2 characters).", null, "VALIDATION_ERROR");
        }

        var normalizedCode = request.TenantCode.Trim().ToLowerInvariant();
        if (!Regex.IsMatch(normalizedCode, @"^[a-z0-9_-]{2,64}$"))
        {
            return (false, "Tenant code must be 2-64 characters and contain only letters, numbers, hyphens, or underscores.", null, "VALIDATION_ERROR");
        }

        var normalizedIdemKey = string.IsNullOrWhiteSpace(request.IdempotencyKey) ? null : request.IdempotencyKey.Trim();

        // Validate admin email if provided
        string? normalizedAdminEmail = null;
        if (!string.IsNullOrWhiteSpace(request.AdminEmail))
        {
            normalizedAdminEmail = request.AdminEmail.Trim().ToLowerInvariant();
            if (!Regex.IsMatch(normalizedAdminEmail, @"^[^@\s]+@[^@\s]+\.[^@\s]+$"))
            {
                return (false, "Invalid administrator email address format.", null, "VALIDATION_ERROR");
            }

            var existingUser = await _userRepository.GetByEmailAsync(normalizedAdminEmail);
            if (existingUser != null)
            {
                return (false, $"A user with email '{normalizedAdminEmail}' is already registered.", null, "CONFLICT_DUPLICATE_EMAIL");
            }

            // Enforce password policies from platform settings
            var currentSettings = await GetPlatformSettingsAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(request.AdminPassword) || request.AdminPassword.Length < currentSettings.PasswordMinLength)
            {
                return (false, $"Administrator password must be at least {currentSettings.PasswordMinLength} characters long.", null, "VALIDATION_ERROR");
            }
            if (currentSettings.RequireDigit && !request.AdminPassword.Any(char.IsDigit))
            {
                return (false, "Administrator password must contain at least one number.", null, "VALIDATION_ERROR");
            }
            if (currentSettings.RequireSpecialChar && !request.AdminPassword.Any(ch => !char.IsLetterOrDigit(ch)))
            {
                return (false, "Administrator password must contain at least one special character.", null, "VALIDATION_ERROR");
            }
        }

        var payloadToHash = $"{request.Name.Trim()}|{normalizedCode}|{request.CompanyEmail?.Trim()}|{request.Phone?.Trim()}|{request.TaxId?.Trim()}|{request.Address?.Trim()}|{normalizedAdminEmail}|{request.State?.Trim()}";
        using var sha = SHA256.Create();
        var payloadHash = Convert.ToHexString(sha.ComputeHash(Encoding.UTF8.GetBytes(payloadToHash)));

        var lockKey = normalizedIdemKey != null ? $"idem:{normalizedIdemKey}" : $"code:{normalizedCode}";
        var sem = _tenantLocks.GetOrAdd(lockKey, _ => new SemaphoreSlim(1, 1));
        await sem.WaitAsync(cancellationToken);
        try
        {
            if (normalizedIdemKey != null)
            {
                var existingByIdem = await _tenantRepository.GetByIdempotencyKeyAsync(normalizedIdemKey);
                if (existingByIdem != null)
                {
                    if (!string.Equals(existingByIdem.RequestPayloadHash, payloadHash, StringComparison.Ordinal))
                    {
                        return (false, "Idempotency key has already been used with a different tenant request payload.", null, "CONFLICT_IDEMPOTENCY_MISMATCH");
                    }

                    var existingDetail = await GetTenantByIdAsync(existingByIdem.Id, cancellationToken);
                    return (true, "Tenant created and master blueprint provisioned successfully.", existingDetail, null);
                }
            }

            if (await _tenantRepository.ExistsByCodeAsync(normalizedCode))
            {
                return (false, $"A tenant with code '{normalizedCode}' already exists.", null, "CONFLICT_DUPLICATE_CODE");
            }

            var tenant = new Tenant
            {
                Name = request.Name.Trim(),
                TenantCode = normalizedCode,
                CompanyEmail = string.IsNullOrWhiteSpace(request.CompanyEmail) ? null : request.CompanyEmail.Trim(),
                Phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim(),
                TaxId = string.IsNullOrWhiteSpace(request.TaxId) ? null : request.TaxId.Trim(),
                Address = string.IsNullOrWhiteSpace(request.Address) ? null : request.Address.Trim(),
                Status = (!string.IsNullOrWhiteSpace(request.Status) && TenantStatusValidator.IsValidStatus(request.Status))
                    ? TenantStatusValidator.Normalize(request.Status)
                    : "Active",
                IdempotencyKey = normalizedIdemKey,
                RequestPayloadHash = payloadHash,
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };

            await _tenantRepository.CreateAsync(tenant);

            // Auto-provision master data blueprints transactionally
            await _tenantProvisioningService.ProvisionTenantDefaultsAsync(tenant.Id, request.State, cancellationToken);

            // Provision initial TenantAdmin if requested
            User? adminUser = null;
            if (!string.IsNullOrWhiteSpace(normalizedAdminEmail) && !string.IsNullOrWhiteSpace(request.AdminPassword))
            {
                var adminName = !string.IsNullOrWhiteSpace(request.AdminName) ? request.AdminName.Trim() : "Tenant Administrator";
                var passwordHash = BCrypt.Net.BCrypt.HashPassword(request.AdminPassword);

                // Get permissions for TenantAdmin
                var allPerms = await _roleRepository.GetAllPermissionsAsync();
                var allPermCodes = allPerms.Select(p => p.Code).ToList();

                adminUser = new User
                {
                    Name = adminName,
                    Username = normalizedAdminEmail,
                    Email = normalizedAdminEmail,
                    PasswordHash = passwordHash,
                    TenantId = tenant.Id,
                    ApplicationId = "IBMS",
                    IdentityType = "Platform",
                    Status = (!string.IsNullOrWhiteSpace(request.Status) && TenantStatusValidator.IsValidStatus(request.Status))
                    ? TenantStatusValidator.Normalize(request.Status)
                    : "Active",
                    Roles = new List<string> { "TenantAdmin", "Admin" },
                    Permissions = allPermCodes,
                    CreatedAtUtc = DateTime.UtcNow
                };

                await _context.Users.AddAsync(adminUser, cancellationToken);
                await _context.SaveChangesAsync(cancellationToken);
            }

            // Record Audit event
            var audit = new AuditLog
            {
                TenantId = tenant.Id,
                EntityName = "Tenant",
                EntityId = tenant.Id.ToString(),
                Action = "TenantCreated",
                UserName = string.IsNullOrWhiteSpace(currentUserName) ? (_currentUserService?.UserName ?? "SuperAdmin") : currentUserName,
                ActorUserId = _currentUserService?.UserId,
                ActorRole = _currentUserService?.Role ?? "SuperAdmin",
                CorrelationId = _currentUserService?.CorrelationId,
                ResultStatus = "Success",
                Timestamp = DateTime.UtcNow,
                Changes = $"Tenant '{tenant.Name}' ({tenant.TenantCode}) created and master blueprint auto-provisioned." +
                          (adminUser != null ? $" Initial admin '{adminUser.Email}' created." : "")
            };
            await _auditLogRepository.AddAsync(audit, cancellationToken);

            var detail = await GetTenantByIdAsync(tenant.Id, cancellationToken);
            return (true, "Tenant created and master blueprint provisioned successfully.", detail, null);
        }
        finally
        {
            sem.Release();
        }
    }

    public async Task<(bool Success, string Message, PlatformTenantDetailDto? Tenant, string? ErrorCode)> UpdateTenantAsync(int id, UpdateTenantRequest request, string currentUserName, CancellationToken cancellationToken = default)
    {
        var tenant = await _tenantRepository.GetByIdAsync(id);
        if (tenant == null)
        {
            return (false, "Tenant not found.", null, "NOT_FOUND");
        }

        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length < 2)
        {
            return (false, "Tenant name is required (minimum 2 characters).", null, "VALIDATION_ERROR");
        }

        // Reliable Atomic Concurrency Protection: strict match, no tolerance
        if (request.ExpectedUpdatedAtUtc.HasValue)
        {
            var currentConcurrencyStamp = tenant.UpdatedAtUtc ?? tenant.CreatedAtUtc;
            if (currentConcurrencyStamp != request.ExpectedUpdatedAtUtc.Value)
            {
                return (false, "A concurrency conflict occurred. The tenant was modified by another administrator. Please reload.", null, "CONCURRENCY_CONFLICT");
            }
        }

        var oldSnapshot = JsonSerializer.Serialize(new
        {
            tenant.Name,
            tenant.CompanyEmail,
            tenant.Phone,
            tenant.TaxId,
            tenant.Address
        });

        tenant.Name = request.Name.Trim();
        tenant.CompanyEmail = string.IsNullOrWhiteSpace(request.CompanyEmail) ? null : request.CompanyEmail.Trim();
        tenant.Phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();
        tenant.TaxId = string.IsNullOrWhiteSpace(request.TaxId) ? null : request.TaxId.Trim();
        tenant.Address = string.IsNullOrWhiteSpace(request.Address) ? null : request.Address.Trim();

        string? statusTransitionedTo = null;
        if (!string.IsNullOrWhiteSpace(request.Status) && TenantStatusValidator.IsValidStatus(request.Status))
        {
            var targetStatus = TenantStatusValidator.Normalize(request.Status);
            if (!string.Equals(tenant.Status, targetStatus, StringComparison.OrdinalIgnoreCase))
            {
                tenant.Status = targetStatus;
                statusTransitionedTo = targetStatus;
            }
        }

        if (request.ExpectedUpdatedAtUtc.HasValue)
        {
            _context.Entry(tenant).Property(t => t.UpdatedAtUtc).OriginalValue = request.ExpectedUpdatedAtUtc.Value;
        }
        tenant.UpdatedAtUtc = DateTime.UtcNow;

        try
        {
            await _tenantRepository.UpdateAsync(tenant);
            if (statusTransitionedTo is "Suspended" or "Inactive")
            {
                await _userSessionRepository.RevokeAllSessionsForTenantAsync(tenant.Id, $"Tenant status transitioned to {statusTransitionedTo} via tenant update.");
                _logger?.LogInformation("Revoked all active sessions for tenant {TenantId} due to status transition to {Status}", tenant.Id, statusTransitionedTo);
            }
        }
        catch (DbUpdateConcurrencyException)
        {
            return (false, "A concurrency conflict occurred. The tenant was modified by another administrator. Please reload.", null, "CONCURRENCY_CONFLICT");
        }

        var newSnapshot = JsonSerializer.Serialize(new
        {
            tenant.Name,
            tenant.CompanyEmail,
            tenant.Phone,
            tenant.TaxId,
            tenant.Address
        });

        var audit = new AuditLog
        {
            TenantId = tenant.Id,
            EntityName = "Tenant",
            EntityId = tenant.Id.ToString(),
            Action = "TenantUpdated",
            UserName = string.IsNullOrWhiteSpace(currentUserName) ? (_currentUserService?.UserName ?? "SuperAdmin") : currentUserName,
            ActorUserId = _currentUserService?.UserId,
            ActorRole = _currentUserService?.Role ?? "SuperAdmin",
            CorrelationId = _currentUserService?.CorrelationId,
            ResultStatus = "Success",
            Timestamp = DateTime.UtcNow,
            Changes = $"Tenant details updated for '{tenant.Name}'.",
            OldValues = oldSnapshot,
            NewValues = newSnapshot
        };
        await _auditLogRepository.AddAsync(audit, cancellationToken);

        var detail = await GetTenantByIdAsync(tenant.Id, cancellationToken);
        return (true, "Tenant updated successfully.", detail, null);
    }

    public async Task<(bool Success, string Message, PlatformTenantDto? Tenant, string? ErrorCode)> UpdateTenantStatusAsync(int id, UpdateTenantStatusRequest request, string currentUserName, CancellationToken cancellationToken = default)
    {
        var tenant = await _tenantRepository.GetByIdAsync(id);
        if (tenant == null)
        {
            return (false, "Tenant not found.", null, "NOT_FOUND");
        }

        if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length < 5)
        {
            return (false, "A valid reason (minimum 5 characters) is required for status transition.", null, "VALIDATION_ERROR");
        }

        if (!TenantStatusValidator.IsValidStatus(request.Status))
        {
            return (false, $"Invalid status: '{request.Status}'. Valid statuses are: Active, Suspended, Inactive.", null, "VALIDATION_ERROR");
        }

        var targetStatus = TenantStatusValidator.Normalize(request.Status);
        if (!TenantStatusValidator.CanTransition(tenant.Status, targetStatus, out var transitionError))
        {
            return (false, transitionError!, null, "INVALID_STATUS_TRANSITION");
        }

        var oldStatus = tenant.Status;
        tenant.Status = targetStatus;
        tenant.UpdatedAtUtc = DateTime.UtcNow;

        await _tenantRepository.UpdateAsync(tenant);

        // Immediate cascade: If Suspended or Inactive, terminate all active sessions for all users of this tenant
        if (targetStatus is "Suspended" or "Inactive")
        {
            await _userSessionRepository.RevokeAllSessionsForTenantAsync(tenant.Id, $"Tenant status transitioned to {targetStatus}. Reason: {request.Reason}");
            _logger?.LogInformation("Revoked all active sessions for tenant {TenantId} due to status transition to {Status}", tenant.Id, targetStatus);
        }

        var audit = new AuditLog
        {
            TenantId = tenant.Id,
            EntityName = "Tenant",
            EntityId = tenant.Id.ToString(),
            Action = $"TenantStatusChanged_{targetStatus}",
            UserName = string.IsNullOrWhiteSpace(currentUserName) ? (_currentUserService?.UserName ?? "SuperAdmin") : currentUserName,
            ActorUserId = _currentUserService?.UserId,
            ActorRole = _currentUserService?.Role ?? "SuperAdmin",
            CorrelationId = _currentUserService?.CorrelationId,
            ResultStatus = "Success",
            Timestamp = DateTime.UtcNow,
            Changes = $"Tenant status changed from '{oldStatus}' to '{targetStatus}'. Reason: {request.Reason.Trim()}"
        };
        await _auditLogRepository.AddAsync(audit, cancellationToken);

        var dto = new PlatformTenantDto
        {
            Id = tenant.Id,
            Name = tenant.Name,
            TenantCode = tenant.TenantCode,
            CompanyEmail = tenant.CompanyEmail,
            Phone = tenant.Phone,
            TaxId = tenant.TaxId,
            Address = tenant.Address,
            Status = tenant.Status,
            IsActive = tenant.IsActive,
            CreatedAtUtc = tenant.CreatedAtUtc,
            UpdatedAtUtc = tenant.UpdatedAtUtc,
            UserCount = tenant.Users.Count
        };

        return (true, $"Tenant status successfully changed to '{targetStatus}'.", dto, null);
    }

    public async Task<List<TenantAdminUserDto>> GetTenantAdminsAsync(int id, CancellationToken cancellationToken = default)
    {
        var admins = await _tenantRepository.GetTenantAdminsAsync(id);
        return admins.Select(u => new TenantAdminUserDto
        {
            Id = u.Id,
            Name = u.Name,
            Email = u.Email,
            Username = u.Username,
            Status = u.Status,
            IsActive = u.IsActive,
            CreatedAtUtc = u.CreatedAtUtc,
            Roles = u.Roles
        }).ToList();
    }

    #endregion

    #region Platform User Management (BR-04)

    public async Task<PagedResult<PlatformUserDto>> GetPlatformUsersAsync(string? search, string? status, string? role, int? tenantId, string? identityType, int pageNumber, int pageSize, CancellationToken cancellationToken = default)
    {
        var page = pageNumber > 0 ? pageNumber : 1;
        var size = pageSize > 0 && pageSize <= 100 ? pageSize : 20;

        var (users, totalCount) = await _userRepository.GetPagedUsersAsync(
            search,
            status,
            role,
            tenantId,
            identityType,
            page,
            size
        );

        var dtos = users.Select(u => new PlatformUserDto
        {
            Id = u.Id,
            Name = u.Name,
            Username = u.Username,
            Email = u.Email,
            TenantId = u.TenantId,
            TenantCode = u.Tenant?.TenantCode,
            TenantName = u.Tenant?.Name,
            ApplicationId = u.ApplicationId,
            Status = u.Status,
            IsActive = u.IsActive,
            IdentityType = u.IdentityType,
            Roles = u.Roles,
            Permissions = u.Permissions,
            CreatedAtUtc = u.CreatedAtUtc,
            UpdatedAtUtc = u.UpdatedAtUtc
        }).ToList();

        return new PagedResult<PlatformUserDto>(dtos, totalCount, page, size);
    }

    public async Task<(bool Success, string Message, PlatformUserDto? User, string? ErrorCode)> CreatePlatformUserAsync(CreatePlatformUserRequest request, string currentUserName, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length < 2)
        {
            return (false, "A valid name (at least 2 characters) is required.", null, "VALIDATION_ERROR");
        }

        if (string.IsNullOrWhiteSpace(request.Email) || !Regex.IsMatch(request.Email.Trim(), @"^[^@\s]+@[^@\s]+\.[^@\s]+$"))
        {
            return (false, "A valid email address is required.", null, "VALIDATION_ERROR");
        }

        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var existing = await _userRepository.GetByEmailAsync(normalizedEmail);
        if (existing != null)
        {
            return (false, "A user with this email address is already registered.", null, "CONFLICT_DUPLICATE_EMAIL");
        }

        // Validate password against platform policy
        var settings = await GetPlatformSettingsAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < settings.PasswordMinLength)
        {
            return (false, $"Password must be at least {settings.PasswordMinLength} characters long.", null, "VALIDATION_ERROR");
        }
        if (settings.RequireDigit && !request.Password.Any(char.IsDigit))
        {
            return (false, "Password must contain at least one number.", null, "VALIDATION_ERROR");
        }
        if (settings.RequireSpecialChar && !request.Password.Any(ch => !char.IsLetterOrDigit(ch)))
        {
            return (false, "Password must contain at least one special character.", null, "VALIDATION_ERROR");
        }

        var passwordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);

        var roles = request.Roles != null && request.Roles.Any()
            ? request.Roles.Select(r => r.Trim()).Distinct().ToList()
            : new List<string> { "SuperAdmin" };

        var allPerms = await _roleRepository.GetAllPermissionsAsync();
        var permissions = allPerms.Select(p => p.Code).Distinct().ToList();

        var user = new User
        {
            Name = request.Name.Trim(),
            Username = normalizedEmail,
            Email = normalizedEmail,
            PasswordHash = passwordHash,
            TenantId = request.TenantId,
            ApplicationId = string.IsNullOrWhiteSpace(request.ApplicationId) ? "IBMS" : request.ApplicationId.Trim(),
            IdentityType = string.IsNullOrWhiteSpace(request.IdentityType) ? "Platform" : request.IdentityType.Trim(),
            Status = "Active",
            Roles = roles,
            Permissions = permissions,
            CreatedAtUtc = DateTime.UtcNow
        };

        await _userRepository.AddAsync(user);

        var audit = new AuditLog
        {
            TenantId = user.TenantId ?? 1,
            EntityName = "User",
            EntityId = user.Id.ToString(),
            Action = "UserCreated",
            UserName = string.IsNullOrWhiteSpace(currentUserName) ? (_currentUserService?.UserName ?? "SuperAdmin") : currentUserName,
            ActorUserId = _currentUserService?.UserId,
            ActorRole = _currentUserService?.Role ?? "SuperAdmin",
            CorrelationId = _currentUserService?.CorrelationId,
            ResultStatus = "Success",
            Timestamp = DateTime.UtcNow,
            Changes = $"Platform user '{user.Email}' created with roles: {string.Join(", ", roles)}"
        };
        await _auditLogRepository.AddAsync(audit, cancellationToken);

        var dto = new PlatformUserDto
        {
            Id = user.Id,
            Name = user.Name,
            Username = user.Username,
            Email = user.Email,
            TenantId = user.TenantId,
            ApplicationId = user.ApplicationId,
            Status = user.Status,
            IsActive = user.IsActive,
            IdentityType = user.IdentityType,
            Roles = user.Roles,
            Permissions = user.Permissions,
            CreatedAtUtc = user.CreatedAtUtc
        };

        return (true, "Platform user created successfully.", dto, null);
    }

    public async Task<(bool Success, string Message, string? ErrorCode)> UpdateUserStatusAsync(int id, string status, string? reason, string currentUserName, CancellationToken cancellationToken = default)
    {
        var user = await _userRepository.GetByIdAsync(id);
        if (user == null)
        {
            return (false, "User not found.", "NOT_FOUND");
        }

        var normalizedStatus = status?.Trim() switch
        {
            var s when string.Equals(s, "Inactive", StringComparison.OrdinalIgnoreCase) => "Inactive",
            var s when string.Equals(s, "Suspended", StringComparison.OrdinalIgnoreCase) => "Suspended",
            var s when string.Equals(s, "Rejected", StringComparison.OrdinalIgnoreCase) => "Rejected",
            var s when string.Equals(s, "PendingApproval", StringComparison.OrdinalIgnoreCase) => "PendingApproval",
            _ => "Active"
        };

        // Last SuperAdmin lockout protection
        if (!string.Equals(normalizedStatus, "Active", StringComparison.OrdinalIgnoreCase) && user.Roles.Contains("SuperAdmin"))
        {
            var otherActiveSuperAdmins = await _context.Users
                .CountAsync(u => u.Id != id && u.Status == "Active" && u.RolesString.Contains("SuperAdmin"), cancellationToken);

            if (otherActiveSuperAdmins == 0)
            {
                return (false, "Cannot deactivate or disable the last active Super Admin account.", "LAST_SUPERADMIN_LOCKOUT_PROTECTION");
            }
        }

        user.Status = normalizedStatus;
        user.UpdatedAtUtc = DateTime.UtcNow;

        await _userRepository.UpdateAsync(user);

        if (normalizedStatus == "Inactive")
        {
            await _userSessionRepository.RevokeAllUserSessionsAsync(id, $"User status set to Inactive. {reason}".Trim());
        }

        var audit = new AuditLog
        {
            TenantId = user.TenantId ?? 1,
            EntityName = "User",
            EntityId = user.Id.ToString(),
            Action = "UserStatusChanged",
            UserName = string.IsNullOrWhiteSpace(currentUserName) ? (_currentUserService?.UserName ?? "SuperAdmin") : currentUserName,
            ActorUserId = _currentUserService?.UserId,
            ActorRole = _currentUserService?.Role ?? "SuperAdmin",
            CorrelationId = _currentUserService?.CorrelationId,
            ResultStatus = "Success",
            Timestamp = DateTime.UtcNow,
            Changes = $"User '{user.Email}' status changed to '{normalizedStatus}'. Reason: {reason}"
        };
        await _auditLogRepository.AddAsync(audit, cancellationToken);

        return (true, $"User status changed to '{normalizedStatus}' successfully.", null);
    }

    public async Task<(bool Success, string Message, PlatformUserDto? User, string? ErrorCode)> AssignUserRolesAsync(int id, List<string> roles, string currentUserName, CancellationToken cancellationToken = default)
    {
        var user = await _userRepository.GetByIdAsync(id);
        if (user == null)
        {
            return (false, "User not found.", null, "NOT_FOUND");
        }

        var cleanRoles = roles != null && roles.Any()
            ? roles.Select(r => r.Trim()).Distinct().ToList()
            : new List<string> { "User" };

        // Last SuperAdmin lockout protection: If user was SuperAdmin and new roles strip it
        if (user.Roles.Contains("SuperAdmin") && !cleanRoles.Contains("SuperAdmin"))
        {
            var otherActiveSuperAdmins = await _context.Users
                .CountAsync(u => u.Id != id && u.Status == "Active" && u.RolesString.Contains("SuperAdmin"), cancellationToken);

            if (otherActiveSuperAdmins == 0)
            {
                return (false, "Cannot remove the SuperAdmin role from the last active Super Admin account.", null, "LAST_SUPERADMIN_LOCKOUT_PROTECTION");
            }
        }

        var oldRoles = string.Join(", ", user.Roles);
        user.Roles = cleanRoles;

        // Sync permissions
        var allPerms = await _roleRepository.GetAllPermissionsAsync();
        if (cleanRoles.Any(r => r is "SuperAdmin" or "TenantAdmin" or "Admin"))
        {
            user.Permissions = allPerms.Select(p => p.Code).Distinct().ToList();
        }
        else
        {
            user.Permissions = new List<string> { "billing.view", "invoices.view" };
        }

        user.UpdatedAtUtc = DateTime.UtcNow;
        await _userRepository.UpdateAsync(user);

        // Revoke active sessions to promptly enforce role changes on next request
        await _userSessionRepository.RevokeAllUserSessionsAsync(id, "Roles updated by administrator; re-authentication required.");

        var audit = new AuditLog
        {
            TenantId = user.TenantId ?? 1,
            EntityName = "User",
            EntityId = user.Id.ToString(),
            Action = "UserRolesAssigned",
            UserName = string.IsNullOrWhiteSpace(currentUserName) ? (_currentUserService?.UserName ?? "SuperAdmin") : currentUserName,
            ActorUserId = _currentUserService?.UserId,
            ActorRole = _currentUserService?.Role ?? "SuperAdmin",
            CorrelationId = _currentUserService?.CorrelationId,
            ResultStatus = "Success",
            Timestamp = DateTime.UtcNow,
            Changes = $"User '{user.Email}' roles updated from [{oldRoles}] to [{string.Join(", ", cleanRoles)}]."
        };
        await _auditLogRepository.AddAsync(audit, cancellationToken);

        var updated = await _userRepository.GetByIdAsync(id);
        var dto = new PlatformUserDto
        {
            Id = updated!.Id,
            Name = updated.Name,
            Username = updated.Username,
            Email = updated.Email,
            TenantId = updated.TenantId,
            TenantCode = updated.Tenant?.TenantCode,
            TenantName = updated.Tenant?.Name,
            ApplicationId = updated.ApplicationId,
            Status = updated.Status,
            IsActive = updated.IsActive,
            IdentityType = updated.IdentityType,
            Roles = updated.Roles,
            Permissions = updated.Permissions,
            CreatedAtUtc = updated.CreatedAtUtc,
            UpdatedAtUtc = updated.UpdatedAtUtc
        };

        return (true, "Roles assigned and permissions synchronized successfully.", dto, null);
    }

    public async Task<(bool Success, string Message, PlatformUserDto? User, string? ErrorCode)> AssignTenantAndAppAsync(int id, int? tenantId, string applicationId, string currentUserName, CancellationToken cancellationToken = default)
    {
        var user = await _userRepository.GetByIdAsync(id);
        if (user == null)
        {
            return (false, "User not found.", null, "NOT_FOUND");
        }

        if (tenantId.HasValue && tenantId.Value > 0)
        {
            var tenant = await _tenantRepository.GetByIdAsync(tenantId.Value);
            if (tenant == null)
            {
                return (false, "Target tenant not found.", null, "NOT_FOUND");
            }
        }

        var oldTenantId = user.TenantId;
        user.TenantId = tenantId;
        user.ApplicationId = string.IsNullOrWhiteSpace(applicationId) ? "IBMS" : applicationId.Trim();
        user.UpdatedAtUtc = DateTime.UtcNow;

        await _userRepository.UpdateAsync(user);

        // Revoke active sessions to apply new tenant context
        await _userSessionRepository.RevokeAllUserSessionsAsync(id, "Tenant assignment updated by platform administrator.");

        var audit = new AuditLog
        {
            TenantId = tenantId ?? 1,
            EntityName = "User",
            EntityId = user.Id.ToString(),
            Action = "UserTenantReassigned",
            UserName = string.IsNullOrWhiteSpace(currentUserName) ? (_currentUserService?.UserName ?? "SuperAdmin") : currentUserName,
            ActorUserId = _currentUserService?.UserId,
            ActorRole = _currentUserService?.Role ?? "SuperAdmin",
            CorrelationId = _currentUserService?.CorrelationId,
            ResultStatus = "Success",
            Timestamp = DateTime.UtcNow,
            Changes = $"User '{user.Email}' reassigned from Tenant {oldTenantId} to Tenant {tenantId} (App: {user.ApplicationId})."
        };
        await _auditLogRepository.AddAsync(audit, cancellationToken);

        var updated = await _userRepository.GetByIdAsync(id);
        var dto = new PlatformUserDto
        {
            Id = updated!.Id,
            Name = updated.Name,
            Username = updated.Username,
            Email = updated.Email,
            TenantId = updated.TenantId,
            TenantCode = updated.Tenant?.TenantCode,
            TenantName = updated.Tenant?.Name,
            ApplicationId = updated.ApplicationId,
            Status = updated.Status,
            IsActive = updated.IsActive,
            IdentityType = updated.IdentityType,
            Roles = updated.Roles,
            Permissions = updated.Permissions,
            CreatedAtUtc = updated.CreatedAtUtc,
            UpdatedAtUtc = updated.UpdatedAtUtc
        };

        return (true, "User tenant and application assignment updated successfully.", dto, null);
    }

    public async Task<(bool Success, string Message, PlatformUserDto? User, string? ErrorCode)> ApproveUserRegistrationAsync(int id, ApproveUserRegistrationRequest? request, string currentUserName, CancellationToken cancellationToken = default)
    {
        var user = await _userRepository.GetByIdAsync(id);
        if (user == null)
        {
            return (false, "User not found.", null, "NOT_FOUND");
        }

        Tenant? resolvedTenant = null;
        if (request?.TenantId is > 1)
        {
            resolvedTenant = await _tenantRepository.GetByIdAsync(request.TenantId.Value);
            if (resolvedTenant == null)
            {
                return (false, "Target tenant not found.", null, "NOT_FOUND");
            }
        }
        else if (user.TenantId is > 1)
        {
            resolvedTenant = await _tenantRepository.GetByIdAsync(user.TenantId.Value);
        }

        if (resolvedTenant == null)
        {
            var requestedCompany = !string.IsNullOrWhiteSpace(request?.CompanyName)
                ? request.CompanyName.Trim()
                : $"{user.Name.Trim()} Organization";
            var baseSlug = Regex.Replace(requestedCompany.ToLowerInvariant(), @"[^a-z0-9]+", "-").Trim('-');
            if (string.IsNullOrWhiteSpace(baseSlug) || baseSlug.Length < 2) baseSlug = "company";
            if (baseSlug.Length > 52) baseSlug = baseSlug[..52].TrimEnd('-');
            var tenantCode = baseSlug;
            var suffix = 2;
            while (await _tenantRepository.ExistsByCodeAsync(tenantCode))
            {
                tenantCode = $"{baseSlug}-{suffix}";
                suffix++;
            }

            resolvedTenant = new Tenant
            {
                Name = requestedCompany,
                TenantCode = tenantCode,
                CompanyEmail = user.Email,
                Status = "Active",
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };
            await _tenantRepository.CreateAsync(resolvedTenant);
        }
        else
        {
            if (!string.IsNullOrWhiteSpace(request?.CompanyName) &&
                string.IsNullOrWhiteSpace(resolvedTenant.Name))
            {
                resolvedTenant.Name = request.CompanyName.Trim();
            }

            if (!resolvedTenant.IsActive)
            {
                resolvedTenant.Status = "Active";
                resolvedTenant.UpdatedAtUtc = DateTime.UtcNow;
            }
            await _context.SaveChangesAsync(cancellationToken);
        }

        user.TenantId = resolvedTenant.Id;
        await _tenantProvisioningService.ProvisionTenantDefaultsAsync(resolvedTenant.Id, null, cancellationToken);

        List<string> assignedRoles;
        if (string.Equals(user.IdentityType, "SelfRegistered", StringComparison.OrdinalIgnoreCase))
        {
            assignedRoles = new List<string> { "TenantAdmin" };
        }
        else
        {
            assignedRoles = request?.Roles != null && request.Roles.Any(r => !string.IsNullOrWhiteSpace(r))
                ? request.Roles.Select(r => r.Trim()).Where(r => !string.Equals(r, "SuperAdmin", StringComparison.OrdinalIgnoreCase)).Distinct(StringComparer.OrdinalIgnoreCase).ToList()
                : new List<string> { "TenantAdmin" };

            if (!assignedRoles.Any())
            {
                assignedRoles = new List<string> { "TenantAdmin" };
            }
        }

        user.Roles = assignedRoles;

        // Resolve role permissions from tenant/system roles
        var tenantRoles = await _roleRepository.GetAllAsync(user.TenantId);
        var matchedPermissions = tenantRoles
            .Where(r => assignedRoles.Contains(r.Name, StringComparer.OrdinalIgnoreCase))
            .SelectMany(r => r.RolePermissions.Where(rp => rp.Permission != null).Select(rp => rp.Permission!.Code))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (!matchedPermissions.Any())
        {
            if (assignedRoles.Any(r => string.Equals(r, "TenantAdmin", StringComparison.OrdinalIgnoreCase) || string.Equals(r, "Admin", StringComparison.OrdinalIgnoreCase)))
            {
                var allPerms = await _roleRepository.GetAllPermissionsAsync();
                matchedPermissions = allPerms.Select(p => p.Code).Distinct().ToList();
            }
            else
            {
                matchedPermissions = new List<string> { "billing.view", "billing.create" };
            }
        }

        user.Permissions = matchedPermissions;
        user.Status = "Active";
        user.UpdatedAtUtc = DateTime.UtcNow;

        await _userRepository.UpdateAsync(user);

        var noteText = string.IsNullOrWhiteSpace(request?.Note) ? string.Empty : $" Note: {request.Note.Trim()}";
        var audit = new AuditLog
        {
            TenantId = user.TenantId ?? 1,
            EntityName = "User",
            EntityId = user.Id.ToString(),
            Action = "UserRegistrationApproved",
            UserName = string.IsNullOrWhiteSpace(currentUserName) ? (_currentUserService?.UserName ?? "SuperAdmin") : currentUserName,
            ActorUserId = _currentUserService?.UserId,
            ActorRole = _currentUserService?.Role ?? "SuperAdmin",
            CorrelationId = _currentUserService?.CorrelationId,
            ResultStatus = "Success",
            Timestamp = DateTime.UtcNow,
            Changes = $"SuperAdmin approved account '{user.Email}' with roles [{string.Join(", ", assignedRoles)}] under Tenant {user.TenantId}.{noteText}"
        };
        await _auditLogRepository.AddAsync(audit, cancellationToken);

        var tenantAudit = new AuditLog
        {
            TenantId = resolvedTenant.Id,
            EntityName = "Tenant",
            EntityId = resolvedTenant.Id.ToString(),
            Action = "TenantApproved",
            UserName = string.IsNullOrWhiteSpace(currentUserName) ? (_currentUserService?.UserName ?? "SuperAdmin") : currentUserName,
            ActorUserId = _currentUserService?.UserId,
            ActorRole = _currentUserService?.Role ?? "SuperAdmin",
            CorrelationId = _currentUserService?.CorrelationId,
            ResultStatus = "Success",
            Timestamp = DateTime.UtcNow,
            Changes = $"Tenant '{resolvedTenant.Name}' ({resolvedTenant.TenantCode}) approved and activated for owner '{user.Email}'."
        };
        await _auditLogRepository.AddAsync(tenantAudit, cancellationToken);

        var updated = await _userRepository.GetByIdAsync(id) ?? user;
        var dto = new PlatformUserDto
        {
            Id = updated.Id,
            Name = updated.Name,
            Username = updated.Username,
            Email = updated.Email,
            TenantId = updated.TenantId,
            TenantCode = updated.Tenant?.TenantCode,
            TenantName = updated.Tenant?.Name,
            ApplicationId = updated.ApplicationId,
            Status = updated.Status,
            IsActive = updated.IsActive,
            IdentityType = updated.IdentityType,
            Roles = updated.Roles,
            Permissions = updated.Permissions,
            CreatedAtUtc = updated.CreatedAtUtc,
            UpdatedAtUtc = updated.UpdatedAtUtc
        };

        return (true, "Account approved and permission granted. The user can now sign in.", dto, null);
    }

    public async Task<(bool Success, string Message, PlatformUserDto? User, string? ErrorCode)> RejectUserRegistrationAsync(int id, string? reason, string currentUserName, CancellationToken cancellationToken = default)
    {
        var user = await _userRepository.GetByIdAsync(id);
        if (user == null)
        {
            return (false, "User not found.", null, "NOT_FOUND");
        }

        if (user.Roles.Contains("SuperAdmin"))
        {
            var otherActiveSuperAdmins = await _context.Users
                .CountAsync(u => u.Id != id && u.Status == "Active" && u.RolesString.Contains("SuperAdmin"), cancellationToken);

            if (otherActiveSuperAdmins == 0)
            {
                return (false, "Cannot reject or disable the last active Super Admin account.", null, "LAST_SUPERADMIN_LOCKOUT_PROTECTION");
            }
        }

        user.Status = "Rejected";
        user.UpdatedAtUtc = DateTime.UtcNow;

        await _userRepository.UpdateAsync(user);
        await _userSessionRepository.RevokeAllUserSessionsAsync(id, $"Registration rejected by SuperAdmin. {reason}".Trim());

        if (user.TenantId is > 1)
        {
            var pendingTenant = await _tenantRepository.GetByIdAsync(user.TenantId.Value);
            if (pendingTenant != null && string.Equals(pendingTenant.Status, "PendingApproval", StringComparison.OrdinalIgnoreCase))
            {
                pendingTenant.Status = "Rejected";
                pendingTenant.UpdatedAtUtc = DateTime.UtcNow;
                await _tenantRepository.UpdateAsync(pendingTenant);
            }
        }

        var audit = new AuditLog
        {
            TenantId = user.TenantId ?? 1,
            EntityName = "User",
            EntityId = user.Id.ToString(),
            Action = "UserRegistrationRejected",
            UserName = string.IsNullOrWhiteSpace(currentUserName) ? (_currentUserService?.UserName ?? "SuperAdmin") : currentUserName,
            ActorUserId = _currentUserService?.UserId,
            ActorRole = _currentUserService?.Role ?? "SuperAdmin",
            CorrelationId = _currentUserService?.CorrelationId,
            ResultStatus = "Success",
            Timestamp = DateTime.UtcNow,
            Changes = $"SuperAdmin declined registration for '{user.Email}'. Reason: {reason?.Trim() ?? "Not specified"}"
        };
        await _auditLogRepository.AddAsync(audit, cancellationToken);

        var updated = await _userRepository.GetByIdAsync(id) ?? user;
        var dto = new PlatformUserDto
        {
            Id = updated.Id,
            Name = updated.Name,
            Username = updated.Username,
            Email = updated.Email,
            TenantId = updated.TenantId,
            TenantCode = updated.Tenant?.TenantCode,
            TenantName = updated.Tenant?.Name,
            ApplicationId = updated.ApplicationId,
            Status = updated.Status,
            IsActive = updated.IsActive,
            IdentityType = updated.IdentityType,
            Roles = updated.Roles,
            Permissions = updated.Permissions,
            CreatedAtUtc = updated.CreatedAtUtc,
            UpdatedAtUtc = updated.UpdatedAtUtc
        };

        return (true, "Account request declined. Login access remains blocked.", dto, null);
    }

    #endregion

    #region Platform Audit (BR-05)

    public async Task<PagedResult<PlatformAuditLogDto>> GetPlatformAuditLogsAsync(PlatformAuditFilterRequest filter, CancellationToken cancellationToken = default)
    {
        var (logs, totalCount) = await _auditLogRepository.GetPlatformAuditLogsPagedAsync(filter, cancellationToken);

        var dtos = logs.Select(a => new PlatformAuditLogDto
        {
            Id = a.Id,
            Timestamp = a.Timestamp,
            ActorUserId = a.ActorUserId,
            ActorUserName = a.UserName,
            ActorRole = a.ActorRole,
            Action = a.Action,
            EntityType = a.EntityName,
            EntityId = a.EntityId,
            TenantId = a.TenantId,
            TenantCode = a.Tenant?.TenantCode,
            TenantName = a.Tenant?.Name,
            ResultStatus = string.IsNullOrWhiteSpace(a.ResultStatus) ? "Success" : a.ResultStatus,
            CorrelationId = a.CorrelationId,
            Changes = a.Changes,
            OldValues = SanitizeSecretPayloads(a.OldValues),
            NewValues = SanitizeSecretPayloads(a.NewValues)
        }).ToList();

        var page = filter.PageNumber > 0 ? filter.PageNumber : 1;
        var size = filter.PageSize > 0 ? filter.PageSize : 20;

        return new PagedResult<PlatformAuditLogDto>(dtos, totalCount, page, size);
    }

    private static string? SanitizeSecretPayloads(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return json;

        // Redact any occurrences of Password, PasswordHash, SecretKey, Token, RefreshToken
        var sanitized = Regex.Replace(json, @"(""(?:password|passwordHash|secret|token|refreshToken)""\s*:\s*"")[^""]*("")", "$1[REDACTED]$2", RegexOptions.IgnoreCase);
        return sanitized;
    }

    #endregion

    #region Platform Settings (BR-06)

    public async Task<PlatformSettingsDto> GetPlatformSettingsAsync(CancellationToken cancellationToken = default)
    {
        if (_memoryCache != null && _memoryCache.TryGetValue<PlatformSettingsDto>(PlatformSettingsCacheKey, out var cached) && cached != null)
        {
            return ClonePlatformSettingsDto(cached);
        }

        var setting = await _context.PlatformSettings.FirstOrDefaultAsync(s => s.Id == 1, cancellationToken);
        if (setting == null)
        {
            setting = new PlatformSetting
            {
                Id = 1,
                PlatformName = "IBMS Platform",
                MaintenanceMode = false,
                AllowSelfRegistration = true,
                SessionTimeoutMinutes = 1440,
                InactivityTimeoutMinutes = 60,
                PasswordMinLength = 8,
                RequireDigit = true,
                RequireSpecialChar = true,
                SupportedCurrenciesJson = "[\"INR\",\"USD\",\"EUR\",\"GBP\",\"AED\",\"AUD\",\"CAD\",\"SGD\",\"JPY\",\"CHF\",\"CNY\",\"NZD\",\"SAR\",\"QAR\",\"KWD\",\"ZAR\"]",
                AccountRecoveryContact = "support@ibms.com",
                UpdatedAtUtc = DateTime.UtcNow,
                UpdatedBy = "System",
                Version = Guid.NewGuid().ToString("N")
            };

            await _context.PlatformSettings.AddAsync(setting, cancellationToken);
            try
            {
                await _context.SaveChangesAsync(cancellationToken);
            }
            catch
            {
                _context.Entry(setting).State = EntityState.Detached;
                setting = await _context.PlatformSettings.FirstOrDefaultAsync(s => s.Id == 1, cancellationToken) ?? setting;
            }
        }

        List<string> currencies;
        try
        {
            currencies = JsonSerializer.Deserialize<List<string>>(setting.SupportedCurrenciesJson) ?? new List<string> { "INR", "USD", "EUR", "GBP", "AED", "AUD", "CAD", "SGD", "JPY", "CHF", "CNY", "NZD", "SAR", "QAR", "KWD", "ZAR" };
        }
        catch
        {
            currencies = new List<string> { "INR", "USD", "EUR", "GBP", "AED", "AUD", "CAD", "SGD", "JPY", "CHF", "CNY", "NZD", "SAR", "QAR", "KWD", "ZAR" };
        }

        var dto = new PlatformSettingsDto
        {
            PlatformName = setting.PlatformName,
            MaintenanceMode = setting.MaintenanceMode,
            AllowSelfRegistration = setting.AllowSelfRegistration,
            SessionTimeoutMinutes = setting.SessionTimeoutMinutes,
            InactivityTimeoutMinutes = setting.InactivityTimeoutMinutes,
            PasswordMinLength = setting.PasswordMinLength,
            RequireDigit = setting.RequireDigit,
            RequireSpecialChar = setting.RequireSpecialChar,
            SupportedCurrencies = currencies,
            AccountRecoveryContact = setting.AccountRecoveryContact,
            UpdatedAtUtc = setting.UpdatedAtUtc,
            UpdatedBy = setting.UpdatedBy,
            Version = setting.Version
        };

        _memoryCache?.Set(PlatformSettingsCacheKey, ClonePlatformSettingsDto(dto), TimeSpan.FromSeconds(30));
        return dto;
    }

    private static PlatformSettingsDto ClonePlatformSettingsDto(PlatformSettingsDto source) => new()
    {
        PlatformName = source.PlatformName,
        MaintenanceMode = source.MaintenanceMode,
        AllowSelfRegistration = source.AllowSelfRegistration,
        SessionTimeoutMinutes = source.SessionTimeoutMinutes,
        InactivityTimeoutMinutes = source.InactivityTimeoutMinutes,
        PasswordMinLength = source.PasswordMinLength,
        RequireDigit = source.RequireDigit,
        RequireSpecialChar = source.RequireSpecialChar,
        SupportedCurrencies = new List<string>(source.SupportedCurrencies ?? new List<string>()),
        AccountRecoveryContact = source.AccountRecoveryContact,
        UpdatedAtUtc = source.UpdatedAtUtc,
        UpdatedBy = source.UpdatedBy,
        Version = source.Version
    };

    public async Task<(bool Success, string Message, PlatformSettingsDto? Settings, string? ErrorCode)> UpdatePlatformSettingsAsync(UpdatePlatformSettingsRequest request, string currentUserName, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.PlatformName) || request.PlatformName.Trim().Length < 2)
        {
            return (false, "Platform name is required (minimum 2 characters).", null, "VALIDATION_ERROR");
        }

        if (request.PasswordMinLength < 8)
        {
            return (false, "Minimum password length must be at least 8.", null, "VALIDATION_ERROR");
        }

        var setting = await _context.PlatformSettings.FirstOrDefaultAsync(s => s.Id == 1, cancellationToken);
        if (setting == null)
        {
            setting = new PlatformSetting
            {
                Id = 1,
                UpdatedAtUtc = DateTime.UtcNow,
                UpdatedBy = "System"
            };
            await _context.PlatformSettings.AddAsync(setting, cancellationToken);
        }

        // Concurrency Check
        if (request.ExpectedUpdatedAtUtc.HasValue && setting.UpdatedAtUtc != request.ExpectedUpdatedAtUtc.Value)
        {
            return (false, "A concurrency conflict occurred. Platform settings were modified by another administrator. Please reload.", null, "CONCURRENCY_CONFLICT");
        }

        var executionStrategy = _context.Database.CreateExecutionStrategy();
        return await executionStrategy.ExecuteAsync(async () =>
        {
            var canUseTransactions = _context.Database.IsRelational() && !(_context.Database.ProviderName?.Contains("InMemory") ?? false);
            Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction? transaction = null;
            if (canUseTransactions)
            {
                transaction = await _context.Database.BeginTransactionAsync(cancellationToken);
            }

            try
            {
                var oldSnapshot = JsonSerializer.Serialize(new
                {
                    setting.PlatformName,
                    setting.MaintenanceMode,
                    setting.AllowSelfRegistration,
                    setting.SessionTimeoutMinutes,
                    setting.InactivityTimeoutMinutes,
                    setting.PasswordMinLength,
                    setting.RequireDigit,
                    setting.RequireSpecialChar,
                    setting.AccountRecoveryContact,
                    setting.SupportedCurrenciesJson
                });

                var currencies = request.SupportedCurrencies != null && request.SupportedCurrencies.Any()
                    ? request.SupportedCurrencies.Select(c => c.Trim().ToUpperInvariant()).Distinct().ToList()
                    : new List<string> { "INR", "USD", "EUR", "GBP", "AED", "AUD", "CAD", "SGD", "JPY", "CHF", "CNY", "NZD", "SAR", "QAR", "KWD", "ZAR" };

                setting.PlatformName = request.PlatformName.Trim();
                setting.MaintenanceMode = request.MaintenanceMode;
                setting.AllowSelfRegistration = request.AllowSelfRegistration;
                setting.SessionTimeoutMinutes = request.SessionTimeoutMinutes;
                setting.InactivityTimeoutMinutes = request.InactivityTimeoutMinutes;
                setting.PasswordMinLength = request.PasswordMinLength;
                setting.RequireDigit = request.RequireDigit;
                setting.RequireSpecialChar = request.RequireSpecialChar;
                setting.SupportedCurrenciesJson = JsonSerializer.Serialize(currencies);
                setting.AccountRecoveryContact = request.AccountRecoveryContact.Trim();
                setting.UpdatedAtUtc = DateTime.UtcNow;
                setting.UpdatedBy = string.IsNullOrWhiteSpace(currentUserName) ? (_currentUserService?.UserName ?? "SuperAdmin") : currentUserName;
                setting.Version = Guid.NewGuid().ToString("N");

                var newSnapshot = JsonSerializer.Serialize(new
                {
                    setting.PlatformName,
                    setting.MaintenanceMode,
                    setting.AllowSelfRegistration,
                    setting.SessionTimeoutMinutes,
                    setting.InactivityTimeoutMinutes,
                    setting.PasswordMinLength,
                    setting.RequireDigit,
                    setting.RequireSpecialChar,
                    setting.AccountRecoveryContact,
                    setting.SupportedCurrenciesJson
                });

                var audit = new AuditLog
                {
                    TenantId = 1,
                    EntityName = "PlatformSettings",
                    EntityId = "Global",
                    Action = "PlatformSettingsUpdated",
                    UserName = string.IsNullOrWhiteSpace(currentUserName) ? (_currentUserService?.UserName ?? "SuperAdmin") : currentUserName,
                    ActorUserId = _currentUserService?.UserId,
                    ActorRole = _currentUserService?.Role ?? "SuperAdmin",
                    CorrelationId = _currentUserService?.CorrelationId,
                    ResultStatus = "Success",
                    Timestamp = DateTime.UtcNow,
                    Changes = $"Platform global settings updated: PlatformName='{setting.PlatformName}', MaintenanceMode={setting.MaintenanceMode}",
                    OldValues = oldSnapshot,
                    NewValues = newSnapshot
                };

                await _context.SaveChangesAsync(cancellationToken);
                await _auditLogRepository.AddAsync(audit, cancellationToken);

                if (transaction != null)
                {
                    await transaction.CommitAsync(cancellationToken);
                }

                var copy = new PlatformSettingsDto
                {
                    PlatformName = setting.PlatformName,
                    MaintenanceMode = setting.MaintenanceMode,
                    AllowSelfRegistration = setting.AllowSelfRegistration,
                    SessionTimeoutMinutes = setting.SessionTimeoutMinutes,
                    InactivityTimeoutMinutes = setting.InactivityTimeoutMinutes,
                    PasswordMinLength = setting.PasswordMinLength,
                    RequireDigit = setting.RequireDigit,
                    RequireSpecialChar = setting.RequireSpecialChar,
                    SupportedCurrencies = currencies,
                    AccountRecoveryContact = setting.AccountRecoveryContact,
                    UpdatedAtUtc = setting.UpdatedAtUtc,
                    UpdatedBy = setting.UpdatedBy,
                    Version = setting.Version
                };

                _memoryCache?.Set(PlatformSettingsCacheKey, ClonePlatformSettingsDto(copy), TimeSpan.FromSeconds(30));

                return (true, "Platform settings updated successfully.", copy, (string?)null);
            }
            catch (DbUpdateConcurrencyException)
            {
                if (transaction != null) await transaction.RollbackAsync(cancellationToken);
                return (false, "A concurrency conflict occurred. Platform settings were modified by another administrator.", null, "CONCURRENCY_CONFLICT");
            }
            catch (Exception ex)
            {
                if (transaction != null) await transaction.RollbackAsync(cancellationToken);
                _logger?.LogError(ex, "Failed to update platform settings: {Message}", ex.Message);
                return (false, "Failed to update platform settings. Changes were rolled back.", null, "SETTINGS_UPDATE_FAILED");
            }
            finally
            {
                if (transaction != null) await transaction.DisposeAsync();
            }
        });
    }

    #endregion
}
