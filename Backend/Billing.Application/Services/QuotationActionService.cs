using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Financial;
using Billing.Contracts.Numbering;
using Billing.Domain.Entities;
using Billing.Domain.Enums;
using System.Text.Json;

namespace Billing.Application.Services;

public class QuotationActionService : IQuotationActionService
{
    private readonly IQuotationRepository _quotationRepository;
    private readonly IInvoiceRepository _invoiceRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IFinancialCalculationEngine _financialEngine;
    private readonly INumberGenerationService _numberGenerationService;
    private readonly IAuditLogRepository _auditLogRepository;
    private readonly IOutboxService? _outboxService;
    private readonly IEmailService _emailService;
    private readonly IQuotationPdfEngine? _quotationPdfEngine;
    private readonly ITenantRepository? _tenantRepository;
    private readonly INotificationLogRepository? _notificationLogRepository;
    private readonly INotificationService? _notificationService;

    public QuotationActionService(
        IQuotationRepository quotationRepository,
        IInvoiceRepository invoiceRepository,
        IUnitOfWork unitOfWork,
        IFinancialCalculationEngine financialEngine,
        INumberGenerationService numberGenerationService,
        IAuditLogRepository auditLogRepository,
        IEmailService emailService,
        IOutboxService? outboxService = null,
        IQuotationPdfEngine? quotationPdfEngine = null,
        ITenantRepository? tenantRepository = null,
        INotificationLogRepository? notificationLogRepository = null,
        INotificationService? notificationService = null)
    {
        _quotationRepository = quotationRepository;
        _invoiceRepository = invoiceRepository;
        _unitOfWork = unitOfWork;
        _financialEngine = financialEngine;
        _numberGenerationService = numberGenerationService;
        _auditLogRepository = auditLogRepository;
        _outboxService = outboxService;
        _emailService = emailService;
        _quotationPdfEngine = quotationPdfEngine;
        _tenantRepository = tenantRepository;
        _notificationLogRepository = notificationLogRepository;
        _notificationService = notificationService;
    }

    public async Task<ApiResponse<bool>> CalculateAndFreezeSnapshotAsync(int quotationId, int tenantId)
    {
        var quotation = await _quotationRepository.GetByIdForUpdateAsync(quotationId, tenantId) 
            ?? await _quotationRepository.GetByIdAsync(quotationId, tenantId);
        if (quotation == null)
            return ApiResponse<bool>.Fail("Quotation not found");

        if (quotation.Status != QuotationStatus.Draft)
            return ApiResponse<bool>.Fail("Only Draft quotations can be recalculated and frozen.");

        var request = new FinancialCalculationRequest
        {
            TransactionDate = quotation.QuotationDate,
            Items = quotation.Items.Select(i => new FinancialLineItemRequest
            {
                Name = i.Description,
                ProductCode = i.ProductId.ToString(),
                UnitPrice = i.UnitPrice,
                Quantity = i.Quantity,
                LineDiscountType = i.DiscountType,
                LineDiscountValue = i.DiscountRate,
                TaxCode = i.TaxType,
                TaxRatePercent = i.TaxRate
            }).ToList()
        };

        var calcResult = await _financialEngine.CalculateAsync(request, tenantId);
        if (!calcResult.Success || calcResult.Data == null)
            return ApiResponse<bool>.Fail("Calculation failed: " + calcResult.Message);

        var data = calcResult.Data;
        quotation.Subtotal = data.NetItemSubtotal;
        quotation.DiscountAmount = data.TotalLineDiscounts + data.InvoiceDiscountAmount;
        quotation.TaxAmount = data.TotalTaxes;
        quotation.ChargesAmount = data.ChargesTotal;
        quotation.TotalAmount = data.GrandTotal;

        for (int i = 0; i < quotation.Items.Count; i++)
        {
            var item = quotation.Items.ElementAt(i);
            var calcItem = data.Items[i];
            
            item.DiscountAmount = calcItem.DiscountAmount;
            item.TaxAmount = calcItem.TaxAmount;
            item.TotalAmount = calcItem.LineTotal;
        }

        await _quotationRepository.UpdateAsync(quotation);

        return ApiResponse<bool>.Ok(true, "Snapshot frozen successfully.");
    }

