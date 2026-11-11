using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading.Tasks;
using Billing.API.Common;
using Billing.API.Controllers;
using Billing.API.Controllers.Platform;
using Billing.API.Middleware;
using Billing.Application;
using Billing.Application.Common;
using Billing.Application.Interfaces;
using Billing.Application.Services;
using Billing.Contracts;
using Billing.Contracts.Platform;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Billing.Infrastructure.Repositories;
using Billing.Infrastructure.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace Billing.Tests.Integration;

public class PlatformRemediationIntegrationTests
{
    private BillingDbContext CreateDbContext(string dbName, ICurrentUserService? currentUserService = null)
    {
        var options = new DbContextOptionsBuilder<BillingDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
            .Options;

        var context = new BillingDbContext(options, currentUserService);
        return context;
    }

    private (PlatformAdministrationService PlatformService, BillingDbContext Db) CreatePlatformService(string dbName, string userName = "SuperAdmin", string role = "SuperAdmin", int? tenantId = 1, string userId = "usr_super")
    {
        var mockUser = new Mock<ICurrentUserService>();
        mockUser.Setup(u => u.UserName).Returns(userName);
        mockUser.Setup(u => u.Role).Returns(role);
        mockUser.Setup(u => u.TenantId).Returns(tenantId);
        mockUser.Setup(u => u.UserId).Returns(userId);
        mockUser.Setup(u => u.CorrelationId).Returns("corr-12345");

        var db = CreateDbContext(dbName, mockUser.Object);

        var tenantRepo = new TenantRepository(db);
        var userRepo = new UserRepository(db);
        var roleRepo = new RoleRepository(db);
        var sessionRepo = new UserSessionRepository(db);
        var auditRepo = new AuditLogRepository(db);
        var provMock = new Mock<ITenantProvisioningService>();

        var platformService = new PlatformAdministrationService(
            db,
            tenantRepo,
            userRepo,
            roleRepo,
            sessionRepo,
            auditRepo,
            provMock.Object,
            Mock.Of<ILogger<PlatformAdministrationService>>(),
            mockUser.Object);

        return (platformService, db);
    }

    #region P0 — Platform Settings Persistence, Restarts, Concurrency & Enforcement

    [Fact]
    public async Task PlatformSettings_SurvivesSimulatedApplicationRestart_AndPersistsToDatabase()
    {
        var dbName = Guid.NewGuid().ToString();

        // 1. Initial boot: write settings
        var (service1, db1) = CreatePlatformService(dbName);
        var updateRequest = new UpdatePlatformSettingsRequest
        {
            PlatformName = "Enterprise Global Billing",
            MaintenanceMode = true,
            AllowSelfRegistration = false,
            SessionTimeoutMinutes = 120,
            InactivityTimeoutMinutes = 30,
            PasswordMinLength = 12,
            RequireDigit = true,
            RequireSpecialChar = true,
            SupportedCurrencies = new List<string> { "USD", "EUR", "JPY" },
            AccountRecoveryContact = "security@enterprise.local"
        };

        var (success, _, updatedDto, _) = await service1.UpdatePlatformSettingsAsync(updateRequest, "SuperAdmin");
        Assert.True(success);
        Assert.NotNull(updatedDto);

        // 2. Simulate Application Restart: Destroy old context/service and create brand new service instance
        db1.Dispose();

        var (service2, db2) = CreatePlatformService(dbName);
        var reloadedSettings = await service2.GetPlatformSettingsAsync();

        Assert.Equal("Enterprise Global Billing", reloadedSettings.PlatformName);
        Assert.True(reloadedSettings.MaintenanceMode);
        Assert.False(reloadedSettings.AllowSelfRegistration);
        Assert.Equal(120, reloadedSettings.SessionTimeoutMinutes);
        Assert.Equal(30, reloadedSettings.InactivityTimeoutMinutes);
        Assert.Equal(12, reloadedSettings.PasswordMinLength);
        Assert.Equal("security@enterprise.local", reloadedSettings.AccountRecoveryContact);
        Assert.Contains("JPY", reloadedSettings.SupportedCurrencies);

        db2.Dispose();
    }

