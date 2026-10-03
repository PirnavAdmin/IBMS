using Billing.Contracts;
using Billing.Contracts.InvoiceTemplate;

namespace Billing.Application.Interfaces;

public interface IInvoiceTemplateService
{
    Task<PagedResult<InvoiceTemplateDto>> GetTemplatesAsync(TemplateFilterRequest filter, int tenantId, CancellationToken ct = default);

    Task<InvoiceTemplateDto> GetTemplateByIdAsync(int id, int tenantId, CancellationToken ct = default);

    Task<InvoiceTemplateDto> CreateTemplateAsync(CreateTemplateRequest request, int tenantId, string user, CancellationToken ct = default);

    Task<InvoiceTemplateDto> UpdateTemplateAsync(int id, UpdateTemplateRequest request, int tenantId, string user, CancellationToken ct = default);

    Task<InvoiceTemplateDto> DuplicateTemplateAsync(int id, DuplicateTemplateRequest request, int tenantId, string user, CancellationToken ct = default);

    Task<InvoiceTemplateDto> ActivateTemplateAsync(int id, int? versionNumber, int tenantId, string user, CancellationToken ct = default);

    Task<InvoiceTemplateDto> DeactivateTemplateAsync(int id, int tenantId, string user, CancellationToken ct = default);

    Task<List<TemplateVersionDto>> GetTemplateVersionsAsync(int templateId, int tenantId, CancellationToken ct = default);

    Task<bool> DeleteTemplateAsync(int id, int tenantId, string user, CancellationToken ct = default);

    Task<byte[]> GeneratePreviewPdfAsync(TemplatePreviewRequest request, int tenantId, CancellationToken ct = default);

    Task<InvoicePdfResponse> GenerateInvoicePdfAsync(GenerateInvoicePdfRequest request, int tenantId, string user, CancellationToken ct = default);

    Task<(byte[] FileBytes, string FileName, string ContentType)> GetInvoicePdfAsync(int invoiceId, int tenantId, CancellationToken ct = default);

    Task<List<TemplateAuditLogDto>> GetAuditLogsAsync(int? templateId, int tenantId, CancellationToken ct = default);
}
