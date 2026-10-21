using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.Json;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.BackgroundJobs;
using Billing.Contracts.Export;
using Billing.Contracts.Payment;
using Billing.Domain.Entities;
using Microsoft.Extensions.Logging;

namespace Billing.Application.Services;

public class ExportJobService : IExportJobService
{
    private readonly IExportJobRepository _exportJobRepository;
    private readonly IInvoiceRepository _invoiceRepository;
    private readonly IPaymentRepository _paymentRepository;
    private readonly ICustomerRepository _customerRepository;
    private readonly IAuditLogRepository _auditLogRepository;
    private readonly IDocumentStorageService _storageService;
    private readonly ILogger<ExportJobService> _logger;

    public ExportJobService(
        IExportJobRepository exportJobRepository,
        IInvoiceRepository invoiceRepository,
        IPaymentRepository paymentRepository,
        ICustomerRepository customerRepository,
        IAuditLogRepository auditLogRepository,
        IDocumentStorageService storageService,
        ILogger<ExportJobService> logger)
    {
        _exportJobRepository = exportJobRepository;
        _invoiceRepository = invoiceRepository;
        _paymentRepository = paymentRepository;
        _customerRepository = customerRepository;
        _auditLogRepository = auditLogRepository;
        _storageService = storageService;
        _logger = logger;
    }

    public async Task<ApiResponse<ExportJobDto>> QueueExportJobAsync(CreateExportJobRequest request, int tenantId, string requestedBy, CancellationToken cancellationToken = default)
    {
        var jobType = (request.JobType ?? "Invoice").Trim();
        var format = (request.ExportFormat ?? "CSV").Trim().ToUpperInvariant();

        if (format != "CSV" && format != "JSON")
        {
            return ApiResponse<ExportJobDto>.Fail("Supported export formats are 'CSV' and 'JSON'.");
        }

        var validTypes = new[] { "Invoice", "Payment", "Customer", "AuditLog" };
        if (!validTypes.Contains(jobType, StringComparer.OrdinalIgnoreCase))
        {
            return ApiResponse<ExportJobDto>.Fail($"Invalid jobType '{jobType}'. Supported: Invoice, Payment, Customer, AuditLog.");
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
        var paged = await _exportJobRepository.GetPagedAsync(tenantId, filter, cancellationToken);
        var dtos = paged.Items.Select(MapToDto).ToList();

        var result = new PagedResult<ExportJobDto>(dtos, paged.TotalCount, paged.PageNumber, paged.PageSize);
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
                        var invoices = await _invoiceRepository.GetAllAsync(job.TenantId);
                        recordCount = invoices.Count;
                        fileBytes = GenerateInvoiceExport(invoices, job.ExportFormat);
                    }
                    else if (string.Equals(job.JobType, "Payment", StringComparison.OrdinalIgnoreCase))
                    {
                        var allPayments = new List<Payment>();
                        int pageNum = 1;
                        while (true)
                        {
                            if (cancellationToken.IsCancellationRequested) break;
                            var pagedPayments = await _paymentRepository.GetPagedListAsync(job.TenantId, new PaymentListFilterRequest { PageNumber = pageNum, PageSize = 100 });
                            if (pagedPayments.Items.Count == 0) break;
                            allPayments.AddRange(pagedPayments.Items);
                            if (allPayments.Count >= pagedPayments.TotalCount || pagedPayments.Items.Count < 100) break;
                            pageNum++;
                        }
                        recordCount = allPayments.Count;
                        fileBytes = GeneratePaymentExport(allPayments, job.ExportFormat);
                    }
                    else if (string.Equals(job.JobType, "Customer", StringComparison.OrdinalIgnoreCase))
                    {
                        var allCustomers = new List<Customer>();
                        int pageNum = 1;
                        while (true)
                        {
                            if (cancellationToken.IsCancellationRequested) break;
                            var (customers, total) = await _customerRepository.GetPagedListAsync(job.TenantId, new CustomerQueryParameters { PageNumber = pageNum, PageSize = 100 });
                            if (customers.Count == 0) break;
                            allCustomers.AddRange(customers);
                            if (allCustomers.Count >= total || customers.Count < 100) break;
                            pageNum++;
                        }
                        recordCount = allCustomers.Count;
                        fileBytes = GenerateCustomerExport(allCustomers, job.ExportFormat);
                    }
                    else if (string.Equals(job.JobType, "AuditLog", StringComparison.OrdinalIgnoreCase))
                    {
                        var allAuditLogs = new List<AuditLog>();
                        int pageNum = 1;
                        while (true)
                        {
                            if (cancellationToken.IsCancellationRequested) break;
                            var (auditLogs, total) = await _auditLogRepository.GetFilteredPagedAsync(job.TenantId, new AuditLogFilterRequest { Page = pageNum, PageSize = 1000 }, cancellationToken);
                            if (auditLogs.Count == 0) break;
                            allAuditLogs.AddRange(auditLogs);
                            if (allAuditLogs.Count >= total || auditLogs.Count < 1000) break;
                            pageNum++;
                        }
                        recordCount = allAuditLogs.Count;
                        fileBytes = GenerateAuditLogExport(allAuditLogs, job.ExportFormat);
                    }
                    else
                    {
                        throw new InvalidOperationException($"Unsupported job type '{job.JobType}'.");
                    }

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
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to process export job {JobId}", job.Id);
                    job.Status = "Failed";
                    job.ErrorMessage = ex.Message;
                    job.CompletedAtUtc = DateTime.UtcNow;
                    await _exportJobRepository.UpdateAsync(job, cancellationToken);
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

    private static string EscapeCsv(string value)
    {
        if (string.IsNullOrEmpty(value)) return "";
        if (value.Contains(',') || value.Contains('"') || value.Contains('\n') || value.Contains('\r'))
        {
            return $"\"{value.Replace("\"", "\"\"")}\"";
        }
        return value;
    }

    private static string GetContentType(string format) => format.ToUpperInvariant() switch
    {
        "CSV" => "text/csv",
        "JSON" => "application/json",
        _ => throw new InvalidOperationException($"Unsupported export format '{format}'.")
    };

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
