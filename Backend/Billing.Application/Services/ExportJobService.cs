using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.Json;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.BackgroundJobs;
using Billing.Contracts.CreditNote;
using Billing.Contracts.Export;
using Billing.Contracts.Payment;
using Billing.Contracts.Quotation;
using Billing.Domain.Entities;
using Microsoft.Extensions.Logging;

namespace Billing.Application.Services;

public class ExportJobService : IExportJobService
{
    private static readonly JsonSerializerOptions FilterJsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly IExportJobRepository _exportJobRepository;
    private readonly IInvoiceRepository _invoiceRepository;
    private readonly IPaymentRepository _paymentRepository;
    private readonly ICustomerRepository _customerRepository;
    private readonly IAuditLogRepository _auditLogRepository;
    private readonly ICreditNoteRepository? _creditNoteRepository;
    private readonly IQuotationRepository? _quotationRepository;
    private readonly IProductRepository? _productRepository;
    private readonly IDocumentStorageService _storageService;
    private readonly ILogger<ExportJobService> _logger;

    public ExportJobService(
        IExportJobRepository exportJobRepository,
        IInvoiceRepository invoiceRepository,
        IPaymentRepository paymentRepository,
        ICustomerRepository customerRepository,
        IAuditLogRepository auditLogRepository,
        IDocumentStorageService storageService,
        ILogger<ExportJobService> logger,
        ICreditNoteRepository? creditNoteRepository = null,
        IQuotationRepository? quotationRepository = null,
        IProductRepository? productRepository = null)
    {
        _exportJobRepository = exportJobRepository;
        _invoiceRepository = invoiceRepository;
        _paymentRepository = paymentRepository;
        _customerRepository = customerRepository;
        _auditLogRepository = auditLogRepository;
        _storageService = storageService;
        _logger = logger;
        _creditNoteRepository = creditNoteRepository;
        _quotationRepository = quotationRepository;
        _productRepository = productRepository;
    }

    public async Task<ApiResponse<ExportJobDto>> QueueExportJobAsync(CreateExportJobRequest request, int tenantId, string requestedBy, CancellationToken cancellationToken = default)
    {
        var rawJobType = (request.JobType ?? "Invoice").Trim();
        var jobType = NormalizeJobType(rawJobType) ?? rawJobType;
        var format = (request.ExportFormat ?? "CSV").Trim().ToUpperInvariant();

        if (format != "CSV" && format != "JSON")
        {
            return ApiResponse<ExportJobDto>.Fail("Supported export formats are 'CSV' and 'JSON'.");
        }

        var validTypes = new[] { "Invoice", "Payment", "Customer", "AuditLog", "CreditNote", "Quotation", "Product" };
        if (!validTypes.Contains(jobType, StringComparer.OrdinalIgnoreCase))
        {
            return ApiResponse<ExportJobDto>.Fail($"Invalid jobType '{jobType}'. Supported: Invoice, Payment, Customer, AuditLog, CreditNote, Quotation, Product.");
        }

        var job = new ExportJob
        {
            TenantId = tenantId,
            JobType = jobType,
            ExportFormat = format,
            Status = "Pending",
            FilterParametersJson = request.FilterParametersJson,
            ContentType = GetContentType(format),
            RequestedBy = requestedBy ?? "System",
            CreatedAtUtc = DateTime.UtcNow
        };

        var created = await _exportJobRepository.AddAsync(job, cancellationToken);
        return ApiResponse<ExportJobDto>.Ok(MapToDto(created), "Export job queued successfully.");
    }

    public async Task<ApiResponse<ExportJobDto>> GetExportJobAsync(int id, int tenantId, CancellationToken cancellationToken = default)
    {
        var job = await _exportJobRepository.GetByIdAsync(id, tenantId, cancellationToken);
        if (job == null)
        {
            return ApiResponse<ExportJobDto>.Fail("Export job not found.");
        }

        return ApiResponse<ExportJobDto>.Ok(MapToDto(job));
    }

