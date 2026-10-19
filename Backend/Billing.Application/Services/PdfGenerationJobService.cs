using System.Diagnostics;
using Billing.Application.Interfaces;
using Billing.Contracts.BackgroundJobs;
using Billing.Contracts.InvoiceTemplate;
using Microsoft.Extensions.Logging;

namespace Billing.Application.Services;

public class PdfGenerationJobService : IPdfGenerationJobService
{
    private readonly IInvoiceRepository _invoiceRepository;
    private readonly ITenantRepository _tenantRepository;
    private readonly IGeneratedDocumentRepository _documentRepository;
    private readonly IInvoiceTemplateService _templateService;
    private readonly IDocumentStorageService _storageService;
    private readonly ILogger<PdfGenerationJobService> _logger;

    public PdfGenerationJobService(
        IInvoiceRepository invoiceRepository,
        ITenantRepository tenantRepository,
        IGeneratedDocumentRepository documentRepository,
        IInvoiceTemplateService templateService,
        IDocumentStorageService storageService,
        ILogger<PdfGenerationJobService> logger)
    {
        _invoiceRepository = invoiceRepository;
        _tenantRepository = tenantRepository;
        _documentRepository = documentRepository;
        _templateService = templateService;
        _storageService = storageService;
        _logger = logger;
    }

    public async Task<JobExecutionResultDto> ProcessPendingPdfGenerationsAsync(int? tenantId = null, CancellationToken cancellationToken = default)
    {
        var sw = Stopwatch.StartNew();
        int generatedCount = 0;

        try
        {
            var tenantIds = new List<int>();
            if (tenantId.HasValue)
            {
                tenantIds.Add(tenantId.Value);
            }
            else
            {
                var tenants = await _tenantRepository.GetAllAsync();
                tenantIds = tenants.Select(t => t.Id).ToList();
                if (tenantIds.Count == 0)
                {
                    tenantIds.Add(1);
                }
            }

            foreach (var tId in tenantIds)
            {
                if (cancellationToken.IsCancellationRequested) break;

                var invoices = await _invoiceRepository.GetAllAsync(tId);
                // Eligible invoices: Non-draft invoices (Issued, Partially Paid, Paid, Overdue)
                var nonDraftInvoices = invoices.Where(i =>
                    !string.Equals(i.Status, "Draft", StringComparison.OrdinalIgnoreCase) &&
                    !string.Equals(i.Status, "Cancelled", StringComparison.OrdinalIgnoreCase) &&
                    !string.Equals(i.Status, "Canceled", StringComparison.OrdinalIgnoreCase)
                ).ToList();

                foreach (var invoice in nonDraftInvoices)
                {
                    if (cancellationToken.IsCancellationRequested) break;

                    var doc = await _documentRepository.GetByInvoiceIdAsync(invoice.Id, tId);
                    bool needsGeneration = false;

                    if (doc == null || !string.Equals(doc.Status, "Generated", StringComparison.OrdinalIgnoreCase))
                    {
                        needsGeneration = true;
                    }
                    else if (!string.IsNullOrWhiteSpace(doc.StoragePath))
                    {
                        var exists = await _storageService.ExistsAsync(doc.StoragePath, tId, cancellationToken);
                        if (!exists)
                        {
                            needsGeneration = true;
                        }
                    }

                    if (needsGeneration)
                    {
                        try
                        {
                            await _templateService.GenerateInvoicePdfAsync(
                                new GenerateInvoicePdfRequest { InvoiceId = invoice.Id, ForceRegenerate = false },
                                tId,
                                "SystemPdfJob",
                                cancellationToken);

                            generatedCount++;
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, "Failed to background generate PDF for invoice {InvoiceId}", invoice.Id);
                        }
                    }
                }
            }

            sw.Stop();
            return new JobExecutionResultDto
            {
                JobName = "PdfGenerationJob",
                Success = true,
                ProcessedCount = generatedCount,
                Duration = sw.Elapsed,
                Message = $"PDF generation background job completed. Rendered {generatedCount} PDF documents."
            };
        }
        catch (Exception ex)
        {
            sw.Stop();
            _logger.LogError(ex, "Error occurred during PdfGenerationJob execution.");
            return new JobExecutionResultDto
            {
                JobName = "PdfGenerationJob",
                Success = false,
                ProcessedCount = generatedCount,
                Duration = sw.Elapsed,
                Message = $"Failed to execute PdfGenerationJob: {ex.Message}"
            };
        }
    }
}
