using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Notification;
using Billing.Domain.Entities;
using Billing.Domain.Enums;
using Microsoft.Extensions.Logging;

namespace Billing.Application.Services;

public class NotificationService : INotificationService
{
    private readonly INotificationTemplateRepository _templateRepository;
    private readonly INotificationLogRepository _logRepository;
    private readonly ITemplateEngineService _templateEngine;
    private readonly IEmailService _emailService;
    private readonly IInvoiceRepository _invoiceRepository;
    private readonly IPaymentRepository _paymentRepository;
    private readonly IQuotationRepository _quotationRepository;
    private readonly ICreditNoteRepository _creditNoteRepository;
    private readonly ITenantRepository _tenantRepository;
    private readonly IAuditLogRepository _auditLogRepository;
    private readonly ILogger<NotificationService> _logger;
    private readonly IQuotationPdfEngine? _quotationPdfEngine;

    public NotificationService(
        INotificationTemplateRepository templateRepository,
        INotificationLogRepository logRepository,
        ITemplateEngineService templateEngine,
        IEmailService emailService,
        IInvoiceRepository invoiceRepository,
        IPaymentRepository paymentRepository,
        IQuotationRepository quotationRepository,
        ICreditNoteRepository creditNoteRepository,
        ITenantRepository tenantRepository,
        IAuditLogRepository auditLogRepository,
        ILogger<NotificationService> logger,
        IQuotationPdfEngine? quotationPdfEngine = null)
    {
        _templateRepository = templateRepository;
        _logRepository = logRepository;
        _templateEngine = templateEngine;
        _emailService = emailService;
        _invoiceRepository = invoiceRepository;
        _paymentRepository = paymentRepository;
        _quotationRepository = quotationRepository;
        _creditNoteRepository = creditNoteRepository;
        _tenantRepository = tenantRepository;
        _auditLogRepository = auditLogRepository;
        _logger = logger;
        _quotationPdfEngine = quotationPdfEngine;
    }

    public async Task<ApiResponse<NotificationLogDto>> SendInvoiceNotificationAsync(
        int invoiceId,
        int tenantId,
        string eventType = "InvoiceSent",
        string? userName = null,
        byte[]? pdfBytes = null,
        string? pdfFileName = null)
    {
        var invoice = await _invoiceRepository.GetByIdAsync(invoiceId, tenantId);
        if (invoice == null)
            return ApiResponse<NotificationLogDto>.Fail("Invoice not found.");

        if (invoice.Customer == null || string.IsNullOrWhiteSpace(invoice.Customer.Email))
            return ApiResponse<NotificationLogDto>.Fail("Customer does not have a valid email address.");

        var tenant = await _tenantRepository.GetByIdAsync(tenantId);
        var companyName = tenant?.Name ?? "Our Company";
        var supportEmail = tenant?.CompanyEmail ?? "support@company.com";
        var currency = invoice.GetCurrency();

        var variables = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["CustomerName"] = invoice.Customer.Name,
            ["CustomerEmail"] = invoice.Customer.Email,
            ["CompanyName"] = companyName,
            ["SupportEmail"] = supportEmail,
            ["Currency"] = currency,
            ["InvoiceNumber"] = invoice.InvoiceNumber,
            ["InvoiceDate"] = invoice.InvoiceDate.ToString("dd MMM yyyy"),
            ["DueDate"] = invoice.DueDate?.ToString("dd MMM yyyy") ?? "Upon Receipt",
            ["TotalAmount"] = invoice.TotalAmount.ToString("N2"),
            ["BalanceAmount"] = invoice.BalanceAmount.ToString("N2"),
            ["PaymentLink"] = $"/portal/invoices/{invoice.InvoiceNumber}/pay"
        };

        var template = await _templateRepository.GetActiveTemplateAsync(tenantId, eventType, "Email");
        string subject;
        string body;