    public async Task<ApiResponse<string>> GenerateQuotationNumberAsync(int tenantId)
    {
        var request = new GenerateNumberRequest
        {
            DocumentType = "Quotation",
            TransactionDate = DateTime.UtcNow
        };

        var response = await _numberGenerationService.GenerateNextNumberAsync(request, tenantId);
        if (!response.Success || response.Data == null)
            return ApiResponse<string>.Fail(response.Message ?? "Number generation failed");

        return ApiResponse<string>.Ok(response.Data.GeneratedNumber, "Generated successfully");
    }

    public async Task<ApiResponse<bool>> SendQuotationAsync(int quotationId, int tenantId, string userId)
    {
        var quotation = await _quotationRepository.GetByIdForUpdateAsync(quotationId, tenantId)
            ?? await _quotationRepository.GetByIdAsync(quotationId, tenantId);
        if (quotation == null) return ApiResponse<bool>.Fail("Not found");

        if (quotation.Status != QuotationStatus.Draft)
            return ApiResponse<bool>.Fail("Only Draft quotes can be sent.");

        if (quotation.CustomerId <= 0)
            return ApiResponse<bool>.Fail("Customer is required before sending.");

        if (quotation.Items == null || !quotation.Items.Any())
            return ApiResponse<bool>.Fail("Quotation must contain at least one line item before sending.", errorCode: "EMPTY_ITEMS");

        if (quotation.TotalAmount <= 0)
            return ApiResponse<bool>.Fail("Quotation total amount must be greater than zero before sending.", errorCode: "INVALID_TOTAL");

        if (quotation.ValidUntil.Date < DateTime.UtcNow.Date)
            return ApiResponse<bool>.Fail("Quotation validity has expired and cannot be sent.", errorCode: "EXPIRED_VALIDITY");

        var customer = quotation.Customer;
        var recipient = customer?.Email;
        if (customer == null || string.IsNullOrWhiteSpace(recipient))
            return ApiResponse<bool>.Fail("Customer does not have a valid email address.");

        var tenant = quotation.Tenant ?? (_tenantRepository != null ? await _tenantRepository.GetByIdAsync(tenantId) : null);
        var currency = string.IsNullOrWhiteSpace(customer.Currency) ? "INR" : customer.Currency.Trim().ToUpperInvariant();
        var subject = $"Quotation {quotation.QuoteNumber}";

        // 1. Generate Quotation PDF
        byte[]? pdfBytes = null;
        string pdfFileName = $"{quotation.QuoteNumber}.pdf";
        if (_quotationPdfEngine != null)
        {
            try
            {
                pdfBytes = _quotationPdfEngine.GenerateQuotationPdf(quotation, tenant);
            }
            catch
            {
                // Fallback gracefully if PDF generation encounters an issue
            }
        }

        // 2. Build Clean Minimal Email Body (Fallback)
        var body = $"Dear {customer.Name},\n\nPlease find attached the quotation {quotation.QuoteNumber} for the amount of {quotation.TotalAmount:0.00} {currency}.\n\nThank you for your business!";

        if (_notificationService != null)
        {
            var notifResult = await _notificationService.SendQuotationNotificationAsync(
                quotationId,
                tenantId,
                userId,
                pdfBytes,
                pdfBytes != null ? pdfFileName : null);

            if (!notifResult.Success)
            {
                return ApiResponse<bool>.Fail(notifResult.Message);
            }

            if (notifResult.Data != null)
            {
                subject = notifResult.Data.Subject;
                body = notifResult.Data.Message;
            }
        }
        else
        {
            // Send Email fallback if notification service not provided
            try
            {
                await _emailService.SendEmailAsync(recipient, subject, body, pdfBytes, pdfBytes != null ? pdfFileName : null);

                if (_notificationLogRepository != null)
                {
                    try
                    {
                        await _notificationLogRepository.AddAsync(new NotificationLog
                        {
                            TenantId = tenantId,
                            EventType = "QuotationSent",
                            EntityType = "Quotation",
                            EntityId = quotationId,
                            Channel = "Email",
                            Recipient = recipient,
                            Subject = subject,
                            Message = body,
                            Status = "Sent",
                            SentAtUtc = DateTime.UtcNow,
                            SentBy = userId ?? "System",
                            RetryCount = 0
                        });
                    }
                    catch
                    {
                        // Non-blocking log persistence
                    }
                }
            }
            catch (Exception ex)
            {
                if (_notificationLogRepository != null)
                {
                    try
                    {
                        await _notificationLogRepository.AddAsync(new NotificationLog
                        {
                            TenantId = tenantId,
                            EventType = "QuotationSent",
                            EntityType = "Quotation",
                            EntityId = quotationId,
                            Channel = "Email",
                            Recipient = recipient,
                            Subject = subject,
                            Message = body,
                            Status = "Failed",
                            FailureReason = ex.Message,
                            NextRetryAtUtc = DateTime.UtcNow.AddMinutes(5),
                            SentAtUtc = DateTime.UtcNow,
                            SentBy = userId ?? "System",
                            RetryCount = 0
                        });
                    }
                    catch
                    {
                    }
                }

                return ApiResponse<bool>.Fail($"Failed to send quotation email: {ex.Message}");
            }
        }

        try
        {
            quotation.Status = QuotationStatus.Sent;
            quotation.Communications.Add(new QuotationCommunication
            {
                QuotationId = quotationId,
                CommunicationType = "Email",
                Recipient = recipient,
                Subject = subject,
                Message = $"Quotation {quotation.QuoteNumber} sent to {recipient}. Items: {quotation.Items.Count}, Total: {quotation.TotalAmount:0.00} {currency}. PDF attached: {(pdfBytes != null ? "Yes" : "No")}.",
                Status = "Sent",
                SentAt = DateTime.UtcNow,
                SentBy = userId
            });
            await _quotationRepository.UpdateAsync(quotation);
            
            var auditLog = new AuditLog
            {
                TenantId = tenantId,
                CustomerId = quotation.CustomerId,
                EntityName = "Quotation",
                EntityId = quotationId.ToString(),
                Action = "Sent",
                UserName = userId,
                Changes = $"Status changed to Sent. Quotation email with PDF sent to {recipient}.",
                Timestamp = DateTime.UtcNow
            };
            await _auditLogRepository.AddAsync(auditLog);

            if (_outboxService != null)
            {
                try
                {
                    await _outboxService.PublishEventAsync(tenantId, "quotation.sent", new
                    {
                        QuotationId = quotation.Id,
                        QuoteNumber = quotation.QuoteNumber,
                        CustomerId = quotation.CustomerId,
                        CustomerName = quotation.Customer?.Name,
                        TotalAmount = quotation.TotalAmount,
                        Currency = currency,
                        Recipient = recipient,
                        SentAtUtc = DateTime.UtcNow
                    });
                }
                catch
                {
                }
            }
            
            return ApiResponse<bool>.Ok(true, "Quotation sent.");
        }
        catch (Exception ex)
        {
            return ApiResponse<bool>.Fail($"Failed to record quotation status: {ex.Message}");
        }
    }

