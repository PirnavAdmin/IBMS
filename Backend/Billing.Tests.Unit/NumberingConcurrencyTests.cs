using System.Collections.Concurrent;
using Billing.Application.Services;
using Billing.Contracts.Numbering;
using Billing.Domain.Entities;
using Billing.Domain.Enums;
using Billing.Tests.Unit.Fakes;
using Xunit;

namespace Billing.Tests.Unit;

public class NumberingConcurrencyTests
{
    [Fact]
    public async Task GenerateNextNumberAsync_Parallel100Requests_ProducesStrictlyUniqueSequences()
    {
        // Arrange: IBMSBE-017 & IBMSBE-018 Concurrency Uniqueness Test
        var repository = new FakeNumberingRepository();
        var service = new NumberGenerationService(repository);
        const int concurrentCount = 100;
        const int tenantId = 1;

        var request = new GenerateNumberRequest
        {
            DocumentType = "Invoice",
            TransactionDate = new DateTime(2026, 9, 18)
        };

        // Act: Fire 100 concurrent generation tasks simultaneously
        var tasks = Enumerable.Range(0, concurrentCount).Select(_ => Task.Run(async () =>
        {
            return await service.GenerateNextNumberAsync(request, tenantId);
        }));

        var results = await Task.WhenAll(tasks);

        // Assert: All 100 succeeded
        Assert.All(results, r => Assert.True(r.Success, r.Message));

        var allocatedSequences = results.Select(r => r.Data!.SequenceNumber).ToList();
        var generatedNumbers = results.Select(r => r.Data!.GeneratedNumber).ToList();

        // Check uniqueness - NO DUPLICATES
        Assert.Equal(concurrentCount, allocatedSequences.Distinct().Count());
        Assert.Equal(concurrentCount, generatedNumbers.Distinct().Count());

        // Check sequential ordering from 1 to 100
        var sortedSequences = allocatedSequences.OrderBy(s => s).ToList();
        for (int i = 0; i < concurrentCount; i++)
        {
            Assert.Equal(i + 1, sortedSequences[i]);
        }
    }

    [Fact]
    public async Task GenerateNextNumberAsync_MultiTenantConcurrency_IsolatesSequences()
    {
        // Arrange
        var repository = new FakeNumberingRepository();
        var service = new NumberGenerationService(repository);
        const int requestsPerTenant = 50;

        var req1 = new GenerateNumberRequest { DocumentType = "Invoice", TransactionDate = new DateTime(2026, 9, 18) };
        var req2 = new GenerateNumberRequest { DocumentType = "Invoice", TransactionDate = new DateTime(2026, 9, 18) };

        // Act: 50 requests for Tenant 10, 50 requests for Tenant 20 interleaved
        var tasks = new List<Task<(int tenant, long seq, string num)>>();

        for (int i = 0; i < requestsPerTenant; i++)
        {
            tasks.Add(Task.Run(async () =>
            {
                var res = await service.GenerateNextNumberAsync(req1, tenantId: 10);
                return (10, res.Data!.SequenceNumber, res.Data.GeneratedNumber);
            }));

            tasks.Add(Task.Run(async () =>
            {
                var res = await service.GenerateNextNumberAsync(req2, tenantId: 20);
                return (20, res.Data!.SequenceNumber, res.Data.GeneratedNumber);
            }));
        }

        var allResults = await Task.WhenAll(tasks);

        // Assert: Tenant 10
        var t10Seqs = allResults.Where(r => r.tenant == 10).Select(r => r.seq).OrderBy(s => s).ToList();
        Assert.Equal(requestsPerTenant, t10Seqs.Distinct().Count());
        Assert.Equal(1, t10Seqs.First());
        Assert.Equal(requestsPerTenant, t10Seqs.Last());

        // Assert: Tenant 20
        var t20Seqs = allResults.Where(r => r.tenant == 20).Select(r => r.seq).OrderBy(s => s).ToList();
        Assert.Equal(requestsPerTenant, t20Seqs.Distinct().Count());
        Assert.Equal(1, t20Seqs.First());
        Assert.Equal(requestsPerTenant, t20Seqs.Last());
    }

    [Fact]
    public async Task GenerateNextNumberAsync_MultiDocumentTypeConcurrency_IsolatesTypes()
    {
        // Arrange
        var repository = new FakeNumberingRepository();
        var service = new NumberGenerationService(repository);
        const int requestsPerType = 30;
        const int tenantId = 5;

        var types = new[] { "Invoice", "Credit Note", "Estimate" };
        var tasks = new List<Task<(string type, long seq, string num)>>();

        // Act
        foreach (var docType in types)
        {
            for (int i = 0; i < requestsPerType; i++)
            {
                var dType = docType;
                tasks.Add(Task.Run(async () =>
                {
                    var res = await service.GenerateNextNumberAsync(new GenerateNumberRequest
                    {
                        DocumentType = dType,
                        TransactionDate = new DateTime(2026, 9, 18)
                    }, tenantId);

                    return (dType, res.Data!.SequenceNumber, res.Data.GeneratedNumber);
                }));
            }
        }

        var allResults = await Task.WhenAll(tasks);

        // Assert
        foreach (var docType in types)
        {
            var typeResults = allResults.Where(r => r.type == docType).ToList();
            Assert.Equal(requestsPerType, typeResults.Count);
            Assert.Equal(requestsPerType, typeResults.Select(r => r.seq).Distinct().Count());
            Assert.Equal(requestsPerType, typeResults.Select(r => r.num).Distinct().Count());
        }
    }

    [Fact]
    public async Task GenerateNextNumberAsync_ConcurrentInitialization_SucceedsWithoutDuplicateKey()
    {
        // Arrange: 20 parallel requests for an uninitialized document type
        var repository = new FakeNumberingRepository();
        var service = new NumberGenerationService(repository);
        const int count = 20;

        var tasks = Enumerable.Range(0, count).Select(_ => Task.Run(async () =>
        {
            return await service.GenerateNextNumberAsync(new GenerateNumberRequest
            {
                DocumentType = "DeliveryChallan",
                TransactionDate = new DateTime(2026, 9, 18)
            }, tenantId: 99);
        }));

        var results = await Task.WhenAll(tasks);

        Assert.All(results, r => Assert.True(r.Success));
        Assert.Equal(count, results.Select(r => r.Data!.SequenceNumber).Distinct().Count());
    }
}