    [Fact]
    public async Task PlatformSettings_ConcurrencyConflict_Returns409Conflict_WhenExpectedUpdatedAtMismatch()
    {
        var dbName = Guid.NewGuid().ToString();
        var (service, db) = CreatePlatformService(dbName);

        var controller = new PlatformSettingsController(service);

        // Fetch current
        var current = await service.GetPlatformSettingsAsync();

        // Attempt update with stale timestamp
        var staleRequest = new UpdatePlatformSettingsRequest
        {
            PlatformName = "Conflicted Update",
            ExpectedUpdatedAtUtc = current.UpdatedAtUtc.AddMinutes(-10) // Stale timestamp
        };

        var actionResult = await controller.UpdatePlatformSettings(staleRequest, default);
        var conflictResult = Assert.IsType<ConflictObjectResult>(actionResult);
        Assert.Equal(409, conflictResult.StatusCode);

        var response = Assert.IsType<ApiResponse<object>>(conflictResult.Value);
        Assert.False(response.Success);
        Assert.Equal("CONCURRENCY_CONFLICT", response.ErrorCode);

        db.Dispose();
    }

    [Fact]
    public async Task PlatformSettings_MaintenanceMode_BlocksNonSuperAdminWith503_AllowsSuperAdmin()
    {
        var dbName = Guid.NewGuid().ToString();
        var (service, db) = CreatePlatformService(dbName);

        // Enable maintenance mode
        await service.UpdatePlatformSettingsAsync(new UpdatePlatformSettingsRequest
        {
            PlatformName = "IBMS",
            MaintenanceMode = true
        }, "SuperAdmin");

        var middleware = new PlatformMaintenanceMiddleware(
            next: (ctx) => {
                ctx.Response.StatusCode = 200;
                return Task.CompletedTask;
            },
            logger: Mock.Of<ILogger<PlatformMaintenanceMiddleware>>());

        // 1. Non-SuperAdmin caller (TenantAdmin) targeting operational endpoint -> Blocked 503
        var tenantAdminContext = new DefaultHttpContext();
        tenantAdminContext.Request.Path = "/api/v1/invoices";
        var tenantAdminClaims = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.Name, "TenantOwner"),
            new Claim(ClaimTypes.Role, "TenantAdmin"),
            new Claim("TenantId", "1")
        }, "TestAuth"));
        tenantAdminContext.User = tenantAdminClaims;

        await middleware.InvokeAsync(tenantAdminContext, service);
        Assert.Equal(503, tenantAdminContext.Response.StatusCode);

        // 2. SuperAdmin caller targeting operational endpoint -> Allowed 200
        var superAdminContext = new DefaultHttpContext();
        superAdminContext.Request.Path = "/api/v1/invoices";
        var superAdminClaims = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.Name, "PlatformSuperAdmin"),
            new Claim(ClaimTypes.Role, "SuperAdmin")
        }, "TestAuth"));
        superAdminContext.User = superAdminClaims;

        await middleware.InvokeAsync(superAdminContext, service);
        Assert.Equal(200, superAdminContext.Response.StatusCode);

        db.Dispose();
    }

    [Fact]
    public async Task PlatformSettings_SelfRegistrationAndDynamicPasswordPolicy_EnforcedInAuthService()
    {
        var dbName = Guid.NewGuid().ToString();
        var (service, db) = CreatePlatformService(dbName);

        // Configure strict policies: min password length 10, self-registration disabled
        await service.UpdatePlatformSettingsAsync(new UpdatePlatformSettingsRequest
        {
            PlatformName = "IBMS",
            AllowSelfRegistration = false,
            PasswordMinLength = 10,
            RequireDigit = true,
            RequireSpecialChar = true
        }, "SuperAdmin");

        var userRepo = new UserRepository(db);
        var sessionRepo = new UserSessionRepository(db);
        var tenantRepo = new TenantRepository(db);
        var jwtSettings = new JwtSettings { SecretKey = "SuperSecretKeyForTestingIntegrationPurposesOnly12345!" };
        var jwtTokenService = new JwtTokenService(jwtSettings);

        var authService = new AuthService(userRepo, sessionRepo, jwtTokenService, jwtSettings, tenantRepo, service);

        // 1. Attempt self-registration while disabled
        var regResponse = await authService.Register(new RegisterRequest
        {
            Name = "John Doe",
            Email = "john@example.com",
            Password = "ValidPassword123!",
            ConfirmPassword = "ValidPassword123!"
        });

        Assert.False(regResponse.Success);
        Assert.Equal("Self-registration is currently disabled by platform policy.", regResponse.Message);

        // 2. Enable self registration, test dynamic password validation length
        await service.UpdatePlatformSettingsAsync(new UpdatePlatformSettingsRequest
        {
            PlatformName = "IBMS",
            AllowSelfRegistration = true,
            PasswordMinLength = 10,
            RequireDigit = true,
            RequireSpecialChar = true
        }, "SuperAdmin");

        var weakPassResponse = await authService.Register(new RegisterRequest
        {
            Name = "Jane Doe",
            Email = "jane@example.com",
            Password = "Short1!", // length 7 < 10
            ConfirmPassword = "Short1!"
        });

        Assert.False(weakPassResponse.Success);
        Assert.Contains(weakPassResponse.Errors!, e => e.Contains("at least 10 characters"));

        db.Dispose();
    }

    #endregion

    #region P1 — Tenant Idempotency & Concurrency

    [Fact]
    public async Task TenantCreation_IdempotentSubmit_ReplaysWithoutDuplicates_AndConflictOnPayloadMismatch()
    {
        var dbName = Guid.NewGuid().ToString();
        var (service, db) = CreatePlatformService(dbName);
        var controller = new PlatformTenantsController(service);

        var createRequest1 = new CreateTenantRequest
        {
            Name = "Acme Global",
            TenantCode = "acme-global",
            CompanyEmail = "info@acme.com",
            IdempotencyKey = "idem-key-999"
        };

        // 1. First submission -> Created (201)
        var result1 = await controller.CreateTenant(createRequest1, default);
        var createdResult = Assert.IsType<ObjectResult>(result1);
        Assert.Equal(201, createdResult.StatusCode);

        // Verify exactly 1 tenant exists
        var tenantCountAfterFirst = await db.Tenants.CountAsync();

        // 2. Duplicate submission with SAME key and payload -> Idempotent Replay (201/200) without duplicate tenant
        var result2 = await controller.CreateTenant(createRequest1, default);
        var replayResult = Assert.IsType<ObjectResult>(result2);
        Assert.True(replayResult.StatusCode == 201 || replayResult.StatusCode == 200);

        var tenantCountAfterSecond = await db.Tenants.CountAsync();
        Assert.Equal(tenantCountAfterFirst, tenantCountAfterSecond);

        // 3. Duplicate submission with SAME key but DIFFERENT payload -> 409 Conflict
        var conflictingPayload = new CreateTenantRequest
        {
            Name = "Acme Global Modified",
            TenantCode = "acme-global-different",
            CompanyEmail = "info-different@acme.com",
            IdempotencyKey = "idem-key-999"
        };

        var result3 = await controller.CreateTenant(conflictingPayload, default);
        var conflictResult = Assert.IsType<ConflictObjectResult>(result3);
        Assert.Equal(409, conflictResult.StatusCode);

        db.Dispose();
    }

    [Fact]
    public async Task TenantUpdate_AtomicConcurrency_Returns409Conflict_OnTimestampMismatch()
    {
        var dbName = Guid.NewGuid().ToString();
        var (service, db) = CreatePlatformService(dbName);
        var controller = new PlatformTenantsController(service);

        // Create tenant
        var (success, _, createdTenant, _) = await service.CreateTenantAsync(new CreateTenantRequest
        {
            Name = "Concurrency Tenant",
            TenantCode = "concurrency-tenant",
            CompanyEmail = "conc@test.com"
        }, "SuperAdmin");
        Assert.True(success);

        // Concurrent update with mismatched expected timestamp
        var updateRequest = new UpdateTenantRequest
        {
            Name = "New Name",
            CompanyEmail = "conc@test.com",
            ExpectedUpdatedAtUtc = (createdTenant!.UpdatedAtUtc ?? DateTime.UtcNow).AddMinutes(-5) // Stale
        };

        var actionResult = await controller.UpdateTenant(createdTenant.Id, updateRequest, default);
        var conflictResult = Assert.IsType<ConflictObjectResult>(actionResult);
        Assert.Equal(409, conflictResult.StatusCode);

        var response = Assert.IsType<ApiResponse<object>>(conflictResult.Value);
        Assert.Equal("CONCURRENCY_CONFLICT", response.ErrorCode);

        db.Dispose();
    }

    #endregion

    #region P1 — Platform Audit Integrity

    [Fact]
    public async Task PlatformAudit_PopulatesActorRoleCorrelationAndResultStatus()
    {
        var dbName = Guid.NewGuid().ToString();
        var (service, db) = CreatePlatformService(dbName, userName: "AuditedAdmin", role: "SuperAdmin", userId: "usr_audit_42");

        // Perform audited platform action
        var (success, _, _, _) = await service.CreateTenantAsync(new CreateTenantRequest
        {
            Name = "Audited Tenant",
            TenantCode = "audited-tenant",
            CompanyEmail = "audit@test.com"
        }, "AuditedAdmin");
        Assert.True(success);

        // Check audit log in DB
        var audit = await db.AuditLogs.FirstOrDefaultAsync(a => a.EntityName == "Tenant" && a.Action == "TenantCreated");
        Assert.NotNull(audit);
        Assert.Equal("AuditedAdmin", audit.UserName);
        Assert.Equal("usr_audit_42", audit.ActorUserId);
        Assert.Equal("SuperAdmin", audit.ActorRole);
        Assert.Equal("corr-12345", audit.CorrelationId);
        Assert.Equal("Success", audit.ResultStatus);
        Assert.True(audit.TenantId > 0);

        db.Dispose();
    }

    #endregion

    #region P0 QA — Live Authorization Matrix & Tenant Isolation

    [Fact]
    public async Task LiveAuthorization_NonSuperAdminRoles_ForbiddenFromPlatformAdminApis()
    {
        var dbName = Guid.NewGuid().ToString();
        var (service, db) = CreatePlatformService(dbName);
        var settingsController = new PlatformSettingsController(service);

        // 1. TenantAdmin role
        settingsController.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(new[]
                {
                    new Claim(ClaimTypes.Name, "TenantAdminUser"),
                    new Claim(ClaimTypes.Role, "TenantAdmin"),
                    new Claim("TenantId", "1")
                }, "TestAuth"))
            }
        };

        // Check policy attribute requirement
        var authorizeAttrs = typeof(PlatformSettingsController).GetCustomAttributes(typeof(Microsoft.AspNetCore.Authorization.AuthorizeAttribute), true);
        Assert.NotEmpty(authorizeAttrs);
        var authAttr = (Microsoft.AspNetCore.Authorization.AuthorizeAttribute)authorizeAttrs[0];
        Assert.Equal("SuperAdminPolicy", authAttr.Policy);

        db.Dispose();
    }

    [Fact]
    public void ControllerTenantExtensions_NonSuperAdminCannotElevatePrivilegesWithHeader()
    {
        // 1. TenantAdmin attempts cross-tenant elevation via X-Tenant-Id header
        var tenantAdminContext = new DefaultHttpContext();
        tenantAdminContext.Request.Headers["X-Tenant-Id"] = "2"; // Attempting to access Tenant 2
        tenantAdminContext.User = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.Name, "TenantAdmin1"),
            new Claim(ClaimTypes.Role, "TenantAdmin"),
            new Claim("TenantId", "1") // Assigned to Tenant 1
        }, "TestAuth"));

        var controller = new CustomersController(Mock.Of<ICustomerService>(), Mock.Of<IAuditService>(), Mock.Of<ILogger<CustomersController>>())
        {
            ControllerContext = new ControllerContext { HttpContext = tenantAdminContext }
        };

        var resolvedTenantId = controller.ResolveTenantId();
        // MUST remain Tenant 1, header MUST be ignored
        Assert.Equal(1, resolvedTenantId);

        // 2. BillingManager role with header
        var billingManagerContext = new DefaultHttpContext();
        billingManagerContext.Request.Headers["X-Tenant-Id"] = "99";
        billingManagerContext.User = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.Name, "Manager"),
            new Claim(ClaimTypes.Role, "BillingManager"),
            new Claim("TenantId", "1")
        }, "TestAuth"));

        var controller2 = new InvoicesController(Mock.Of<IInvoiceService>(), Mock.Of<IInvoiceRepository>(), Mock.Of<IInvoiceCommunicationRepository>(), Mock.Of<IAuditLogRepository>())
        {
            ControllerContext = new ControllerContext { HttpContext = billingManagerContext }
        };

        var resolvedTenantId2 = controller2.ResolveTenantId();
        Assert.Equal(1, resolvedTenantId2);
    }

    [Fact]
    public void ControllerTenantExtensions_DualRoleSuperAdminAndTenantAdmin_BehavesAccordingToPolicy()
    {
        // Dual-role user: SuperAdmin + TenantAdmin, assigned to Tenant 1
        var dualRoleClaims = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.Name, "DualAdmin"),
            new Claim(ClaimTypes.Role, "SuperAdmin"),
            new Claim(ClaimTypes.Role, "TenantAdmin"),
            new Claim("TenantId", "1")
        }, "TestAuth"));

        // Case A: No X-Tenant-Id header provided -> respects assigned tenant claim (1)
        var contextWithoutHeader = new DefaultHttpContext { User = dualRoleClaims };
        var controllerA = new CustomersController(Mock.Of<ICustomerService>(), Mock.Of<IAuditService>(), Mock.Of<ILogger<CustomersController>>())
        {
            ControllerContext = new ControllerContext { HttpContext = contextWithoutHeader }
        };
        Assert.Equal(1, controllerA.ResolveTenantId());

        // Case B: Explicit X-Tenant-Id header provided (e.g. 5) -> SuperAdmin privilege allows explicit target
        var contextWithHeader = new DefaultHttpContext { User = dualRoleClaims };
        contextWithHeader.Request.Headers["X-Tenant-Id"] = "5";
        var controllerB = new CustomersController(Mock.Of<ICustomerService>(), Mock.Of<IAuditService>(), Mock.Of<ILogger<CustomersController>>())
        {
            ControllerContext = new ControllerContext { HttpContext = contextWithHeader }
        };
        Assert.Equal(5, controllerB.ResolveTenantId());
    }

    [Fact]
    public async Task TenantIsolation_TenantACannotAccessTenantBData()
    {
        var dbName = Guid.NewGuid().ToString();
        var db = CreateDbContext(dbName);

        // Seed Tenant 1 customer and Tenant 2 customer
        var cust1 = new Customer
        {
            Id = 101,
            TenantId = 1,
            Name = "Customer of Tenant 1",
            Email = "c1@tenant1.com"
        };
        var cust2 = new Customer
        {
            Id = 202,
            TenantId = 2,
            Name = "Customer of Tenant 2",
            Email = "c2@tenant2.com"
        };
        await db.Customers.AddRangeAsync(cust1, cust2);
        await db.SaveChangesAsync();

        var customerRepo = new CustomerRepository(db);

        // Tenant 1 attempts to query Tenant 2 customer ID 202
        var fetchedByTenant1 = await customerRepo.GetByIdAsync(202, 1);
        Assert.Null(fetchedByTenant1); // Data is isolated and unaccessible

        // Tenant 2 queries their own customer ID 202
        var fetchedByTenant2 = await customerRepo.GetByIdAsync(202, 2);
        Assert.NotNull(fetchedByTenant2);
        Assert.Equal("Customer of Tenant 2", fetchedByTenant2.Name);

        db.Dispose();
    }

    [Fact]
    public async Task PlatformSettings_MemoryCache_RefreshesImmediatelyAfterUpdate()
    {
        var dbName = Guid.NewGuid().ToString();
        var mockUser = new Mock<ICurrentUserService>();
        mockUser.Setup(u => u.UserName).Returns("SuperAdmin");
        mockUser.Setup(u => u.Role).Returns("SuperAdmin");
        mockUser.Setup(u => u.TenantId).Returns(1);
        mockUser.Setup(u => u.UserId).Returns("usr_super");

        using var db = CreateDbContext(dbName, mockUser.Object);
        using var cache = new Microsoft.Extensions.Caching.Memory.MemoryCache(
            new Microsoft.Extensions.Caching.Memory.MemoryCacheOptions());

        var service = new PlatformAdministrationService(
            db,
            new TenantRepository(db),
            new UserRepository(db),
            new RoleRepository(db),
            new UserSessionRepository(db),
            new AuditLogRepository(db),
            new Mock<ITenantProvisioningService>().Object,
            Mock.Of<ILogger<PlatformAdministrationService>>(),
            mockUser.Object,
            cache);

        var initial = await service.GetPlatformSettingsAsync();
        Assert.False(initial.MaintenanceMode);

        // Toggle MaintenanceMode directly via UpdatePlatformSettingsAsync -> cache must reflect immediately
        var (ok, _, _, _) = await service.UpdatePlatformSettingsAsync(new UpdatePlatformSettingsRequest
        {
            PlatformName = "IBMS",
            MaintenanceMode = true
        }, "SuperAdmin");
        Assert.True(ok);

        var refreshed = await service.GetPlatformSettingsAsync();
        Assert.True(refreshed.MaintenanceMode);
    }

    #endregion
}
