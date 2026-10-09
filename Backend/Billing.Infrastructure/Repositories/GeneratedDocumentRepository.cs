using Billing.Application.Interfaces;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Repositories;

public class GeneratedDocumentRepository : IGeneratedDocumentRepository
{
    private readonly BillingDbContext _dbContext;

    public GeneratedDocumentRepository(BillingDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<GeneratedDocument?> GetByInvoiceIdAsync(int invoiceId, int tenantId)
    {
        return await _dbContext.GeneratedDocuments
            // Generation persists the file before recording "Generated". Keep "Stored"
            // compatible with existing records; both represent retrievable documents.
            .Where(d => d.InvoiceId == invoiceId && d.TenantId == tenantId
                && (d.Status == "Generated" || d.Status == "Stored"))
            .OrderByDescending(d => d.CreatedAtUtc)
            .FirstOrDefaultAsync();
    }

    public async Task<GeneratedDocument?> GetByIdAsync(int id, int tenantId)
    {
        return await _dbContext.GeneratedDocuments
            .Where(d => d.Id == id && d.TenantId == tenantId)
            .FirstOrDefaultAsync();
    }

    public async Task AddAsync(GeneratedDocument document)
    {
        await _dbContext.GeneratedDocuments.AddAsync(document);
        await _dbContext.SaveChangesAsync();
    }

    public async Task UpdateAsync(GeneratedDocument document)
    {
        _dbContext.GeneratedDocuments.Update(document);
        await _dbContext.SaveChangesAsync();
    }
}
