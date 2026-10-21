using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Export;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Repositories;

public class ExportJobRepository : IExportJobRepository
{
    private readonly BillingDbContext _context;

    public ExportJobRepository(BillingDbContext context)
    {
        _context = context;
    }

    public async Task<ExportJob?> GetByIdAsync(int id, int tenantId, CancellationToken cancellationToken = default)
    {
        return await _context.ExportJobs
            .FirstOrDefaultAsync(e => e.Id == id && e.TenantId == tenantId, cancellationToken);
    }

    public async Task<List<ExportJob>> GetPendingJobsAsync(int limit = 10, CancellationToken cancellationToken = default)
    {
        return await _context.ExportJobs
            .Where(e => e.Status == "Pending")
            .OrderBy(e => e.CreatedAtUtc)
            .Take(limit)
            .ToListAsync(cancellationToken);
    }

    public async Task<PagedResult<ExportJob>> GetPagedAsync(int tenantId, ExportJobFilterRequest filter, CancellationToken cancellationToken = default)
    {
        var query = _context.ExportJobs
            .Where(e => e.TenantId == tenantId);

        if (!string.IsNullOrWhiteSpace(filter.JobType))
        {
            query = query.Where(e => e.JobType == filter.JobType);
        }

        if (!string.IsNullOrWhiteSpace(filter.Status))
        {
            query = query.Where(e => e.Status == filter.Status);
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var page = filter.Page < 1 ? 1 : filter.Page;
        var pageSize = filter.PageSize < 1 ? 20 : filter.PageSize;

        var items = await query
            .OrderByDescending(e => e.CreatedAtUtc)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return new PagedResult<ExportJob>(items, totalCount, page, pageSize);
    }

    public async Task<ExportJob> AddAsync(ExportJob job, CancellationToken cancellationToken = default)
    {
        await _context.ExportJobs.AddAsync(job, cancellationToken);
        await _context.SaveChangesAsync(cancellationToken);
        return job;
    }

    public async Task<ExportJob> UpdateAsync(ExportJob job, CancellationToken cancellationToken = default)
    {
        _context.ExportJobs.Update(job);
        await _context.SaveChangesAsync(cancellationToken);
        return job;
    }

    public async Task DeleteAsync(ExportJob job, CancellationToken cancellationToken = default)
    {
        try
        {
            _context.ExportJobs.Remove(job);
            await _context.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            _context.Entry(job).State = EntityState.Detached;
        }
        catch
        {
            _context.Entry(job).State = EntityState.Detached;
            throw;
        }
    }

    public async Task<List<ExportJob>> GetOldCompletedJobsAsync(DateTime olderThanUtc, int limit = 100, CancellationToken cancellationToken = default)
    {
        return await _context.ExportJobs
            .Where(e => (e.Status == "Completed" || e.Status == "Failed") && e.CompletedAtUtc.HasValue && e.CompletedAtUtc.Value < olderThanUtc)
            .OrderBy(e => e.CompletedAtUtc)
            .Take(limit)
            .ToListAsync(cancellationToken);
    }
}
