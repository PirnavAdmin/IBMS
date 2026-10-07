using Billing.Domain.Entities;
using Billing.Domain.Enums;

namespace Billing.Application.Interfaces;

public interface IInvoiceTemplateRepository
{
    Task<InvoiceTemplate?> GetByIdAsync(int id, int tenantId, bool includeVersions = true);

    Task<InvoiceTemplate?> GetActiveTemplateAsync(TemplateStyle style, int tenantId);

    Task<InvoiceTemplate?> GetDefaultTemplateAsync(int tenantId);

    Task ClearDefaultTemplateAsync(int tenantId, int exceptTemplateId, CancellationToken ct = default);

    Task<(List<InvoiceTemplate> Items, int TotalCount)> GetPagedListAsync(
        int tenantId,
        string? search,
        TemplateStyle? style,
        TemplateStatus? status,
        int pageNumber,
        int pageSize);

    Task AddAsync(InvoiceTemplate template);

    Task UpdateAsync(InvoiceTemplate template);

    Task<bool> ExistsByNameAsync(string name, int tenantId, int? excludeId = null);

    Task<TemplateVersion?> GetVersionAsync(int templateId, int versionNumber, int tenantId);

    Task AddVersionAsync(TemplateVersion version);

    Task UpdateVersionAsync(TemplateVersion version);
}
