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

        public Task<(List<AuditLog> Items, int TotalCount)> GetFilteredPagedAsync(int tenantId, Billing.Contracts.AuditLogFilterRequest filter, CancellationToken cancellationToken = default)
        {
            var filtered = Logs.Where(l => l.TenantId == tenantId).ToList();
            var page = filter.Page <= 0 ? 1 : filter.Page;
            var pageSize = filter.PageSize <= 0 ? 10 : filter.PageSize;
            return Task.FromResult((filtered.Skip((page - 1) * pageSize).Take(pageSize).ToList(), filtered.Count));
        }

        public Task<Billing.Contracts.AuditFilterOptionsResponse> GetFilterOptionsAsync(int tenantId, CancellationToken cancellationToken = default)
        {
            var tenantLogs = Logs.Where(l => l.TenantId == tenantId).ToList();
            var entityNames = tenantLogs.Where(l => !string.IsNullOrWhiteSpace(l.EntityName)).Select(l => l.EntityName.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(x => x).ToList();
            var actions = tenantLogs.Where(l => !string.IsNullOrWhiteSpace(l.Action)).Select(l => l.Action.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(x => x).ToList();
            var userNames = tenantLogs.Where(l => !string.IsNullOrWhiteSpace(l.UserName)).Select(l => l.UserName.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(x => x).ToList();

            return Task.FromResult(new Billing.Contracts.AuditFilterOptionsResponse
            {
                EntityNames = entityNames,
                Actions = actions,
                UserNames = userNames
            });
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
            userName: "Prathap",
            customerData: new { Name = "Acme Corp", Email = "acme@example.com" });

        Assert.Single(repo.Logs);
        var log = repo.Logs[0];
        Assert.Equal("CREATE", log.Action);
        Assert.Equal(2, log.TenantId);
        Assert.Equal(10, log.CustomerId);
        Assert.Equal("Customer", log.EntityName);
        Assert.Equal("10", log.EntityId);
        Assert.Equal("Prathap", log.UserName);
        Assert.Equal("Customer created", log.Changes);
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
            userName: "Prathap",
            changes: new { Phone = "+1234567890", City = "New York" });

        Assert.Single(repo.Logs);
        var log = repo.Logs[0];
        Assert.Equal("UPDATE", log.Action);
        Assert.Equal(1, log.TenantId);
        Assert.Equal(15, log.CustomerId);
        Assert.Equal("Phone, City updated", log.Changes);
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

        await service.RecordCustomerCreatedAsync(1, 100, "Cust 1", "Prathap", new { });
        await service.RecordCustomerUpdatedAsync(1, 100, "Cust 1", "Prathap", new { });
        await service.RecordCustomerCreatedAsync(1, 200, "Cust 2", "Prathap", new { });
        await service.RecordCustomerCreatedAsync(2, 100, "Cust 1 Tenant 2", "Other", new { });

        var history = await service.GetCustomerAuditHistoryAsync(1, 100);

        Assert.Equal(2, history.Count);
        Assert.All(history, h =>
        {
            Assert.Equal(1, h.TenantId);
            Assert.Equal(100, h.CustomerId);
        });
    }

    [Fact]
    public async Task GetTenantFilterOptionsAsync_ReturnsDistinctSortedOptionsScopedToTenant()
    {
        var repo = new FakeAuditLogRepository();
        var service = new AuditService(repo, NullLogger<AuditService>.Instance);

        // Seed logs for Tenant 1
        await repo.AddAsync(new AuditLog { TenantId = 1, EntityName = "Customer", Action = "CREATE", UserName = "Alice" });
        await repo.AddAsync(new AuditLog { TenantId = 1, EntityName = "Invoice", Action = "ISSUE", UserName = "Bob" });
        await repo.AddAsync(new AuditLog { TenantId = 1, EntityName = "Customer", Action = "UPDATE", UserName = "Alice" });
        await repo.AddAsync(new AuditLog { TenantId = 1, EntityName = "Quotation", Action = "CREATE", UserName = "Alice" });

        // Seed logs for Tenant 2 (must be isolated)
        await repo.AddAsync(new AuditLog { TenantId = 2, EntityName = "Tenant2Entity", Action = "TENANT2_ACTION", UserName = "Tenant2User" });

        var options = await service.GetTenantFilterOptionsAsync(1);

        Assert.NotNull(options);
        Assert.Equal(new List<string> { "Customer", "Invoice", "Quotation" }, options.EntityNames);
        Assert.Equal(new List<string> { "CREATE", "ISSUE", "UPDATE" }, options.Actions);
        Assert.Equal(new List<string> { "Alice", "Bob" }, options.UserNames);

        // Verify convenient aliases match
        Assert.Equal(options.EntityNames, options.Modules);
        Assert.Equal(options.Actions, options.EventNames);
        Assert.Equal(options.UserNames, options.PerformedBy);

        // Ensure Tenant 2 data is strictly excluded
        Assert.DoesNotContain("Tenant2Entity", options.EntityNames);
        Assert.DoesNotContain("TENANT2_ACTION", options.Actions);
        Assert.DoesNotContain("Tenant2User", options.UserNames);
    }
}