        if (template != null)
        {
            subject = _templateEngine.Render(template.SubjectTemplate, variables);
            body = _templateEngine.Render(template.BodyTemplate, variables);
        }
        else
        {
            subject = $"Invoice {invoice.InvoiceNumber} from {companyName}";
            body = $"<p>Dear {invoice.Customer.Name},</p><p>Please find attached invoice <strong>{invoice.InvoiceNumber}</strong> for {currency} {invoice.TotalAmount:N2}.</p><p>Regards,<br>{companyName}</p>";
        }

        var log = new NotificationLog
        {
            TenantId = tenantId,
            EventType = eventType,
            EntityType = "Invoice",
            EntityId = invoice.Id,
            Channel = "Email",
            Recipient = invoice.Customer.Email,
            Subject = subject,
            Message = body,
            Status = "Queued",
            SentAtUtc = DateTime.UtcNow,
            SentBy = userName ?? "System",
            RetryCount = 0
        };

        try
        {
            await _emailService.SendEmailAsync(
                invoice.Customer.Email,
                subject,
                body,
                pdfBytes,
                pdfFileName ?? $"{invoice.InvoiceNumber}.pdf");

            log.Status = "Sent";
            log.SentAtUtc = DateTime.UtcNow;
            await _logRepository.AddAsync(log);

            await _auditLogRepository.AddAsync(new AuditLog
            {
                TenantId = tenantId,
                EntityName = "Invoice",
                EntityId = invoice.Id.ToString(),
                Action = "NotificationSent",
                UserName = userName ?? "System",
                Changes = $"Sent {eventType} email to {invoice.Customer.Email}",
                Timestamp = DateTime.UtcNow
            });

            return ApiResponse<NotificationLogDto>.Ok(MapToDto(log), "Notification sent successfully.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send invoice notification for invoice {InvoiceId}", invoiceId);
            log.Status = "Failed";
            log.FailureReason = ex.Message;
            log.NextRetryAtUtc = DateTime.UtcNow.AddMinutes(5);
            await _logRepository.AddAsync(log);

            return ApiResponse<NotificationLogDto>.Fail($"Failed to dispatch email: {ex.Message}", new List<string> { ex.Message });
        }
    }

    public async Task<ApiResponse<NotificationLogDto>> SendPaymentNotificationAsync(
        int paymentId,
        int tenantId,
        string eventType = "PaymentReceived",
        string? userName = null)
    {
        var payment = await _paymentRepository.GetByIdAsync(tenantId, paymentId);
        if (payment == null)
            return ApiResponse<NotificationLogDto>.Fail("Payment record not found.");

        var customerEmail = payment.Customer?.Email;
        var customerName = payment.Customer?.Name ?? "Valued Customer";

        if (string.IsNullOrWhiteSpace(customerEmail))
            return ApiResponse<NotificationLogDto>.Fail("Customer does not have an email address configured.");

        var tenant = await _tenantRepository.GetByIdAsync(tenantId);
        var companyName = tenant?.Name ?? "Our Company";
        var supportEmail = tenant?.CompanyEmail ?? "support@company.com";
        var currency = payment.Currency ?? "INR";

        var firstAllocation = payment.Allocations?.FirstOrDefault();
        var invoiceNumber = firstAllocation?.Invoice?.InvoiceNumber ?? "N/A";
        var remainingBalance = firstAllocation?.Invoice?.BalanceAmount.ToString("N2") ?? "0.00";

        var variables = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["CustomerName"] = customerName,
            ["CustomerEmail"] = customerEmail,
            ["CompanyName"] = companyName,
            ["SupportEmail"] = supportEmail,
            ["Currency"] = currency,
            ["PaymentNumber"] = payment.PaymentNumber,
            ["PaymentDate"] = payment.PaymentDate.ToString("dd MMM yyyy"),
            ["PaymentMethod"] = payment.Method.ToString(),
            ["AmountPaid"] = payment.Amount.ToString("N2"),
            ["InvoiceNumber"] = invoiceNumber,
            ["RemainingBalance"] = remainingBalance,
            ["FailureReason"] = eventType == "PaymentFailed" ? "Payment was declined or cancelled." : string.Empty,
            ["PaymentLink"] = $"/portal/invoices/{invoiceNumber}/pay"
        };

        var template = await _templateRepository.GetActiveTemplateAsync(tenantId, eventType, "Email");
        string subject;
        string body;

        if (template != null)
        {
            subject = _templateEngine.Render(template.SubjectTemplate, variables);
            body = _templateEngine.Render(template.BodyTemplate, variables);
        }
        else
        {
            subject = eventType == "PaymentReceived"
                ? $"Payment Receipt: {payment.PaymentNumber} from {companyName}"
                : $"Payment Failed for Invoice {invoiceNumber}";
            body = $"<p>Dear {customerName},</p><p>Payment receipt for {payment.PaymentNumber}: {currency} {payment.Amount:N2}.</p><p>Regards,<br>{companyName}</p>";
        }

        var log = new NotificationLog
        {
            TenantId = tenantId,
            EventType = eventType,
            EntityType = "Payment",
            EntityId = payment.Id,
            Channel = "Email",
            Recipient = customerEmail,
            Subject = subject,
            Message = body,
            Status = "Queued",
            SentAtUtc = DateTime.UtcNow,
            SentBy = userName ?? "System",
            RetryCount = 0
        };

        try
        {
            await _emailService.SendEmailAsync(customerEmail, subject, body);

            log.Status = "Sent";
            log.SentAtUtc = DateTime.UtcNow;
            await _logRepository.AddAsync(log);

            await _auditLogRepository.AddAsync(new AuditLog
            {
                TenantId = tenantId,
                EntityName = "Payment",
                EntityId = payment.Id.ToString(),
                Action = "NotificationSent",
                UserName = userName ?? "System",
                Changes = $"Sent {eventType} email to {customerEmail}",
                Timestamp = DateTime.UtcNow
            });

            return ApiResponse<NotificationLogDto>.Ok(MapToDto(log), "Payment notification sent successfully.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send payment notification for payment {PaymentId}", paymentId);
            log.Status = "Failed";
            log.FailureReason = ex.Message;
            log.NextRetryAtUtc = DateTime.UtcNow.AddMinutes(5);
            await _logRepository.AddAsync(log);

            return ApiResponse<NotificationLogDto>.Fail($"Failed to send payment email: {ex.Message}");
        }
    }

    public async Task<ApiResponse<NotificationLogDto>> SendQuotationNotificationAsync(
        int quotationId,
        int tenantId,
        string? userName = null,
        byte[]? pdfBytes = null,
        string? pdfFileName = null)
    {
        var quotation = await _quotationRepository.GetByIdAsync(quotationId, tenantId);
        if (quotation == null)
            return ApiResponse<NotificationLogDto>.Fail("Quotation not found.");

        if (quotation.Customer == null || string.IsNullOrWhiteSpace(quotation.Customer.Email))
            return ApiResponse<NotificationLogDto>.Fail("Customer email address is not configured.");

        var tenant = await _tenantRepository.GetByIdAsync(tenantId);
        var companyName = tenant?.Name ?? "Our Company";
        var supportEmail = tenant?.CompanyEmail ?? "support@company.com";
        const string currency = "INR";

        var variables = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["CustomerName"] = quotation.Customer.Name,
            ["CustomerEmail"] = quotation.Customer.Email,
            ["CompanyName"] = companyName,
            ["SupportEmail"] = supportEmail,
            ["Currency"] = currency,
            ["QuotationNumber"] = quotation.QuoteNumber,
            ["QuotationDate"] = quotation.QuotationDate.ToString("dd MMM yyyy"),
            ["ExpiryDate"] = quotation.ValidUntil.ToString("dd MMM yyyy"),
            ["TotalAmount"] = quotation.TotalAmount.ToString("N2")
        };

        var template = await _templateRepository.GetActiveTemplateAsync(tenantId, "QuotationSent", "Email");
        string subject = template != null
            ? _templateEngine.Render(template.SubjectTemplate, variables)
            : $"Quotation {quotation.QuoteNumber} from {companyName}";
        string body = template != null
            ? _templateEngine.Render(template.BodyTemplate, variables)
            : $"<p>Dear {quotation.Customer.Name},</p><p>Please find attached quotation {quotation.QuoteNumber} for {currency} {quotation.TotalAmount:N2}.</p><p>Regards,<br>{companyName}</p>";

        var log = new NotificationLog
        {
            TenantId = tenantId,
            EventType = "QuotationSent",
            EntityType = "Quotation",
            EntityId = quotation.Id,
            Channel = "Email",
            Recipient = quotation.Customer.Email,
            Subject = subject,
            Message = body,
            Status = "Queued",
            SentAtUtc = DateTime.UtcNow,
            SentBy = userName ?? "System",
            RetryCount = 0
        };

        if (pdfBytes == null && _quotationPdfEngine != null)
        {
            try
            {
                pdfBytes = _quotationPdfEngine.GenerateQuotationPdf(quotation, tenant);
            }
            catch
            {
            }
        }

        try
        {
            await _emailService.SendEmailAsync(
                quotation.Customer.Email,
                subject,
                body,
                pdfBytes,
                pdfFileName ?? $"{quotation.QuoteNumber}.pdf");

            log.Status = "Sent";
            log.SentAtUtc = DateTime.UtcNow;
            await _logRepository.AddAsync(log);

            if (quotation.Status == QuotationStatus.Draft)
            {
                quotation.Status = QuotationStatus.Sent;
                await _quotationRepository.UpdateAsync(quotation);
            }

            return ApiResponse<NotificationLogDto>.Ok(MapToDto(log), "Quotation notification sent successfully.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send quotation notification for quotation {QuotationId}", quotationId);
            log.Status = "Failed";
            log.FailureReason = ex.Message;
            log.NextRetryAtUtc = DateTime.UtcNow.AddMinutes(5);
            await _logRepository.AddAsync(log);

            return ApiResponse<NotificationLogDto>.Fail($"Failed to send quotation email: {ex.Message}");
        }
    }

    public async Task<ApiResponse<NotificationLogDto>> SendCreditNoteNotificationAsync(
        int creditNoteId,
        int tenantId,
        string? userName = null,
        byte[]? pdfBytes = null,
        string? pdfFileName = null)
    {
        var creditNote = await _creditNoteRepository.GetByIdAsync(creditNoteId, tenantId);
        if (creditNote == null)
            return ApiResponse<NotificationLogDto>.Fail("Credit Note not found.");

        if (creditNote.Customer == null || string.IsNullOrWhiteSpace(creditNote.Customer.Email))
            return ApiResponse<NotificationLogDto>.Fail("Customer email address is not configured.");

        var tenant = await _tenantRepository.GetByIdAsync(tenantId);
        var companyName = tenant?.Name ?? "Our Company";
        var supportEmail = tenant?.CompanyEmail ?? "support@company.com";
        var currency = creditNote.Invoice?.Currency ?? "INR";

        var variables = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["CustomerName"] = creditNote.Customer.Name,
            ["CustomerEmail"] = creditNote.Customer.Email,
            ["CompanyName"] = companyName,
            ["SupportEmail"] = supportEmail,
            ["Currency"] = currency,
            ["CreditNoteNumber"] = creditNote.CreditNoteNumber,
            ["CreditNoteDate"] = creditNote.CreditDate.ToString("dd MMM yyyy"),
            ["InvoiceNumber"] = creditNote.Invoice?.InvoiceNumber ?? "N/A",
            ["CreditAmount"] = creditNote.TotalAmount.ToString("N2"),
            ["Reason"] = creditNote.Reason ?? "Account Credit Adjustment"
        };

        var template = await _templateRepository.GetActiveTemplateAsync(tenantId, "CreditNoteIssued", "Email");
        string subject = template != null
            ? _templateEngine.Render(template.SubjectTemplate, variables)
            : $"Credit Note {creditNote.CreditNoteNumber} from {companyName}";
        string body = template != null
            ? _templateEngine.Render(template.BodyTemplate, variables)
            : $"<p>Dear {creditNote.Customer.Name},</p><p>Please find attached credit note {creditNote.CreditNoteNumber} for {currency} {creditNote.TotalAmount:N2}.</p><p>Regards,<br>{companyName}</p>";

        var log = new NotificationLog
        {
            TenantId = tenantId,
            EventType = "CreditNoteIssued",
            EntityType = "CreditNote",
            EntityId = creditNote.Id,
            Channel = "Email",
            Recipient = creditNote.Customer.Email,
            Subject = subject,
            Message = body,
            Status = "Queued",
            SentAtUtc = DateTime.UtcNow,
            SentBy = userName ?? "System",
            RetryCount = 0
        };

        try
        {
            await _emailService.SendEmailAsync(
                creditNote.Customer.Email,
                subject,
                body,
                pdfBytes,
                pdfFileName ?? $"{creditNote.CreditNoteNumber}.pdf");

            log.Status = "Sent";
            log.SentAtUtc = DateTime.UtcNow;
            await _logRepository.AddAsync(log);

            return ApiResponse<NotificationLogDto>.Ok(MapToDto(log), "Credit Note notification sent successfully.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send credit note notification for credit note {CreditNoteId}", creditNoteId);
            log.Status = "Failed";
            log.FailureReason = ex.Message;
            log.NextRetryAtUtc = DateTime.UtcNow.AddMinutes(5);
            await _logRepository.AddAsync(log);

            return ApiResponse<NotificationLogDto>.Fail($"Failed to send credit note email: {ex.Message}");
        }
    }

    public async Task<ApiResponse<int>> ProcessOverdueInvoicesAsync(int tenantId, string? userName = null)
    {
        var today = DateTime.UtcNow.Date;
        var tenant = await _tenantRepository.GetByIdAsync(tenantId);
        var companyName = tenant?.Name ?? "Our Company";
        var supportEmail = tenant?.CompanyEmail ?? "support@company.com";

        var filter = new InvoiceFilterRequest
        {
            Page = 1,
            PageSize = 100
        };

        var pagedInvoices = await _invoiceRepository.GetPagedAsync(tenantId, filter);
        var overdueCandidates = pagedInvoices.Items
            .Where(i => i.DueDate.HasValue &&
                        i.DueDate.Value.Date < today &&
                        i.Status != "Paid" &&
                        i.Status != "Cancelled" &&
                        i.Status != "Voided" &&
                        i.BalanceAmount > 0)
            .ToList();

        int sentCount = 0;
        var template = await _templateRepository.GetActiveTemplateAsync(tenantId, "InvoiceOverdue", "Email");

        foreach (var invoice in overdueCandidates)
        {
            if (invoice.Customer == null || string.IsNullOrWhiteSpace(invoice.Customer.Email))
                continue;

            // Check if already sent an overdue notice in the last 7 days
            var recentLog = (await _logRepository.QueryLogsAsync(tenantId, new NotificationLogQueryParameters
            {
                EntityType = "Invoice",
                EntityId = invoice.Id,
                EventType = "InvoiceOverdue",
                Status = "Sent",
                StartDate = today.AddDays(-7),
                PageSize = 1
            })).Items.FirstOrDefault();

            if (recentLog != null) continue; // Skip to avoid spamming customer

            var daysOverdue = (int)(today - invoice.DueDate!.Value.Date).TotalDays;
            var currency = invoice.GetCurrency();

            var variables = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["CustomerName"] = invoice.Customer.Name,
                ["CustomerEmail"] = invoice.Customer.Email,
                ["CompanyName"] = companyName,
                ["SupportEmail"] = supportEmail,
                ["Currency"] = currency,
                ["InvoiceNumber"] = invoice.InvoiceNumber,
                ["InvoiceDate"] = invoice.InvoiceDate.ToString("dd MMM yyyy"),
                ["DueDate"] = invoice.DueDate.Value.ToString("dd MMM yyyy"),
                ["DaysOverdue"] = daysOverdue.ToString(),
                ["TotalAmount"] = invoice.TotalAmount.ToString("N2"),
                ["BalanceAmount"] = invoice.BalanceAmount.ToString("N2"),
                ["PaymentLink"] = $"/portal/invoices/{invoice.InvoiceNumber}/pay"
            };

            string subject = template != null
                ? _templateEngine.Render(template.SubjectTemplate, variables)
                : $"URGENT: Invoice {invoice.InvoiceNumber} is {daysOverdue} days overdue - {companyName}";
            string body = template != null
                ? _templateEngine.Render(template.BodyTemplate, variables)
                : $"<p>Dear {invoice.Customer.Name},</p><p>Invoice {invoice.InvoiceNumber} is overdue by {daysOverdue} days. Outstanding: {currency} {invoice.BalanceAmount:N2}.</p><p>Regards,<br>{companyName}</p>";

            var log = new NotificationLog
            {
                TenantId = tenantId,
                EventType = "InvoiceOverdue",
                EntityType = "Invoice",
                EntityId = invoice.Id,
                Channel = "Email",
                Recipient = invoice.Customer.Email,
                Subject = subject,
                Message = body,
                Status = "Queued",
                SentAtUtc = DateTime.UtcNow,
                SentBy = userName ?? "SystemBackgroundJob",
                RetryCount = 0
            };

            try
            {
                await _emailService.SendEmailAsync(invoice.Customer.Email, subject, body);
                log.Status = "Sent";
                await _logRepository.AddAsync(log);
                sentCount++;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send overdue notice for invoice {InvoiceId}", invoice.Id);
                log.Status = "Failed";
                log.FailureReason = ex.Message;
                await _logRepository.AddAsync(log);
            }
        }

        return ApiResponse<int>.Ok(sentCount, $"Processed {overdueCandidates.Count} overdue invoices, dispatched {sentCount} notices.");
    }

    public async Task<ApiResponse<NotificationLogDto>> RetryNotificationAsync(int logId, int tenantId, string? userName = null)
    {
        var log = await _logRepository.GetByIdAsync(logId, tenantId);
        if (log == null)
            return ApiResponse<NotificationLogDto>.Fail("Notification log entry not found.");

        log.RetryCount++;
        log.SentBy = userName ?? log.SentBy;

        try
        {
            await _emailService.SendEmailAsync(log.Recipient, log.Subject, log.Message);

            log.Status = "Sent";
            log.SentAtUtc = DateTime.UtcNow;
            log.FailureReason = null;
            log.NextRetryAtUtc = null;
            await _logRepository.UpdateAsync(log);

            return ApiResponse<NotificationLogDto>.Ok(MapToDto(log), "Notification re-sent successfully.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Retry failed for notification log {LogId}", logId);
            log.Status = "Failed";
            log.FailureReason = $"Retry {log.RetryCount} failed: {ex.Message}";
            log.NextRetryAtUtc = DateTime.UtcNow.AddMinutes(Math.Pow(2, log.RetryCount) * 5); // Exponential backoff
            await _logRepository.UpdateAsync(log);

            return ApiResponse<NotificationLogDto>.Fail($"Retry attempt failed: {ex.Message}");
        }
    }

    public async Task<ApiResponse<PagedResult<NotificationLogDto>>> GetNotificationHistoryAsync(int tenantId, NotificationLogQueryParameters parameters)
    {
        var pagedLogs = await _logRepository.QueryLogsAsync(tenantId, parameters);
        var dtos = pagedLogs.Items.Select(MapToDto).ToList();
        var result = new PagedResult<NotificationLogDto>(dtos, pagedLogs.TotalCount, pagedLogs.PageNumber, pagedLogs.PageSize);
        return ApiResponse<PagedResult<NotificationLogDto>>.Ok(result);
    }

    private static NotificationLogDto MapToDto(NotificationLog l) => new()
    {
        Id = l.Id,
        TenantId = l.TenantId,
        EventType = l.EventType,
        EntityType = l.EntityType,
        EntityId = l.EntityId,
        Channel = l.Channel,
        Recipient = l.Recipient,
        Subject = l.Subject,
        Message = l.Message,
        Status = l.Status,
        SentAtUtc = l.SentAtUtc,
        RetryCount = l.RetryCount,
        FailureReason = l.FailureReason,
        SentBy = l.SentBy,
        NextRetryAtUtc = l.NextRetryAtUtc
    };
}
