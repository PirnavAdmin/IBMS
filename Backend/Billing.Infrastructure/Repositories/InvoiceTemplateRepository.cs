using Billing.Application.Interfaces;
using Billing.Domain.Entities;
using Billing.Domain.Enums;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Repositories;

public class InvoiceTemplateRepository : IInvoiceTemplateRepository
{
    private readonly BillingDbContext _dbContext;

    public InvoiceTemplateRepository(BillingDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<InvoiceTemplate?> GetByIdAsync(int id, int tenantId, bool includeVersions = true)
    {
        IQueryable<InvoiceTemplate> query = _dbContext.InvoiceTemplates
            .Where(t => t.Id == id && t.TenantId == tenantId);

        if (includeVersions)
        {
            query = query.Include(t => t.Versions.OrderByDescending(v => v.VersionNumber));
        }

        return await query.FirstOrDefaultAsync();
    }

    public async Task<InvoiceTemplate?> GetActiveTemplateAsync(TemplateStyle style, int tenantId)
    {
        return await _dbContext.InvoiceTemplates
            .Include(t => t.Versions.Where(v => v.Status == TemplateStatus.Active))
            .Where(t => t.TenantId == tenantId && t.Style == style && t.Status == TemplateStatus.Active)
            .FirstOrDefaultAsync();
    }

    public async Task<InvoiceTemplate?> GetDefaultTemplateAsync(int tenantId)
    {
        return await _dbContext.InvoiceTemplates
            .Include(t => t.Versions.Where(v => v.Status == TemplateStatus.Active))
            .Where(t => t.TenantId == tenantId && t.IsDefault && t.Status == TemplateStatus.Active)
            .FirstOrDefaultAsync();
    }

    public async Task<(List<InvoiceTemplate> Items, int TotalCount)> GetPagedListAsync(
        int tenantId,
        string? search,
        TemplateStyle? style,
        TemplateStatus? status,
        int pageNumber,
        int pageSize)
    {
        var query = _dbContext.InvoiceTemplates
            .Include(t => t.Versions)
            .Where(t => t.TenantId == tenantId)
            .AsNoTracking();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var trimmed = search.Trim();
            query = query.Where(t => t.Name.Contains(trimmed) || (t.Description != null && t.Description.Contains(trimmed)));
        }

        if (style.HasValue)
        {
            query = query.Where(t => t.Style == style.Value);
        }

        if (status.HasValue)
        {
            query = query.Where(t => t.Status == status.Value);
        }

        var totalCount = await query.CountAsync();

        var items = await query
            .OrderByDescending(t => t.IsDefault)
            .ThenByDescending(t => t.UpdatedAtUtc ?? t.CreatedAtUtc)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return (items, totalCount);
    }

    public async Task AddAsync(InvoiceTemplate template)
    {
        await _dbContext.InvoiceTemplates.AddAsync(template);
        await _dbContext.SaveChangesAsync();
    }

    public async Task UpdateAsync(InvoiceTemplate template)
    {
        _dbContext.InvoiceTemplates.Update(template);
        await _dbContext.SaveChangesAsync();
    }

    public async Task<bool> ExistsByNameAsync(string name, int tenantId, int? excludeId = null)
    {
        var query = _dbContext.InvoiceTemplates
            .Where(t => t.TenantId == tenantId && t.Name == name);

        if (excludeId.HasValue)
        {
            query = query.Where(t => t.Id != excludeId.Value);
        }

        return await query.AnyAsync();
    }

    public async Task<TemplateVersion?> GetVersionAsync(int templateId, int versionNumber, int tenantId)
    {
        return await _dbContext.TemplateVersions
            .Where(v => v.TemplateId == templateId && v.VersionNumber == versionNumber && v.TenantId == tenantId)
            .FirstOrDefaultAsync();
    }

    public async Task AddVersionAsync(TemplateVersion version)
    {
        await _dbContext.TemplateVersions.AddAsync(version);
        await _dbContext.SaveChangesAsync();
    }

    public async Task UpdateVersionAsync(TemplateVersion version)
    {
        _dbContext.TemplateVersions.Update(version);
        await _dbContext.SaveChangesAsync();
    }
}
