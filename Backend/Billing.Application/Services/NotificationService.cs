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
    private readonly IInvoiceTemplateService? _invoiceTemplateService;

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
        IQuotationPdfEngine? quotationPdfEngine = null,
        IInvoiceTemplateService? invoiceTemplateService = null)
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
        _invoiceTemplateService = invoiceTemplateService;
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
            ["PaymentLink"] = $"http://localhost:3000/pay/{invoice.Id}?tenantId={tenantId}&allowPartial={(invoice.AllowPartialPayments ? 1 : 0)}"
        };

        var template = await _templateRepository.GetActiveTemplateAsync(tenantId, eventType, "Email");
        string subject;
        string body;

        var payLink = $"http://localhost:3000/pay/{invoice.Id}?tenantId={tenantId}&allowPartial={(invoice.AllowPartialPayments ? 1 : 0)}";

        if (template != null)
        {
            subject = _templateEngine.Render(template.SubjectTemplate, variables);
            body = _templateEngine.Render(template.BodyTemplate, variables);
        }
        else
        {
            subject = $"Invoice {invoice.InvoiceNumber} from {companyName}";
            body = $@"<div style='font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;'>
                <h2 style='color:#0f172a;margin-top:0;'>Tax Invoice {invoice.InvoiceNumber}</h2>
                <p style='color:#475569;'>Dear {invoice.Customer.Name},</p>
                <p style='color:#475569;'>Please find attached tax invoice <strong>{invoice.InvoiceNumber}</strong> for <strong>{currency} {invoice.TotalAmount:N2}</strong>.</p>
                <p style='color:#64748b;font-size:14px;'>Due Date: <strong>{invoice.DueDate?.ToString("dd MMM yyyy") ?? "Upon Receipt"}</strong> &bull; Outstanding Balance: <strong>{currency} {invoice.BalanceAmount:N2}</strong></p>
                <div style='margin:30px 0;'>
                    <a href='{payLink}' style='background-color:#2563eb;color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px;display:inline-block;box-shadow:0 4px 10px rgba(37,99,235,0.2);'>&#128179; Pay Now Online</a>
                </div>
                <p style='color:#64748b;font-size:13px;'>{(invoice.AllowPartialPayments ? "You can pay in full or enter a custom amount for a partial payment via UPI, Credit/Debit Card, or Bank Transfer." : "Please note: Full payment is required for this invoice via UPI, Credit/Debit Card, or Bank Transfer.")}</p>

                <hr style='border:none;border-top:1px solid #e2e8f0;margin:24px 0;'/>
                <p style='color:#94a3b8;font-size:12px;'>Regards,<br/><strong>{companyName}</strong><br/>{supportEmail}</p>
            </div>";
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
        var invoiceId = firstAllocation?.InvoiceId;
        Invoice? invoice = null;
        if (invoiceId.HasValue)
        {
            invoice = await _invoiceRepository.GetByIdAsync(invoiceId.Value, tenantId);
        }

        var invoiceNumber = invoice?.InvoiceNumber ?? firstAllocation?.Invoice?.InvoiceNumber ?? "N/A";
        var balanceDueAmount = invoice?.BalanceAmount ?? firstAllocation?.Invoice?.BalanceAmount ?? 0m;
        var remainingBalance = balanceDueAmount.ToString("N2");
        var isFullyPaid = balanceDueAmount <= 0;

        byte[]? pdfAttachment = null;
        string? pdfFileName = null;

        if (_invoiceTemplateService != null && invoiceId.HasValue)
        {
            try
            {
                var (bytes, fileName, _) = await _invoiceTemplateService.GetInvoicePdfAsync(
                    invoiceId.Value,
                    tenantId,
                    forceRegenerate: true);
                pdfAttachment = bytes;
                pdfFileName = fileName ?? $"{invoiceNumber}.pdf";
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not generate invoice PDF attachment for payment {PaymentId} on Invoice {InvoiceId}", paymentId, invoiceId);
            }
        }

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
            ["PaymentLink"] = invoiceId.HasValue ? $"http://localhost:3000/pay/{invoiceId.Value}?tenantId={tenantId}" : $"/portal/invoices/{invoiceNumber}/pay"
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
            if (eventType == "PaymentReceived")
            {
                subject = $"Payment Receipt: {payment.PaymentNumber} for Invoice {invoiceNumber}";
                var statusBadge = isFullyPaid
                    ? "<span style='display:inline-block;padding:3px 10px;background:#dcfce7;color:#166534;border:1px solid #86efac;border-radius:12px;font-weight:700;font-size:12px;'>Fully Paid</span>"
                    : "<span style='display:inline-block;padding:3px 10px;background:#fef3c7;color:#92400e;border:1px solid #fcd34d;border-radius:12px;font-weight:700;font-size:12px;'>Partially Paid</span>";

                var balanceColor = isFullyPaid ? "#166534" : "#b91c1c";
                var balanceText = isFullyPaid ? $"{currency} 0.00 (Cleared)" : $"{currency} {remainingBalance}";

                var payLink = invoiceId.HasValue
                    ? $"http://localhost:3000/pay/{invoiceId.Value}?tenantId={tenantId}"
                    : "#";

                var payRemainingButton = (!isFullyPaid && invoiceId.HasValue)
                    ? $@"<div style='margin:20px 0;text-align:center;'>
                            <a href='{payLink}' style='background-color:#65442e;color:#ffffff;padding:11px 24px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:13px;display:inline-block;'>Pay Remaining Balance Online</a>
                         </div>"
                    : "";

                body = $@"<div style='font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:580px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:10px;background:#ffffff;color:#334155;'>
                    <div style='font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;'>{companyName}</div>
                    <h2 style='color:#0f172a;margin:6px 0 16px;font-size:22px;'>Payment Receipt: {payment.PaymentNumber}</h2>
                    <p style='color:#334155;font-size:14px;margin:0 0 16px;'>Dear <strong>{customerName}</strong>,<br/>Thank you for your payment. Your transaction has been successfully processed.</p>
                    
                    <table style='width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;margin:16px 0;'>
                        <tr><td style='padding:9px 14px;color:#64748b;'>Receipt Number</td><td style='padding:9px 14px;text-align:right;font-weight:600;color:#0f172a;'>{payment.PaymentNumber}</td></tr>
                        <tr><td style='padding:9px 14px;color:#64748b;border-top:1px solid #f1f5f9;'>Payment Date</td><td style='padding:9px 14px;text-align:right;color:#334155;border-top:1px solid #f1f5f9;'>{payment.PaymentDate:dd MMM yyyy}</td></tr>
                        <tr><td style='padding:9px 14px;color:#64748b;border-top:1px solid #f1f5f9;'>Payment Method</td><td style='padding:9px 14px;text-align:right;color:#334155;border-top:1px solid #f1f5f9;'>{payment.Method} {(string.IsNullOrWhiteSpace(payment.Reference) ? "" : $"({payment.Reference})")}</td></tr>
                        <tr><td style='padding:9px 14px;color:#64748b;border-top:1px solid #f1f5f9;'>Invoice Number</td><td style='padding:9px 14px;text-align:right;font-weight:600;color:#0f172a;border-top:1px solid #f1f5f9;'>{invoiceNumber}</td></tr>
                        <tr style='border-top:1px solid #e2e8f0;background:#f1f5f9;'><td style='padding:11px 14px;font-weight:600;color:#0f172a;font-size:14px;'>Amount Paid</td><td style='padding:11px 14px;text-align:right;font-weight:700;color:#16a34a;font-size:16px;'>{currency} {payment.Amount:N2}</td></tr>
                        <tr><td style='padding:9px 14px;color:#64748b;border-top:1px solid #e2e8f0;'>Invoice Status</td><td style='padding:9px 14px;text-align:right;border-top:1px solid #e2e8f0;'>{statusBadge}</td></tr>
                        <tr><td style='padding:9px 14px;color:#64748b;border-top:1px solid #f1f5f9;'>Remaining Balance Due</td><td style='padding:9px 14px;text-align:right;font-weight:700;color:{balanceColor};border-top:1px solid #f1f5f9;'>{balanceText}</td></tr>
                    </table>

                    {(pdfAttachment != null ? "<p style='color:#64748b;font-size:13px;margin:12px 0;'>&#128206; <em>Your updated tax invoice reflecting this payment is attached to this email.</em></p>" : "")}
                    
                    {payRemainingButton}

                    <hr style='border:none;border-top:1px solid #e2e8f0;margin:20px 0 16px;'/>
                    <p style='color:#94a3b8;font-size:12px;margin:0;line-height:1.6;'>Regards,<br/><strong>{companyName}</strong><br/>{supportEmail}</p>
                </div>";
            }
            else
            {
                subject = $"Payment Failed for Invoice {invoiceNumber}";
                body = $"<p>Dear {customerName},</p><p>Your payment attempt for Invoice {invoiceNumber} could not be completed.</p><p>Regards,<br>{companyName}</p>";
            }
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
            await _emailService.SendEmailAsync(customerEmail, subject, body, pdfAttachment, pdfFileName);

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

        var actionToken = !string.IsNullOrWhiteSpace(quotation.PublicActionToken)
            ? quotation.PublicActionToken
            : quotation.Id.ToString();
        var approveLink = $"http://localhost:5271/api/v1/quotations/public/decision?token={actionToken}&action=approve&tenantId={tenantId}";
        var declineLink = $"http://localhost:5271/api/v1/quotations/public/decision?token={actionToken}&action=decline&tenantId={tenantId}";
        var replyLink = $"mailto:{supportEmail}?subject=Feedback on Quotation {quotation.QuoteNumber}";
        variables["ApproveLink"] = approveLink;
        variables["DeclineLink"] = declineLink;
        variables["ReplyLink"] = replyLink;

        var template = await _templateRepository.GetActiveTemplateAsync(tenantId, "QuotationSent", "Email");
        string subject = template != null
            ? _templateEngine.Render(template.SubjectTemplate, variables)
            : $"Quotation {quotation.QuoteNumber} from {companyName}";
        string body = template != null
            ? _templateEngine.Render(template.BodyTemplate, variables)
            : $@"<div style='font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:540px;margin:auto;padding:24px 16px;color:#334155;'>
                <div style='font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;'>{companyName}</div>
                <h2 style='color:#0f172a;margin:4px 0 16px;font-size:20px;'>Quotation {quotation.QuoteNumber}</h2>
                <p style='color:#334155;font-size:14px;margin:0 0 16px;'>Hello <strong>{quotation.Customer.Name}</strong>,<br/>Thank you for choosing us. Please find our formal quotation details below:</p>
                <table style='width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;margin:16px 0 24px;'>
                    <tr><td style='padding:9px 14px;color:#64748b;'>Quotation Number</td><td style='padding:9px 14px;text-align:right;font-weight:600;color:#0f172a;'>{quotation.QuoteNumber}</td></tr>
                    <tr><td style='padding:9px 14px;color:#64748b;border-top:1px solid #f1f5f9;'>Valid Until</td><td style='padding:9px 14px;text-align:right;color:#334155;border-top:1px solid #f1f5f9;'>{quotation.ValidUntil:dd MMM yyyy}</td></tr>
                    <tr style='border-top:1px solid #e2e8f0;background:#f1f5f9;'><td style='padding:11px 14px;font-weight:600;color:#0f172a;font-size:14px;'>Total Amount</td><td style='padding:11px 14px;text-align:right;font-weight:700;color:#0f172a;font-size:15px;'>{currency} {quotation.TotalAmount:N2}</td></tr>
                </table>
                <div style='margin:20px 0;text-align:center;'>
                    <p style='font-size:13px;color:#64748b;margin:0 0 12px;'>Please select your response:</p>
                    <div style='display:inline-block;'>
                        <a href='{approveLink}' style='background-color:#16a34a;color:#ffffff;padding:9px 20px;text-decoration:none;border-radius:6px;font-weight:600;font-size:13px;display:inline-block;margin:3px 6px;'>&#10003; Approve</a>
                        <a href='{declineLink}' style='background-color:#ffffff;color:#dc2626;border:1px solid #fca5a5;padding:8px 18px;text-decoration:none;border-radius:6px;font-weight:600;font-size:13px;display:inline-block;margin:3px 6px;'>&#10006; Decline</a>
                    </div>
                    <div style='font-size:11px;color:#94a3b8;margin-top:10px;'>* Single-use link. Once clicked, your response is saved.</div>
                </div>
                <hr style='border:none;border-top:1px solid #e2e8f0;margin:24px 0 16px;'/>
                <p style='color:#94a3b8;font-size:12px;margin:0;line-height:1.6;'>Regards,<br/><strong>{companyName}</strong><br/>{supportEmail}</p>
            </div>";

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

            await _auditLogRepository.AddAsync(new AuditLog
            {
                TenantId = tenantId,
                EntityName = "Quotation",
                EntityId = quotation.Id.ToString(),
                Action = "NotificationSent",
                UserName = userName ?? "System",
                Changes = $"Sent QuotationSent email to {quotation.Customer.Email}",
                Timestamp = DateTime.UtcNow
            });

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
