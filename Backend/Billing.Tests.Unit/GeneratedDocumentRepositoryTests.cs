using System.Linq.Expressions;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Billing.Infrastructure.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Query;
using Moq;
using Xunit;

namespace Billing.Tests.Unit;

public class GeneratedDocumentRepositoryTests
{
    [Theory]
    [InlineData("Generated")]
    [InlineData("Stored")]
    public async Task Lookup_ReturnsLatestSuccessfulDocumentForOnlyRequestedInvoiceAndTenant(string status)
    {
        var rows = new List<GeneratedDocument>
        {
            new() { Id = 1, InvoiceId = 101, TenantId = 2, Status = status, CreatedAtUtc = DateTime.UnixEpoch },
            new() { Id = 2, InvoiceId = 101, TenantId = 2, Status = status, CreatedAtUtc = DateTime.UnixEpoch.AddDays(1) },
            new() { Id = 3, InvoiceId = 101, TenantId = 3, Status = status, CreatedAtUtc = DateTime.UnixEpoch.AddDays(2) },
            new() { Id = 4, InvoiceId = 102, TenantId = 2, Status = status, CreatedAtUtc = DateTime.UnixEpoch.AddDays(2) },
            new() { Id = 5, InvoiceId = 101, TenantId = 2, Status = "Failed", CreatedAtUtc = DateTime.UnixEpoch.AddDays(2) }
        };
        var query = rows.AsQueryable();
        var set = new Mock<DbSet<GeneratedDocument>>();
        set.As<IQueryable<GeneratedDocument>>().Setup(s => s.Provider).Returns(new AsyncProvider(query.Provider));
        set.As<IQueryable<GeneratedDocument>>().Setup(s => s.Expression).Returns(query.Expression);
        set.As<IQueryable<GeneratedDocument>>().Setup(s => s.ElementType).Returns(query.ElementType);
        set.As<IQueryable<GeneratedDocument>>().Setup(s => s.GetEnumerator()).Returns(() => query.GetEnumerator());
        using var context = new BillingDbContext(new DbContextOptionsBuilder<BillingDbContext>().Options)
        {
            GeneratedDocuments = set.Object
        };
        var repository = new GeneratedDocumentRepository(context);

        Assert.Equal(2, (await repository.GetByInvoiceIdAsync(101, 2))!.Id);
        Assert.Null(await repository.GetByInvoiceIdAsync(101, 99));
        Assert.Null(await repository.GetByInvoiceIdAsync(999, 2));
    }

    // Execute the repository's actual query against rows without requiring a database server.
    private sealed class AsyncProvider(IQueryProvider inner) : IAsyncQueryProvider
    {
        public IQueryable CreateQuery(Expression expression) => new AsyncQuery<GeneratedDocument>(expression);
        public IQueryable<TElement> CreateQuery<TElement>(Expression expression) => new AsyncQuery<TElement>(expression);
        public object? Execute(Expression expression) => inner.Execute(expression);
        public TResult Execute<TResult>(Expression expression) => inner.Execute<TResult>(expression);
        public TResult ExecuteAsync<TResult>(Expression expression, CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var resultType = typeof(TResult).GetGenericArguments()[0];
            var result = inner.Execute(expression);
            return (TResult)typeof(Task).GetMethod(nameof(Task.FromResult))!
                .MakeGenericMethod(resultType).Invoke(null, new[] { result })!;
        }
    }

    private sealed class AsyncQuery<T>(Expression expression) : EnumerableQuery<T>(expression), IQueryable<T>
    {
        IQueryProvider IQueryable.Provider => new AsyncProvider(this);
    }
}
