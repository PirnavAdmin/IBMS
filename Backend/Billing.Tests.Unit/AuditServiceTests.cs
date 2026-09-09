using Billing.Application.Interfaces;
using Billing.Application.Services;
using Billing.Domain.Entities;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Billing.Tests.Unit;

public class AuditServiceTests
{
    private class FakeAuditLogRepository : IAuditLogRepository
    {
        public List<AuditLog> Logs { get; } = new();

        public Task AddAsync(AuditLog log, CancellationToken cancellationToken = default)
        {
            log.Id = Logs.Count + 1;
            Logs.Add(log);
            return Task.CompletedTask;
        }

        public Task<List<AuditLog>> GetByCustomerIdAsync(int tenantId, int customerId, CancellationToken cancellationToken = default)
        {
            return Task.FromResult(Logs.Where(l => l.TenantId == tenantId && l.CustomerId == customerId).ToList());
        }

        public Task<List<AuditLog>> GetByEntityAsync(int tenantId, string entityName, string entityId, CancellationToken cancellationToken = default)
        {
            return Task.FromResult(Logs.Where(l => l.TenantId == tenantId && l.EntityName == entityName && l.EntityId == entityId).ToList());
        }

        public Task<(List<AuditLog> Items, int TotalCount)> GetPagedAsync(int tenantId, int page, int pageSize, CancellationToken cancellationToken = default)
        {
            var filtered = Logs.Where(l => l.TenantId == tenantId).ToList();
            return Task.FromResult((filtered.Skip((page - 1) * pageSize).Take(pageSize).ToList(), filtered.Count));
        }
    }

    [Fact]
    public async Task RecordCustomerCreatedAsync_RecordsCreateActionWithTenantAndUser()
    {
        var repo = new FakeAuditLogRepository();
        var service = new AuditService(repo, NullLogger<AuditService>.Instance);

        await service.RecordCustomerCreatedAsync(
            tenantId: 2,
            customerId: 10,
            customerName: "Acme Corp",
            userId: "usr_1",
            userName: "Prathap",
            customerData: new { Name = "Acme Corp", Email = "acme@example.com" },
            ipAddress: "192.168.1.1");

        Assert.Single(repo.Logs);
        var log = repo.Logs[0];
        Assert.Equal("CREATE", log.Action);
        Assert.Equal(2, log.TenantId);
        Assert.Equal(10, log.CustomerId);
        Assert.Equal("Customer", log.EntityName);
        Assert.Equal("10", log.EntityId);
        Assert.Equal("usr_1", log.UserId);
        Assert.Equal("Prathap", log.UserName);
        Assert.Equal("192.168.1.1", log.IpAddress);
        Assert.Contains("acme@example.com", log.Changes);
    }

    [Fact]
    public async Task RecordCustomerUpdatedAsync_RecordsUpdateActionWithChanges()
    {
        var repo = new FakeAuditLogRepository();
        var service = new AuditService(repo, NullLogger<AuditService>.Instance);

        await service.RecordCustomerUpdatedAsync(
            tenantId: 1,
            customerId: 15,
            customerName: "Global Tech",
            userId: "usr_2",
            userName: "Prathap",
            changes: new { Phone = "+1234567890", City = "New York" });

        Assert.Single(repo.Logs);
        var log = repo.Logs[0];
        Assert.Equal("UPDATE", log.Action);
        Assert.Equal(1, log.TenantId);
        Assert.Equal(15, log.CustomerId);
        Assert.Contains("New York", log.Changes);
    }

    [Fact]
    public async Task RecordCustomerDeactivatedAsync_RecordsDeactivateAction()
    {
        var repo = new FakeAuditLogRepository();
        var service = new AuditService(repo, NullLogger<AuditService>.Instance);

        await service.RecordCustomerDeactivatedAsync(
            tenantId: 1,
            customerId: 20,
            customerName: "Inactive Corp",
            userId: "usr_3",
            userName: "Prathap",
            reason: "Account closed by customer request");

        Assert.Single(repo.Logs);
        var log = repo.Logs[0];
        Assert.Equal("DEACTIVATE", log.Action);
        Assert.Equal(20, log.CustomerId);
        Assert.Contains("Account closed", log.Changes);
    }

    [Fact]
    public async Task GetCustomerAuditHistoryAsync_ReturnsOnlyLogsForTargetCustomerAndTenant()
    {
        var repo = new FakeAuditLogRepository();
        var service = new AuditService(repo, NullLogger<AuditService>.Instance);

        await service.RecordCustomerCreatedAsync(1, 100, "Cust 1", "u1", "Prathap", new { });
        await service.RecordCustomerUpdatedAsync(1, 100, "Cust 1", "u1", "Prathap", new { });
        await service.RecordCustomerCreatedAsync(1, 200, "Cust 2", "u1", "Prathap", new { });
        await service.RecordCustomerCreatedAsync(2, 100, "Cust 1 Tenant 2", "u2", "Other", new { });

        var history = await service.GetCustomerAuditHistoryAsync(1, 100);

        Assert.Equal(2, history.Count);
        Assert.All(history, h =>
        {
            Assert.Equal(1, h.TenantId);
            Assert.Equal(100, h.CustomerId);
        });
    }
}
