using Billing.Domain.Entities;
using Xunit;

namespace Billing.Tests.Unit;

public class AuditLogTests
{
    [Fact]
    public void AuditLog_Creation_SetsExpectedProperties()
    {
        // Arrange
        var timestamp = DateTime.UtcNow;
        var log = new AuditLog
        {
            Id = 1,
            TenantId = 1,
            CustomerId = 101,
            EntityName = "Customer",
            EntityId = "101",
            Action = "CREATE",
            UserName = "Prathap Ganugapenta",
            Timestamp = timestamp,
            Changes = "Customer created"
        };

        // Assert
        Assert.Equal(1, log.Id);
        Assert.Equal(1, log.TenantId);
        Assert.Equal(101, log.CustomerId);
        Assert.Equal("Customer", log.EntityName);
        Assert.Equal("101", log.EntityId);
        Assert.Equal("CREATE", log.Action);
        Assert.Equal("Prathap Ganugapenta", log.UserName);
        Assert.Equal(timestamp, log.Timestamp);
        Assert.Equal("Customer created", log.Changes);
    }

    [Fact]
    public void AuditLog_DefaultValues_AreCorrect()
    {
        // Arrange & Act
        var log = new AuditLog();

        // Assert
        Assert.Equal(1, log.TenantId);
        Assert.Equal("Customer", log.EntityName);
        Assert.Null(log.CustomerId);
        Assert.Empty(log.Action);
        Assert.True((DateTime.UtcNow - log.Timestamp).TotalSeconds < 5);
    }
}