    public async Task<ApiResponse<PagedResult<ExportJobDto>>> GetExportJobsAsync(int tenantId, ExportJobFilterRequest filter, CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrWhiteSpace(filter.JobType)) filter.JobType = NormalizeJobType(filter.JobType) ?? filter.JobType.Trim();
        if (!string.IsNullOrWhiteSpace(filter.Status)) filter.Status = filter.Status.Trim();
        var paged = await _exportJobRepository.GetPagedAsync(tenantId, filter, cancellationToken);
        var items = filter.ExcludeAuditLogs
            ? paged.Items.Where(j => !string.Equals(j.JobType, "AuditLog", StringComparison.OrdinalIgnoreCase)).ToList()
            : paged.Items;
        if (filter.AllowedJobTypes is { Count: > 0 }) items = items.Where(j => filter.AllowedJobTypes.Contains(NormalizeJobType(j.JobType) ?? j.JobType, StringComparer.OrdinalIgnoreCase)).ToList();
        var dtos = items.Select(MapToDto).ToList();
        var removedCount = paged.Items.Count - items.Count;
        var totalCount = Math.Max(0, paged.TotalCount - removedCount);

        var result = new PagedResult<ExportJobDto>(dtos, totalCount, paged.PageNumber, paged.PageSize);
        return ApiResponse<PagedResult<ExportJobDto>>.Ok(result);
    }

    public async Task<ApiResponse<(byte[] Content, string FileName, string ContentType)>> DownloadExportFileAsync(int id, int tenantId, CancellationToken cancellationToken = default)
    {
        var job = await _exportJobRepository.GetByIdAsync(id, tenantId, cancellationToken);
        if (job == null)
        {
            return ApiResponse<(byte[] Content, string FileName, string ContentType)>.Fail("Export job not found.");
        }

        if (job.Status != "Completed" || string.IsNullOrWhiteSpace(job.StoragePath))
        {
            return ApiResponse<(byte[] Content, string FileName, string ContentType)>.Fail($"Export file is not ready. Current status: {job.Status}");
        }

        try
        {
            var bytes = await _storageService.GetDocumentAsync(job.StoragePath, tenantId, cancellationToken);
            var fileName = job.FileName ?? $"{job.JobType}_Export_{job.Id}.{job.ExportFormat.ToLowerInvariant()}";
            return ApiResponse<(byte[] Content, string FileName, string ContentType)>.Ok((bytes, fileName, GetContentType(job.ExportFormat)));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to retrieve export document from storage for job {JobId}", id);
            return ApiResponse<(byte[] Content, string FileName, string ContentType)>.Fail("Export file could not be retrieved from storage.");
        }
    }

    public async Task<JobExecutionResultDto> ProcessPendingExportJobsAsync(CancellationToken cancellationToken = default)
    {
        var sw = Stopwatch.StartNew();
        int processedCount = 0;

        try
        {
            var pendingJobs = await _exportJobRepository.GetPendingJobsAsync(10, cancellationToken);

            foreach (var job in pendingJobs)
            {
                if (cancellationToken.IsCancellationRequested) break;

                job.JobType = NormalizeJobType(job.JobType) ?? job.JobType;
                job.Status = "Processing";
                job.StartedAtUtc = DateTime.UtcNow;
                await _exportJobRepository.UpdateAsync(job, cancellationToken);

                try
                {
                    byte[] fileBytes;
                    int recordCount = 0;
                    string extension = job.ExportFormat.ToLowerInvariant();
                    string fileName = $"{job.JobType}_Export_{DateTime.UtcNow:yyyyMMdd_HHmmss}_{job.Id}.{extension}";

                    if (string.Equals(job.JobType, "Invoice", StringComparison.OrdinalIgnoreCase))
                    {
                        cancellationToken.ThrowIfCancellationRequested();
                        var invoices = await _invoiceRepository.GetAllAsync(job.TenantId);
                        var invoiceFilter = ParseFilter<InvoiceFilterRequest>(job.FilterParametersJson);
                        if (invoiceFilter != null)
                        {
                            invoices = ApplyInvoiceFilter(invoices, invoiceFilter);
                        }
                        recordCount = invoices.Count;
                        await UpdateJobProgressAsync(job, recordCount, recordCount, cancellationToken);
                        fileBytes = GenerateInvoiceExport(invoices, job.ExportFormat);
                    }
                    else if (string.Equals(job.JobType, "Payment", StringComparison.OrdinalIgnoreCase))
                    {
                        var allPayments = new List<Payment>();
                        var baseFilter = ParseFilter<PaymentListFilterRequest>(job.FilterParametersJson) ?? new PaymentListFilterRequest();
                        int pageNum = 1;
                        while (true)
                        {
                            cancellationToken.ThrowIfCancellationRequested();
                            baseFilter.PageNumber = pageNum;
                            baseFilter.PageSize = 100;
                            var pagedPayments = await _paymentRepository.GetPagedListAsync(job.TenantId, baseFilter);
                            if (pagedPayments.Items.Count == 0) break;
                            allPayments.AddRange(pagedPayments.Items);
                            await UpdateJobProgressAsync(job, allPayments.Count, Math.Max(allPayments.Count, pagedPayments.TotalCount), cancellationToken);
                            if (allPayments.Count >= pagedPayments.TotalCount || pagedPayments.Items.Count < 100) break;
                            pageNum++;
                        }
                        recordCount = allPayments.Count;
                        fileBytes = GeneratePaymentExport(allPayments, job.ExportFormat);
                    }
                    else if (string.Equals(job.JobType, "Customer", StringComparison.OrdinalIgnoreCase))
                    {
                        var allCustomers = new List<Customer>();
                        var baseFilter = ParseFilter<CustomerQueryParameters>(job.FilterParametersJson) ?? new CustomerQueryParameters();
                        int pageNum = 1;
                        while (true)
                        {
                            cancellationToken.ThrowIfCancellationRequested();
                            baseFilter.PageNumber = pageNum;
                            baseFilter.PageSize = 100;
                            var (customers, total) = await _customerRepository.GetPagedListAsync(job.TenantId, baseFilter);
                            if (customers.Count == 0) break;
                            allCustomers.AddRange(customers);
                            await UpdateJobProgressAsync(job, allCustomers.Count, Math.Max(allCustomers.Count, total), cancellationToken);
                            if (allCustomers.Count >= total || customers.Count < 100) break;
                            pageNum++;
                        }
                        recordCount = allCustomers.Count;
                        fileBytes = GenerateCustomerExport(allCustomers, job.ExportFormat);
                    }
                    else if (string.Equals(job.JobType, "AuditLog", StringComparison.OrdinalIgnoreCase))
                    {
                        var allAuditLogs = new List<AuditLog>();
                        var baseFilter = ParseFilter<AuditLogFilterRequest>(job.FilterParametersJson) ?? new AuditLogFilterRequest();
                        int pageNum = 1;
                        while (true)
                        {
                            cancellationToken.ThrowIfCancellationRequested();
                            baseFilter.Page = pageNum;
                            baseFilter.PageSize = 1000;
                            var (auditLogs, total) = await _auditLogRepository.GetFilteredPagedAsync(job.TenantId, baseFilter, cancellationToken);
                            if (auditLogs.Count == 0) break;
                            allAuditLogs.AddRange(auditLogs);
                            await UpdateJobProgressAsync(job, allAuditLogs.Count, Math.Max(allAuditLogs.Count, total), cancellationToken);
                            if (allAuditLogs.Count >= total || auditLogs.Count < 1000) break;
                            pageNum++;
                        }
                        recordCount = allAuditLogs.Count;
                        fileBytes = GenerateAuditLogExport(allAuditLogs, job.ExportFormat);
                    }
                    else if (string.Equals(job.JobType, "CreditNote", StringComparison.OrdinalIgnoreCase))
                    {
                        if (_creditNoteRepository == null)
                            throw new InvalidOperationException("Credit note export is not configured.");

                        var allCreditNotes = new List<CreditNoteListItemDto>();
                        var baseFilter = ParseFilter<CreditNoteFilterRequest>(job.FilterParametersJson) ?? new CreditNoteFilterRequest();
                        var pageNumber = 1;
                        while (true)
                        {
                            cancellationToken.ThrowIfCancellationRequested();
                            baseFilter.Page = pageNumber;
                            baseFilter.PageSize = 100;
                            var page = await _creditNoteRepository.GetPagedAsync(
                                job.TenantId,
                                baseFilter,
                                cancellationToken: cancellationToken);
                            if (page.Items.Count == 0) break;
                            allCreditNotes.AddRange(page.Items);
                            await UpdateJobProgressAsync(job, allCreditNotes.Count, Math.Max(allCreditNotes.Count, page.TotalCount), cancellationToken);
                            if (allCreditNotes.Count >= page.TotalCount || page.Items.Count < 100) break;
                            pageNumber++;
                        }

                        var rows = allCreditNotes.Select(note => new
                        {
                            note.Id,
                            note.CreditNoteNumber,
                            note.InvoiceId,
                            note.InvoiceNumber,
                            note.CustomerId,
                            note.CustomerName,
                            CreditDate = note.CreditDate.ToString("yyyy-MM-dd"),
                            note.Type,
                            note.Subtotal,
                            note.TaxAmount,
                            note.TotalAmount,
                            note.RefundedAmount,
                            note.RemainingRefundableAmount,
                            note.Status,
                            note.Reason,
                            note.Currency,
                            CreatedAtUtc = note.CreatedAtUtc.ToString("yyyy-MM-dd HH:mm:ss")
                        });
                        recordCount = allCreditNotes.Count;
                        fileBytes = GenerateRecordExport(rows, job.ExportFormat);
                    }
                    else if (string.Equals(job.JobType, "Quotation", StringComparison.OrdinalIgnoreCase))
                    {
                        if (_quotationRepository == null)
                            throw new InvalidOperationException("Quotation export is not configured.");

                        var allQuotations = new List<Quotation>();
                        var baseFilter = ParseFilter<QuotationListFilterRequest>(job.FilterParametersJson) ?? new QuotationListFilterRequest();
                        var pageNumber = 1;
                        while (true)
                        {
                            cancellationToken.ThrowIfCancellationRequested();
                            baseFilter.PageNumber = pageNumber;
                            baseFilter.PageSize = 100;
                            var page = await _quotationRepository.GetPagedListAsync(
                                job.TenantId,
                                baseFilter);
                            if (page.Items.Count == 0) break;
                            allQuotations.AddRange(page.Items);
                            await UpdateJobProgressAsync(job, allQuotations.Count, Math.Max(allQuotations.Count, page.TotalCount), cancellationToken);
                            if (allQuotations.Count >= page.TotalCount || page.Items.Count < 100) break;
                            pageNumber++;
                        }

                        var rows = allQuotations.Select(quotation => new
                        {
                            quotation.Id,
                            quotation.QuoteNumber,
                            quotation.CustomerId,
                            CustomerName = quotation.Customer?.Name,
                            CustomerEmail = quotation.Customer?.Email,
                            QuotationDate = quotation.QuotationDate.ToString("yyyy-MM-dd"),
                            ValidUntil = quotation.ValidUntil.ToString("yyyy-MM-dd"),
                            quotation.Reference,
                            Status = quotation.Status.ToString(),
                            quotation.Subtotal,
                            quotation.DiscountAmount,
                            quotation.TaxAmount,
                            quotation.ChargesAmount,
                            quotation.TotalAmount,
                            ItemCount = quotation.Items?.Count ?? 0,
                            quotation.ConvertedInvoiceId,
                            CreatedAtUtc = quotation.CreatedAtUtc.ToString("yyyy-MM-dd HH:mm:ss")
                        });
                        recordCount = allQuotations.Count;
                        fileBytes = GenerateRecordExport(rows, job.ExportFormat);
                    }
                    else if (string.Equals(job.JobType, "Product", StringComparison.OrdinalIgnoreCase))
                    {
                        if (_productRepository == null)
                            throw new InvalidOperationException("Product export is not configured.");

                        var allProducts = new List<Product>();
                        var baseFilter = ParseFilter<ProductQueryParameters>(job.FilterParametersJson) ?? new ProductQueryParameters();
                        var pageNumber = 1;
                        while (true)
                        {
                            cancellationToken.ThrowIfCancellationRequested();
                            baseFilter.PageNumber = pageNumber;
                            baseFilter.PageSize = 100;
                            var page = await _productRepository.GetPagedListAsync(
                                job.TenantId,
                                baseFilter);
                            if (page.Items.Count == 0) break;
                            allProducts.AddRange(page.Items);
                            await UpdateJobProgressAsync(job, allProducts.Count, Math.Max(allProducts.Count, page.TotalCount), cancellationToken);
                            if (allProducts.Count >= page.TotalCount || page.Items.Count < 100) break;
                            pageNumber++;
                        }

                        var rows = allProducts.Select(product => new
                        {
                            product.Id,
                            product.ProductCode,
                            product.Name,
                            product.Description,
                            product.Type,
                            Category = product.ProductCategory?.Name ?? product.Category,
                            product.Unit,
                            product.Price,
                            product.Currency,
                            product.TaxCategory,
                            product.HsnSacCode,
                            product.DiscountAllowed,
                            product.DiscountPercent,
                            product.Status,
                            CreatedAtUtc = product.CreatedAtUtc.ToString("yyyy-MM-dd HH:mm:ss")
                        });
                        recordCount = allProducts.Count;
                        fileBytes = GenerateRecordExport(rows, job.ExportFormat);
                    }
                    else
                    {
                        throw new InvalidOperationException($"Unsupported job type '{job.JobType}'.");
                    }

                    cancellationToken.ThrowIfCancellationRequested();

                    job.ContentType = GetContentType(job.ExportFormat);
                    var storagePath = await _storageService.SaveDocumentAsync(fileBytes, fileName, job.ContentType, job.TenantId, cancellationToken);

                    job.StoragePath = storagePath;
                    job.FileName = fileName;
                    job.FileSizeBytes = fileBytes.Length;
                    job.TotalRecords = recordCount;
                    job.ProcessedRecords = recordCount;
                    job.Status = "Completed";
                    job.CompletedAtUtc = DateTime.UtcNow;
                    job.ErrorMessage = null;

                    await _exportJobRepository.UpdateAsync(job, cancellationToken);
                    processedCount++;
                }
                catch (OperationCanceledException)
                {
                    _logger.LogWarning("Export job {JobId} was cancelled before completion.", job.Id);
                    job.Status = "Failed";
                    job.ErrorMessage = "Export job was cancelled before completion.";
                    job.CompletedAtUtc = DateTime.UtcNow;
                    await _exportJobRepository.UpdateAsync(job, CancellationToken.None);
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to process export job {JobId}", job.Id);
                    job.Status = "Failed";
                    job.ErrorMessage = ex.Message;
                    job.CompletedAtUtc = DateTime.UtcNow;
                    await _exportJobRepository.UpdateAsync(job, CancellationToken.None);
                }
            }

            sw.Stop();
            return new JobExecutionResultDto
            {
                JobName = "ExportJob",
                Success = true,
                ProcessedCount = processedCount,
                Duration = sw.Elapsed,
                Message = $"Export job processor processed {processedCount} pending jobs."
            };
        }
        catch (Exception ex)
        {
            sw.Stop();
            _logger.LogError(ex, "Error occurred during ExportJob background execution.");
            return new JobExecutionResultDto
            {
                JobName = "ExportJob",
                Success = false,
                ProcessedCount = processedCount,
                Duration = sw.Elapsed,
                Message = $"Failed to execute ExportJob: {ex.Message}"
            };
        }
    }

    private async Task UpdateJobProgressAsync(ExportJob job, int processedRecords, int totalRecords, CancellationToken cancellationToken)
    {
        job.ProcessedRecords = processedRecords;
        job.TotalRecords = totalRecords;
        await _exportJobRepository.UpdateAsync(job, cancellationToken);
    }

    private static T? ParseFilter<T>(string? filterJson) where T : class
    {
        if (string.IsNullOrWhiteSpace(filterJson)) return null;
        try
        {
            return JsonSerializer.Deserialize<T>(filterJson, FilterJsonOptions);
        }
        catch
        {
            return null;
        }
    }

    private static List<Invoice> ApplyInvoiceFilter(List<Invoice> invoices, InvoiceFilterRequest filter)
    {
        IEnumerable<Invoice> query = invoices;

        if (!string.IsNullOrWhiteSpace(filter.Status))
        {
            var status = filter.Status.Trim();
            query = query.Where(i => string.Equals(i.Status, status, StringComparison.OrdinalIgnoreCase));
        }

        if (filter.CustomerId.HasValue)
        {
            query = query.Where(i => i.CustomerId == filter.CustomerId.Value);
        }

        if (!string.IsNullOrWhiteSpace(filter.Currency))
        {
            var currency = filter.Currency.Trim();
            query = query.Where(i => string.Equals(i.GetCurrency(), currency, StringComparison.OrdinalIgnoreCase));
        }

        if (filter.StartDate.HasValue)
        {
            var start = filter.StartDate.Value.Date;
            query = query.Where(i => i.InvoiceDate.Date >= start);
        }

        if (filter.EndDate.HasValue)
        {
            var end = filter.EndDate.Value.Date;
            query = query.Where(i => i.InvoiceDate.Date <= end);
        }

        if (!string.IsNullOrWhiteSpace(filter.SearchTerm))
        {
            var term = filter.SearchTerm.Trim();
            query = query.Where(i =>
                (i.InvoiceNumber != null && i.InvoiceNumber.Contains(term, StringComparison.OrdinalIgnoreCase)) ||
                (i.Customer?.Name != null && i.Customer.Name.Contains(term, StringComparison.OrdinalIgnoreCase)) ||
                (i.Customer?.Email != null && i.Customer.Email.Contains(term, StringComparison.OrdinalIgnoreCase)));
        }

        return query.ToList();
    }

    private static byte[] GenerateInvoiceExport(List<Invoice> invoices, string format)
    {
        if (string.Equals(format, "JSON", StringComparison.OrdinalIgnoreCase))
        {
            var data = invoices.Select(i => new
            {
                i.Id,
                i.InvoiceNumber,
                Date = i.InvoiceDate.ToString("yyyy-MM-dd"),
                DueDate = i.DueDate?.ToString("yyyy-MM-dd"),
                CustomerName = i.Customer?.Name,
                CustomerEmail = i.Customer?.Email,
                Currency = i.GetCurrency(),
                i.Subtotal,
                i.DiscountAmount,
                i.TaxAmount,
                i.ChargesAmount,
                i.TotalAmount,
                i.PaidAmount,
                i.BalanceAmount,
                i.Status
            });
            return Encoding.UTF8.GetBytes(JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = true }));
        }

        var sb = new StringBuilder();
        sb.AppendLine("Id,InvoiceNumber,Date,DueDate,CustomerName,CustomerEmail,Currency,Subtotal,DiscountAmount,TaxAmount,ChargesAmount,TotalAmount,PaidAmount,BalanceAmount,Status");
        foreach (var i in invoices)
        {
            sb.AppendLine(string.Join(",",
                i.Id,
                EscapeCsv(i.InvoiceNumber),
                i.InvoiceDate.ToString("yyyy-MM-dd"),
                i.DueDate?.ToString("yyyy-MM-dd") ?? "",
                EscapeCsv(i.Customer?.Name ?? ""),
                EscapeCsv(i.Customer?.Email ?? ""),
                EscapeCsv(i.GetCurrency()),
                i.Subtotal.ToString("F2", CultureInfo.InvariantCulture),
                i.DiscountAmount.ToString("F2", CultureInfo.InvariantCulture),
                i.TaxAmount.ToString("F2", CultureInfo.InvariantCulture),
                i.ChargesAmount.ToString("F2", CultureInfo.InvariantCulture),
                i.TotalAmount.ToString("F2", CultureInfo.InvariantCulture),
                i.PaidAmount.ToString("F2", CultureInfo.InvariantCulture),
                i.BalanceAmount.ToString("F2", CultureInfo.InvariantCulture),
                EscapeCsv(i.Status)
            ));
        }

        return Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(sb.ToString())).ToArray();
    }

    private static byte[] GeneratePaymentExport(List<Payment> payments, string format)
    {
        if (string.Equals(format, "JSON", StringComparison.OrdinalIgnoreCase))
        {
            var data = payments.Select(p => new
            {
                p.Id,
                p.PaymentNumber,
                PaymentDate = p.PaymentDate.ToString("yyyy-MM-dd"),
                p.CustomerId,
                p.Amount,
                p.Currency,
                p.AllocatedAmount,
                Method = p.Method.ToString(),
                p.Reference,
                Status = p.Status.ToString()
            });
            return Encoding.UTF8.GetBytes(JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = true }));
        }

        var sb = new StringBuilder();
        sb.AppendLine("Id,PaymentNumber,PaymentDate,CustomerId,Amount,Currency,AllocatedAmount,Method,Reference,Status");
        foreach (var p in payments)
        {
            sb.AppendLine(string.Join(",",
                p.Id,
                EscapeCsv(p.PaymentNumber),
                p.PaymentDate.ToString("yyyy-MM-dd"),
                p.CustomerId.ToString(),
                p.Amount.ToString("F2", CultureInfo.InvariantCulture),
                EscapeCsv(p.Currency),
                p.AllocatedAmount.ToString("F2", CultureInfo.InvariantCulture),
                EscapeCsv(p.Method.ToString()),
                EscapeCsv(p.Reference ?? ""),
                EscapeCsv(p.Status.ToString())
            ));
        }

        return Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(sb.ToString())).ToArray();
    }

    private static byte[] GenerateCustomerExport(List<Customer> customers, string format)
    {
        if (string.Equals(format, "JSON", StringComparison.OrdinalIgnoreCase))
        {
            var data = customers.Select(c => new
            {
                c.Id,
                c.CustomerCode,
                c.Name,
                c.Email,
                c.Phone,
                c.CompanyName,
                c.TaxId,
                c.Status,
                CreatedAtUtc = c.CreatedAtUtc.ToString("yyyy-MM-dd HH:mm:ss")
            });
            return Encoding.UTF8.GetBytes(JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = true }));
        }

        var sb = new StringBuilder();
        sb.AppendLine("Id,CustomerCode,Name,Email,Phone,CompanyName,TaxId,Status,CreatedAtUtc");
        foreach (var c in customers)
        {
            sb.AppendLine(string.Join(",",
                c.Id,
                EscapeCsv(c.CustomerCode),
                EscapeCsv(c.Name),
                EscapeCsv(c.Email),
                EscapeCsv(c.Phone ?? ""),
                EscapeCsv(c.CompanyName ?? ""),
                EscapeCsv(c.TaxId ?? ""),
                EscapeCsv(c.Status),
                c.CreatedAtUtc.ToString("yyyy-MM-dd HH:mm:ss")
            ));
        }

        return Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(sb.ToString())).ToArray();
    }

    private static byte[] GenerateAuditLogExport(List<AuditLog> auditLogs, string format)
    {
        if (string.Equals(format, "JSON", StringComparison.OrdinalIgnoreCase))
        {
            var data = auditLogs.Select(a => new
            {
                a.Id,
                Timestamp = a.Timestamp.ToString("yyyy-MM-dd HH:mm:ss"),
                a.Action,
                a.EntityName,
                a.EntityId,
                a.UserName,
                a.Changes
            });
            return Encoding.UTF8.GetBytes(JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = true }));
        }

        var sb = new StringBuilder();
        sb.AppendLine("Id,Timestamp,Action,EntityName,EntityId,UserName,Changes");
        foreach (var a in auditLogs)
        {
            sb.AppendLine(string.Join(",",
                a.Id,
                a.Timestamp.ToString("yyyy-MM-dd HH:mm:ss"),
                EscapeCsv(a.Action),
                EscapeCsv(a.EntityName),
                EscapeCsv(a.EntityId),
                EscapeCsv(a.UserName),
                EscapeCsv(a.Changes ?? "")
            ));
        }

        return Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(sb.ToString())).ToArray();
    }

    private static byte[] GenerateRecordExport<T>(IEnumerable<T> records, string format)
    {
        var json = JsonSerializer.SerializeToElement(records);
        if (string.Equals(format, "JSON", StringComparison.OrdinalIgnoreCase))
        {
            return Encoding.UTF8.GetBytes(JsonSerializer.Serialize(json, new JsonSerializerOptions { WriteIndented = true }));
        }

        var rows = json.EnumerateArray().ToList();
        var sb = new StringBuilder();
        var headers = rows.Count > 0
            ? rows[0].EnumerateObject().Select(property => property.Name).ToArray()
            : typeof(T).GetProperties().Select(property => property.Name).ToArray();
        if (headers.Length > 0)
        {
            sb.AppendLine(string.Join(",", headers.Select(EscapeCsv)));
            foreach (var row in rows)
            {
                sb.AppendLine(string.Join(",", headers.Select(header =>
                {
                    if (!row.TryGetProperty(header, out var value) || value.ValueKind == JsonValueKind.Null)
                        return string.Empty;
                    var text = value.ValueKind == JsonValueKind.String ? value.GetString() ?? string.Empty : value.ToString();
                    return EscapeCsv(text);
                })));
            }
        }

        return Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(sb.ToString())).ToArray();
    }

    private static string EscapeCsv(string? value)
    {
        if (string.IsNullOrEmpty(value)) return "";

        var sanitized = value;
        var trimmed = sanitized.TrimStart(' ', '\t', '\r', '\n');
        var firstChar = sanitized[0];
        var firstNonWsChar = trimmed.Length > 0 ? trimmed[0] : '\0';

        if (firstChar is '=' or '@' or '\t' or '\r' ||
            firstNonWsChar is '=' or '@' ||
            ((firstChar is '+' or '-') && !decimal.TryParse(sanitized, NumberStyles.Any, CultureInfo.InvariantCulture, out _)) ||
            ((firstNonWsChar is '+' or '-') && !decimal.TryParse(trimmed, NumberStyles.Any, CultureInfo.InvariantCulture, out _)))
        {
            sanitized = "'" + sanitized;
        }

        if (sanitized.Contains(',') || sanitized.Contains('"') || sanitized.Contains('\n') || sanitized.Contains('\r'))
        {
            return $"\"{sanitized.Replace("\"", "\"\"")}\"";
        }
        return sanitized;
    }

    private static string GetContentType(string format) => format.ToUpperInvariant() switch
    {
        "CSV" => "text/csv",
        "JSON" => "application/json",
        _ => throw new InvalidOperationException($"Unsupported export format '{format}'.")
    };

    private static string? NormalizeJobType(string? rawJobType) => (rawJobType ?? "Invoice").Trim().Replace(" ", "").Replace("-", "").Replace("_", "").ToLowerInvariant() switch { "invoice" or "invoices" => "Invoice", "payment" or "payments" => "Payment", "customer" or "customers" => "Customer", "auditlog" or "auditlogs" => "AuditLog", "creditnote" or "creditnotes" => "CreditNote", "quotation" or "quotations" => "Quotation", "product" or "products" => "Product", _ => null };

    private static ExportJobDto MapToDto(ExportJob job)
    {
        return new ExportJobDto
        {
            Id = job.Id,
            TenantId = job.TenantId,
            JobType = job.JobType,
            ExportFormat = job.ExportFormat,
            Status = job.Status,
            FilterParametersJson = job.FilterParametersJson,
            StoragePath = job.StoragePath,
            FileName = job.FileName,
            FileSizeBytes = job.FileSizeBytes,
            ContentType = job.ContentType,
            TotalRecords = job.TotalRecords,
            ProcessedRecords = job.ProcessedRecords,
            ErrorMessage = job.ErrorMessage,
            RequestedBy = job.RequestedBy,
            CreatedAtUtc = job.CreatedAtUtc,
            StartedAtUtc = job.StartedAtUtc,
            CompletedAtUtc = job.CompletedAtUtc,
            DownloadUrl = job.Status == "Completed" ? $"/api/v1/export-jobs/{job.Id}/download" : null
        };
    }
}
