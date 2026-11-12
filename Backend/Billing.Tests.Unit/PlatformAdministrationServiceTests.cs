using Billing.Application.Interfaces;
using Billing.Contracts.Platform;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Billing.Infrastructure.Services;
using Billing.Tests.Unit.Fakes;
using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;

namespace Billing.Tests.Unit;

public class PlatformAdministrationServiceTests
{
    private sealed class NoOpSaveBillingDbContext : BillingDbContext
    {
        public NoOpSaveBillingDbContext()
            : base(new DbContextOptionsBuilder<BillingDbContext>().Options)
        {
        }

        public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
            => Task.FromResult(0);
    }

    [Fact]
    public async Task ApproveUserRegistrationAsync_ReplacesDefaultOrganizationPlaceholderWithRequestedCompanyName()
    {
        var tenantRepo = new FakeTenantRepository(new List<Tenant>
        {
            new()
            {
                Id = 1,
                TenantCode = "default",
                Name = "Default Organization",
                Status = "Active",
                IsActive = true,
                CreatedAtUtc = DateTime.UtcNow
            },
            new()
            {
                Id = 9,
                TenantCode = "default-organization-9465",
                Name = "Default Organization",
                CompanyEmail = "sandeep02.singampalli@gmail.com",
                Status = "PendingApproval",
                IsActive = false,
                CreatedAtUtc = DateTime.UtcNow
            }
        });

        var userRepo = new FakeUserRepository();
        await userRepo.AddAsync(new User
        {
            Id = 55,
            TenantId = 9,
            Email = "sandeep02.singampalli@gmail.com",
            Username = "sandeep02.singampalli@gmail.com",
            Name = "Dharmesh",
            Status = "PendingApproval",
            IsActive = false,
            Roles = new List<string> { "TenantAdmin" },
            CreatedAtUtc = DateTime.UtcNow
        });

        var roleRepo = new FakeRoleRepository();
        await roleRepo.AddAsync(new Role { Id = 2, Name = "TenantAdmin", IsSystemRole = true });

        var sessionRepo = new FakeUserSessionRepository();
        var auditRepo = new FakeAuditLogRepository();
        var provisioningMock = new Mock<ITenantProvisioningService>();

        using var dbContext = new NoOpSaveBillingDbContext();
        var service = new PlatformAdministrationService(
            dbContext,
            tenantRepo,
            userRepo,
            roleRepo,
            sessionRepo,
            auditRepo,
            provisioningMock.Object);

        var result = await service.ApproveUserRegistrationAsync(
            55,
            new ApproveUserRegistrationRequest { CompanyName = "Washington Technologies" },
            "Platform Admin");

        Assert.True(result.Success, result.Message);
        Assert.NotNull(result.User);
        Assert.Equal("Washington Technologies", result.User!.TenantName);
        var updatedTenant = await tenantRepo.GetByIdAsync(9);
        Assert.NotNull(updatedTenant);
        Assert.Equal("Washington Technologies", updatedTenant!.Name);
        Assert.Equal("Active", updatedTenant.Status);
        Assert.True(updatedTenant.IsActive);
    }
}