    private static string BuildQuotationHtmlEmail(Quotation quotation, Customer customer, Tenant? tenant, string currency, bool hasPdfAttachment)
    {
        var companyName = !string.IsNullOrWhiteSpace(tenant?.Name) ? tenant.Name : "Acme STORE";
        var companyAddress = !string.IsNullOrWhiteSpace(tenant?.Address) ? tenant.Address : "Hyderabad, Telangana";
        var companyPhone = !string.IsNullOrWhiteSpace(tenant?.Phone) ? tenant.Phone : "+91 9876543210";
        var companyEmail = !string.IsNullOrWhiteSpace(tenant?.CompanyEmail) ? tenant.CompanyEmail : "info@acmetech.com";

        var sb = new System.Text.StringBuilder();
        sb.Append(@"<!DOCTYPE html>
<html>
<head>
<meta charset=""utf-8"">
<meta name=""viewport"" content=""width=device-width, initial-scale=1.0"">
</head>
<body style=""margin:0;padding:24px 0;background-color:#F5EBE1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#222222;"">
  <div style=""max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #D8B9A8;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(90,37,8,0.08);"">
    
    <!-- Top Header Strip -->
    <div style=""background:linear-gradient(135deg,#5A2508 0%,#8C3E14 60%,#C4693A 100%);padding:24px 28px;color:#ffffff;"">
      <table style=""width:100%;border-collapse:collapse;"">
        <tr>
          <td style=""vertical-align:middle;"">
            <div style=""font-size:22px;font-weight:700;letter-spacing:0.5px;color:#FFFFFF;"">").Append(System.Net.WebUtility.HtmlEncode(companyName)).Append(@"</div>
            <div style=""font-size:12px;color:#F3E7D7;margin-top:3px;letter-spacing:0.3px;"">Wholesale &bull; Retail &bull; Bulk Supply</div>
          </td>
          <td style=""text-align:right;vertical-align:middle;"">
            <span style=""background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.35);padding:6px 14px;border-radius:20px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#FFFFFF;"">QUOTATION</span>
          </td>
        </tr>
      </table>
    </div>

    <!-- Main Content -->
    <div style=""padding:24px 28px;"">
      <p style=""margin:0 0 12px 0;font-size:15px;line-height:1.5;"">Dear <strong>").Append(System.Net.WebUtility.HtmlEncode(customer.Name)).Append(@"</strong>,</p>
      <p style=""margin:0 0 20px 0;font-size:14px;line-height:1.5;color:#444444;"">
        Thank you for choosing us! Please find below the formal quotation details for <strong>").Append(System.Net.WebUtility.HtmlEncode(quotation.QuoteNumber)).Append(@"</strong>.
      </p>

      <!-- Key Quotation Meta Card -->
      <div style=""background:#FBF7F2;border:1px solid #D8B9A8;border-radius:8px;padding:14px 18px;margin-bottom:22px;"">
        <table style=""width:100%;border-collapse:collapse;font-size:13px;"">
          <tr>
            <td style=""padding:4px 0;color:#666666;"">Quotation Number:</td>
            <td style=""padding:4px 0;text-align:right;font-weight:700;color:#5A2508;"">").Append(System.Net.WebUtility.HtmlEncode(quotation.QuoteNumber)).Append(@"</td>
          </tr>
          <tr>
            <td style=""padding:4px 0;color:#666666;"">Quotation Date:</td>
            <td style=""padding:4px 0;text-align:right;font-weight:600;color:#222222;"">").Append(quotation.QuotationDate.ToString("dd-MM-yyyy")).Append(@"</td>
          </tr>
          <tr>
            <td style=""padding:4px 0;color:#666666;"">Valid Until:</td>
            <td style=""padding:4px 0;text-align:right;font-weight:600;color:#C4693A;"">").Append(quotation.ValidUntil.ToString("dd-MM-yyyy")).Append(@"</td>
          </tr>
        </table>
      </div>

      <!-- Line Items Table -->
      <div style=""margin-bottom:20px;"">
        <div style=""font-size:13px;font-weight:700;text-transform:uppercase;color:#5A2508;margin-bottom:8px;letter-spacing:0.5px;"">Line Items</div>
        <table style=""width:100%;border-collapse:collapse;font-size:13px;border:1px solid #D8B9A8;border-radius:6px;overflow:hidden;"">
          <thead>
            <tr style=""background:#F3E7D7;color:#5A2508;"">
              <th style=""padding:8px 10px;text-align:left;border-bottom:1px solid #C4693A;"">Item</th>
              <th style=""padding:8px 10px;text-align:center;border-bottom:1px solid #C4693A;"">Qty</th>
              <th style=""padding:8px 10px;text-align:right;border-bottom:1px solid #C4693A;"">Unit Price</th>
              <th style=""padding:8px 10px;text-align:right;border-bottom:1px solid #C4693A;"">Total</th>
            </tr>
          </thead>
          <tbody>");

        int itemIdx = 0;
        foreach (var item in quotation.Items)
        {
            var rowBg = itemIdx % 2 == 1 ? "#FBF7F2" : "#FFFFFF";
            sb.Append($@"
            <tr style=""background:{rowBg};"">
              <td style=""padding:8px 10px;border-bottom:1px solid #E8DDD5;color:#222222;""><strong>{System.Net.WebUtility.HtmlEncode(item.Description)}</strong></td>
              <td style=""padding:8px 10px;text-align:center;border-bottom:1px solid #E8DDD5;color:#222222;"">{item.Quantity:0.####}</td>
              <td style=""padding:8px 10px;text-align:right;border-bottom:1px solid #E8DDD5;color:#222222;"">{item.UnitPrice:0.00}</td>
              <td style=""padding:8px 10px;text-align:right;border-bottom:1px solid #E8DDD5;font-weight:600;color:#222222;"">{item.TotalAmount:0.00} {currency}</td>
            </tr>");
            itemIdx++;
        }

        sb.Append(@"
          </tbody>
        </table>
      </div>

      <!-- Financial Totals Box -->
      <div style=""margin-bottom:22px;"">
        <table style=""width:100%;max-width:300px;margin-left:auto;border-collapse:collapse;font-size:13px;"">
          <tr>
            <td style=""padding:4px 8px;color:#666666;"">Subtotal:</td>
            <td style=""padding:4px 8px;text-align:right;font-weight:500;"">").Append(quotation.Subtotal.ToString("0.00")).Append(" ").Append(currency).Append(@"</td>
          </tr>");

        if (quotation.DiscountAmount > 0)
        {
            sb.Append(@"
          <tr>
            <td style=""padding:4px 8px;color:#666666;"">Discount:</td>
            <td style=""padding:4px 8px;text-align:right;font-weight:500;color:#C0392B;"">-").Append(quotation.DiscountAmount.ToString("0.00")).Append(" ").Append(currency).Append(@"</td>
          </tr>");
        }

        if (quotation.TaxAmount > 0)
        {
            sb.Append(@"
          <tr>
            <td style=""padding:4px 8px;color:#666666;"">Tax:</td>
            <td style=""padding:4px 8px;text-align:right;font-weight:500;"">").Append(quotation.TaxAmount.ToString("0.00")).Append(" ").Append(currency).Append(@"</td>
          </tr>");
        }

        if (quotation.ChargesAmount > 0)
        {
            sb.Append(@"
          <tr>
            <td style=""padding:4px 8px;color:#666666;"">Charges:</td>
            <td style=""padding:4px 8px;text-align:right;font-weight:500;"">").Append(quotation.ChargesAmount.ToString("0.00")).Append(" ").Append(currency).Append(@"</td>
          </tr>");
        }

        sb.Append(@"
          <tr style=""background:#F3E7D7;font-size:14px;font-weight:700;color:#5A2508;"">
            <td style=""padding:8px 10px;border-top:1.5px solid #C4693A;border-bottom:1.5px solid #C4693A;"">Total:</td>
            <td style=""padding:8px 10px;text-align:right;border-top:1.5px solid #C4693A;border-bottom:1.5px solid #C4693A;"">Total: ").Append(quotation.TotalAmount.ToString("0.00")).Append(" ").Append(currency).Append(@"</td>
          </tr>
        </table>
      </div>");

        if (hasPdfAttachment)
        {
            sb.Append(@"
      <!-- PDF Attachment Notification Banner -->
      <div style=""background:#F3E7D7;border-left:4px solid #C4693A;padding:12px 16px;border-radius:4px;font-size:13px;color:#5A2508;margin-bottom:20px;"">
        <strong>PDF Quotation Attached:</strong> The official formal quotation document <strong>").Append(System.Net.WebUtility.HtmlEncode(quotation.QuoteNumber)).Append(@".pdf</strong> with store branding, itemization, and terms is attached to this email.
      </div>");
        }

        if (!string.IsNullOrWhiteSpace(quotation.Notes))
        {
            sb.Append(@"
      <div style=""margin-bottom:14px;font-size:13px;color:#555555;padding:10px 14px;background:#FAFAFA;border-radius:6px;"">
        <strong>Notes:</strong> ").Append(System.Net.WebUtility.HtmlEncode(quotation.Notes)).Append(@"
      </div>");
        }

        if (!string.IsNullOrWhiteSpace(quotation.TermsAndConditions))
        {
            sb.Append(@"
      <div style=""margin-bottom:14px;font-size:12px;color:#666666;padding:10px 14px;background:#FAFAFA;border-radius:6px;"">
        <strong>Terms and conditions:</strong> ").Append(System.Net.WebUtility.HtmlEncode(quotation.TermsAndConditions)).Append(@"
      </div>");
        }

        sb.Append(@"
      <div style=""margin-top:24px;padding-top:16px;border-top:1px solid #E8DDD5;font-size:13px;color:#555555;line-height:1.5;"">
        Best regards,<br>
        <strong style=""color:#222222;font-size:14px;"">").Append(System.Net.WebUtility.HtmlEncode(companyName)).Append(@"</strong><br>
        ").Append(System.Net.WebUtility.HtmlEncode(companyAddress)).Append(@"<br>
        Phone: ").Append(System.Net.WebUtility.HtmlEncode(companyPhone)).Append(@" | Email: ").Append(System.Net.WebUtility.HtmlEncode(companyEmail)).Append(@"
      </div>
    </div>

    <!-- Bottom Footer Strip -->
    <div style=""background:#F3E7D7;border-top:1px solid #D8B9A8;padding:10px 28px;font-size:11px;color:#666666;text-align:center;"">
      Quality Products &bull; Best Prices &bull; Trusted Always &bull; &copy; 2026 ").Append(System.Net.WebUtility.HtmlEncode(companyName)).Append(@"
    </div>
  </div>
</body>
</html>");

        return sb.ToString();
    }

    public async Task<ApiResponse<bool>> ApproveQuotationAsync(int quotationId, int tenantId, string approverId, string? approverRole = null)
    {
        if (!string.IsNullOrWhiteSpace(approverRole))
        {
            var allowedRoles = new[] { "TenantAdmin", "SuperAdmin", "Admin", "Manager" };
            var roles = approverRole.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (!roles.Any(r => allowedRoles.Contains(r, StringComparer.OrdinalIgnoreCase)))
            {
                return ApiResponse<bool>.Fail("Only TenantAdmin, SuperAdmin, Admin, or Manager can approve quotations.", errorCode: "FORBIDDEN");
            }
        }

        var quotation = await _quotationRepository.GetByIdForUpdateAsync(quotationId, tenantId)
            ?? await _quotationRepository.GetByIdAsync(quotationId, tenantId);
        if (quotation == null) return ApiResponse<bool>.Fail("Not found");

        if (quotation.Status != QuotationStatus.Sent)
            return ApiResponse<bool>.Fail("Only Sent quotes can be approved.");

        quotation.Status = QuotationStatus.Approved;
        await _quotationRepository.UpdateAsync(quotation);
        
        var auditLog = new AuditLog
        {
            TenantId = tenantId,
            CustomerId = quotation.CustomerId,
            EntityName = "Quotation",
            EntityId = quotationId.ToString(),
            Action = "Approved",
            UserName = approverId,
            Changes = "Status changed to Approved",
            Timestamp = DateTime.UtcNow
        };
        await _auditLogRepository.AddAsync(auditLog);

        if (_outboxService != null)
        {
            await _outboxService.PublishEventAsync(tenantId, "quotation.approved", new
            {
                QuotationId = quotation.Id,
                QuotationNumber = quotation.QuoteNumber,
                CustomerId = quotation.CustomerId,
                TotalAmount = quotation.TotalAmount,
                ApprovedBy = approverId,
                ApprovedAtUtc = DateTime.UtcNow
            });
        }

        return ApiResponse<bool>.Ok(true, "Quotation approved.");
    }

    public async Task<ApiResponse<bool>> CancelQuotationAsync(int quotationId, int tenantId, string reason, string userId)
    {
        if (string.IsNullOrWhiteSpace(reason))
            return ApiResponse<bool>.Fail("Cancellation reason is mandatory.");

        var quotation = await _quotationRepository.GetByIdForUpdateAsync(quotationId, tenantId)
            ?? await _quotationRepository.GetByIdAsync(quotationId, tenantId);
        if (quotation == null) return ApiResponse<bool>.Fail("Not found");

        if (quotation.Status == QuotationStatus.Converted)
            return ApiResponse<bool>.Fail("Converted quotes cannot be cancelled.");

        if (quotation.Status == QuotationStatus.Cancelled)
            return ApiResponse<bool>.Fail("Quotation is already cancelled.", errorCode: "ALREADY_CANCELLED");

        quotation.Status = QuotationStatus.Cancelled;
        quotation.Notes = string.IsNullOrEmpty(quotation.Notes) ? $"Cancelled: {reason}" : $"{quotation.Notes}\nCancelled: {reason}";

        await _quotationRepository.UpdateAsync(quotation);

        var auditLog = new AuditLog
        {
            TenantId = tenantId,
            CustomerId = quotation.CustomerId,
            EntityName = "Quotation",
            EntityId = quotationId.ToString(),
            Action = "Cancelled",
            UserName = userId,
            Changes = $"Status changed to Cancelled. Reason: {reason}",
            Timestamp = DateTime.UtcNow
        };
        await _auditLogRepository.AddAsync(auditLog);

        return ApiResponse<bool>.Ok(true, "Quotation cancelled.");
    }

    public async Task<ApiResponse<int>> ConvertToInvoiceAsync(int quotationId, int tenantId, string userId)
    {
        await _unitOfWork.BeginTransactionAsync();
        try
        {
            var quotation = await _quotationRepository.GetByIdForUpdateAsync(quotationId, tenantId);

            if (quotation == null) 
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<int>.Fail("Not found");
            }

            if (quotation.Status != QuotationStatus.Approved)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<int>.Fail("Only Approved quotes can be converted.");
            }

            if (quotation.ConvertedInvoiceId.HasValue)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<int>.Fail("Quote is already converted.");
            }

            // Generate Invoice Number
            var invReq = new GenerateNumberRequest { DocumentType = "Invoice", TransactionDate = DateTime.UtcNow };
            var numResp = await _numberGenerationService.GenerateNextNumberAsync(invReq, tenantId);
            if (!numResp.Success) 
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<int>.Fail("Failed to generate invoice number.");
            }

            var invoice = new Invoice
            {
                TenantId = tenantId,
                InvoiceNumber = numResp.Data!.GeneratedNumber,
                CustomerId = quotation.CustomerId,
                InvoiceDate = DateTime.UtcNow,
                DueDate = quotation.ValidUntil > DateTime.UtcNow ? quotation.ValidUntil : DateTime.UtcNow.AddDays(30),
                Reference = quotation.QuoteNumber,
                QuotationId = quotation.Id,
                Subtotal = quotation.Subtotal,
                DiscountAmount = quotation.DiscountAmount,
                TaxAmount = quotation.TaxAmount,
                ChargesAmount = quotation.ChargesAmount,
                TotalAmount = quotation.TotalAmount,
                PaidAmount = 0m,
                BalanceAmount = quotation.TotalAmount,
                Notes = quotation.Notes,
                TermsAndConditions = quotation.TermsAndConditions,
                Status = "Draft",
                Items = quotation.Items.Select(i => new InvoiceItem
                {
                    ProductId = i.ProductId,
                    Description = i.Description,
                    Quantity = i.Quantity,
                    UnitPrice = i.UnitPrice,
                    DiscountType = i.DiscountType,
                    DiscountRate = i.DiscountRate,
                    DiscountAmount = i.DiscountAmount,
                    TaxType = i.TaxType,
                    TaxRate = i.TaxRate,
                    TaxAmount = i.TaxAmount,
                    TotalAmount = i.TotalAmount,
                    HSNSAC = i.HSNSAC
                }).ToList()
            };

            var savedInvoice = await _invoiceRepository.AddAsync(invoice);

            quotation.Status = QuotationStatus.Converted;
            quotation.ConvertedInvoiceId = savedInvoice.Id;

            await _quotationRepository.UpdateAsync(quotation);

            var auditLog = new AuditLog
            {
                TenantId = tenantId,
                CustomerId = quotation.CustomerId,
                EntityName = "Quotation",
                EntityId = quotationId.ToString(),
                Action = "Converted",
                UserName = userId,
                Changes = $"Converted to Invoice {savedInvoice.Id}",
                Timestamp = DateTime.UtcNow
            };
            await _auditLogRepository.AddAsync(auditLog);

            if (_outboxService != null)
            {
                try
                {
                    await _outboxService.PublishEventAsync(tenantId, "quotation.converted", new
                    {
                        QuotationId = quotation.Id,
                        QuoteNumber = quotation.QuoteNumber,
                        InvoiceId = savedInvoice.Id,
                        InvoiceNumber = savedInvoice.InvoiceNumber,
                        CustomerId = quotation.CustomerId,
                        TotalAmount = quotation.TotalAmount,
                        ConvertedAtUtc = DateTime.UtcNow
                    });
                }
                catch
                {
                }
            }

            await _unitOfWork.CommitTransactionAsync();

            return ApiResponse<int>.Ok(savedInvoice.Id, "Converted successfully.");
        }
        catch (Exception ex)
        {
            await _unitOfWork.RollbackTransactionAsync();
            return ApiResponse<int>.Fail("Conversion failed: " + ex.Message);
        }
    }
}
