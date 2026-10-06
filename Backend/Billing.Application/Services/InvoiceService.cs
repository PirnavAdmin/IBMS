using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Financial;
using Billing.Contracts.Numbering;
using Billing.Domain.Entities;

namespace Billing.Application.Services;

public class InvoiceService : IInvoiceService
{
    private readonly IInvoiceRepository _invoiceRepository;
    private readonly INumberGenerationService _numberGenerationService;
    private readonly IFinancialCalculationEngine _calculationEngine;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IAuditLogRepository _auditLogRepository;
    private readonly IEmailService _emailService;
    private readonly IInvoiceCommunicationRepository _communicationRepository;
    private readonly IInvoiceTemplateService _templateService;

    public InvoiceService(
        IInvoiceRepository invoiceRepository,
        INumberGenerationService numberGenerationService,
        IFinancialCalculationEngine calculationEngine,
        IUnitOfWork unitOfWork,
        IAuditLogRepository auditLogRepository,
        IEmailService emailService,
        IInvoiceCommunicationRepository communicationRepository,
        IInvoiceTemplateService templateService)
    {
        _invoiceRepository = invoiceRepository;
        _numberGenerationService = numberGenerationService;
        _calculationEngine = calculationEngine;
        _unitOfWork = unitOfWork;
        _auditLogRepository = auditLogRepository;
        _emailService = emailService;
        _communicationRepository = communicationRepository;
        _templateService = templateService;
    }

    private async Task RecalculateInvoiceTotalsAsync(Invoice invoice, int tenantId)
    {
        var request = new FinancialCalculationRequest
        {
            Items = invoice.Items.Select(i => new FinancialLineItemRequest
            {
                Name = i.Description,
                ProductCode = i.Product?.ProductCode,
                UnitPrice = i.UnitPrice,
                Quantity = i.Quantity,
                LineDiscountType = i.DiscountType,
                LineDiscountValue = i.DiscountRate,
                TaxRatePercent = i.TaxRate
            }).ToList(),
            InvoiceDiscount = invoice.DiscountAmount > 0 ? new FinancialInvoiceDiscountRequest { DiscountType = "Fixed", Value = invoice.DiscountAmount } : null,
            Charges = invoice.ChargesAmount > 0 ? new List<FinancialChargeRequest> { new FinancialChargeRequest { Name = "Other Charges", Amount = invoice.ChargesAmount, CalculationType = "Fixed" } } : null,
            TransactionDate = invoice.InvoiceDate,
            Currency = invoice.GetCurrency()
        };

        var calcResponse = await _calculationEngine.CalculateAsync(request, tenantId);
        if (calcResponse.Success && calcResponse.Data != null)
        {
            var calc = calcResponse.Data;
            invoice.Subtotal = calc.GrossSubtotal;
            invoice.DiscountAmount = calc.TotalLineDiscounts + calc.InvoiceDiscountAmount;
            invoice.TaxAmount = calc.TotalTaxes;
            invoice.ChargesAmount = calc.ChargesTotal + calc.TaxOnChargesTotal;
            
            var roundedTotal = Math.Round(calc.GrandTotal, 0, MidpointRounding.AwayFromZero);
            invoice.RoundingAmount = roundedTotal - calc.GrandTotal;
            invoice.TotalAmount = roundedTotal;

            if (invoice.Status == "Draft")
            {
                invoice.BalanceAmount = invoice.TotalAmount;
            }

            for (int i = 0; i < invoice.Items.Count; i++)
            {
                var item = invoice.Items.ElementAt(i);
                if (i < calc.Items.Count)
                {
                    var calcItem = calc.Items[i];
                    item.DiscountAmount = calcItem.DiscountAmount;
                    item.TaxAmount = calcItem.TaxAmount;
                    item.TotalAmount = calcItem.LineTotal;
                }
            }
        }
    }

    public async Task<ApiResponse<Invoice>> CreateDraftAsync(Invoice invoice, int tenantId, string? userName = null)
    {
        invoice.TenantId = tenantId;
        invoice.Status = "Draft";
        invoice.CreatedAtUtc = DateTime.UtcNow;
        invoice.RowVersion = DateTime.UtcNow;
        
        int order = 1;
        foreach (var item in invoice.Items)
        {
            item.SortOrder = order++;
        }

        await RecalculateInvoiceTotalsAsync(invoice, tenantId);

        var result = await _invoiceRepository.AddAsync(invoice);
        await _auditLogRepository.AddAsync(new AuditLog { TenantId = tenantId, EntityName = "Invoice", EntityId = result.Id.ToString(), Action = "Created", UserName = userName ?? "System", Changes = "Draft invoice created.", Timestamp = DateTime.UtcNow });

        return ApiResponse<Invoice>.Ok(result, "Draft invoice created successfully.");
    }

    public async Task<ApiResponse<Invoice>> UpdateDraftAsync(int id, Invoice updatedInvoice, int tenantId, string? userName = null)
    {
        var existing = await _invoiceRepository.GetByIdAsync(id, tenantId);
        if (existing == null)
            return ApiResponse<Invoice>.Fail("Invoice not found.");

        if (existing.Status != "Draft")
            return ApiResponse<Invoice>.Fail("Only Draft invoices can be edited.");

        if (existing.RowVersion != updatedInvoice.RowVersion)
            return ApiResponse<Invoice>.Fail("Concurrency error: The invoice was modified by another user.");

        existing.CustomerId = updatedInvoice.CustomerId;
        existing.InvoiceDate = updatedInvoice.InvoiceDate;
        existing.DueDate = updatedInvoice.DueDate;
        existing.Reference = updatedInvoice.Reference;
        existing.Notes = updatedInvoice.Notes;
        existing.TermsAndConditions = updatedInvoice.TermsAndConditions;
        
        // Take charges/discounts from request before recalculating
        existing.DiscountAmount = updatedInvoice.DiscountAmount;
        existing.ChargesAmount = updatedInvoice.ChargesAmount;
        
        existing.Items.Clear();
        int order = 1;
        foreach (var item in updatedInvoice.Items)
        {
            existing.Items.Add(new InvoiceItem
            {
                ProductId = item.ProductId,
                Description = item.Description,
                Quantity = item.Quantity,
                UnitPrice = item.UnitPrice,
                DiscountType = item.DiscountType,
                DiscountRate = item.DiscountRate,
                TaxType = item.TaxType,
                TaxRate = item.TaxRate,
                HSNSAC = item.HSNSAC,
                SortOrder = item.SortOrder > 0 ? item.SortOrder : order++
            });
        }

        await RecalculateInvoiceTotalsAsync(existing, tenantId);

        existing.UpdatedAtUtc = DateTime.UtcNow;
        existing.RowVersion = DateTime.UtcNow;

        await _invoiceRepository.UpdateAsync(existing);
        await _auditLogRepository.AddAsync(new AuditLog { TenantId = tenantId, EntityName = "Invoice", EntityId = existing.Id.ToString(), Action = "Updated", UserName = userName ?? "System", Changes = $"Draft invoice updated. Data: {System.Text.Json.JsonSerializer.Serialize(updatedInvoice)}", Timestamp = DateTime.UtcNow });

        return ApiResponse<Invoice>.Ok(existing, "Draft updated successfully.");
    }

    public async Task<ApiResponse<Invoice>> IssueInvoiceAsync(int id, int tenantId, string? userName = null)
    {
        await _unitOfWork.BeginTransactionAsync();
        try
        {
            var invoice = await _invoiceRepository.GetByIdForUpdateAsync(id, tenantId);
            if (invoice == null) 
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<Invoice>.Fail("Invoice not found.");
            }

            if (invoice.Status != "Draft")
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<Invoice>.Fail("Only Draft invoices can be issued.");
            }

            await RecalculateInvoiceTotalsAsync(invoice, tenantId);

            var numberRequest = new GenerateNumberRequest { DocumentType = "Invoice", TransactionDate = invoice.InvoiceDate };
            var numberResponse = await _numberGenerationService.GenerateNextNumberAsync(numberRequest, tenantId);

            if (!numberResponse.Success || numberResponse.Data == null)
            {
                await _unitOfWork.RollbackTransactionAsync();
                return ApiResponse<Invoice>.Fail("Failed to generate invoice number: " + numberResponse.Message);
            }

            invoice.InvoiceNumber = numberResponse.Data.GeneratedNumber;
            invoice.Status = "Issued";
            invoice.UpdatedAtUtc = DateTime.UtcNow;
            invoice.RowVersion = DateTime.UtcNow;
            
            invoice.RecalculateBalanceAndStatus();

            await _invoiceRepository.UpdateAsync(invoice);
            await _auditLogRepository.AddAsync(new AuditLog { TenantId = tenantId, EntityName = "Invoice", EntityId = invoice.Id.ToString(), Action = "Issued", UserName = userName ?? "System", Changes = $"Invoice issued with number {invoice.InvoiceNumber}.", Timestamp = DateTime.UtcNow });
            
            await _unitOfWork.CommitTransactionAsync();

            return ApiResponse<Invoice>.Ok(invoice, "Invoice issued successfully.");
        }
        catch
        {
            await _unitOfWork.RollbackTransactionAsync();
            throw;
        }
    }

    public async Task<ApiResponse<Invoice>> CancelInvoiceAsync(int id, int tenantId, string reason, string? userName = null)
    {
        var invoice = await _invoiceRepository.GetByIdAsync(id, tenantId);
        if (invoice == null) return ApiResponse<Invoice>.Fail("Invoice not found.");

        if (invoice.Status != "Issued" && invoice.Status != "Sent" && invoice.Status != "Overdue")
            return ApiResponse<Invoice>.Fail("Invoice cannot be cancelled in its current state.");

        if (invoice.PaymentAllocations != null && invoice.PaymentAllocations.Any(pa => !pa.IsReversed))
            return ApiResponse<Invoice>.Fail("Cannot cancel an invoice with active payments. Please unallocate or reverse payments first.");

        invoice.Status = "Cancelled";
        invoice.Notes = string.IsNullOrEmpty(invoice.Notes) ? $"Cancelled: {reason}" : $"{invoice.Notes}\nCancelled: {reason}";
        invoice.BalanceAmount = 0; 
        invoice.UpdatedAtUtc = DateTime.UtcNow;
        invoice.RowVersion = DateTime.UtcNow;

        await _invoiceRepository.UpdateAsync(invoice);
        await _auditLogRepository.AddAsync(new AuditLog { TenantId = tenantId, EntityName = "Invoice", EntityId = invoice.Id.ToString(), Action = "Cancelled", UserName = userName ?? "System", Changes = $"Invoice cancelled. Reason: {reason}", Timestamp = DateTime.UtcNow });

        return ApiResponse<Invoice>.Ok(invoice, "Invoice cancelled successfully.");
    }

    public async Task<ApiResponse<Invoice>> VoidInvoiceAsync(int id, int tenantId, string reason, string? userName = null)
    {
        var invoice = await _invoiceRepository.GetByIdAsync(id, tenantId);
        if (invoice == null) return ApiResponse<Invoice>.Fail("Invoice not found.");

        if (invoice.Status != "Issued" && invoice.Status != "Sent" && invoice.Status != "Overdue")
            return ApiResponse<Invoice>.Fail("Invoice cannot be voided in its current state.");

        if (invoice.PaymentAllocations != null && invoice.PaymentAllocations.Any(pa => !pa.IsReversed))
            return ApiResponse<Invoice>.Fail("Cannot void an invoice with active payments. Please unallocate or reverse payments first.");

        invoice.Status = "Voided";
        invoice.Notes = string.IsNullOrEmpty(invoice.Notes) ? $"Voided: {reason}" : $"{invoice.Notes}\nVoided: {reason}";
        invoice.BalanceAmount = 0; 
        invoice.UpdatedAtUtc = DateTime.UtcNow;
        invoice.RowVersion = DateTime.UtcNow;

        await _invoiceRepository.UpdateAsync(invoice);
        await _auditLogRepository.AddAsync(new AuditLog { TenantId = tenantId, EntityName = "Invoice", EntityId = invoice.Id.ToString(), Action = "Voided", UserName = userName ?? "System", Changes = $"Invoice voided. Reason: {reason}", Timestamp = DateTime.UtcNow });

        return ApiResponse<Invoice>.Ok(invoice, "Invoice voided successfully.");
    }

    public async Task<ApiResponse<bool>> DeliverInvoiceAsync(int id, int tenantId, string? userName = null)
    {
        var invoice = await _invoiceRepository.GetByIdAsync(id, tenantId);
        if (invoice == null) return ApiResponse<bool>.Fail("Invoice not found.");
        if (invoice.Status == "Draft" || invoice.Status == "Cancelled" || invoice.Status == "Voided") 
            return ApiResponse<bool>.Fail("Invoice cannot be delivered in its current state.");

        if (invoice.Customer == null || string.IsNullOrWhiteSpace(invoice.Customer.Email))
            return ApiResponse<bool>.Fail("Customer does not have a valid email address.");

        // Generate or get the PDF
        byte[] pdfBytes;
        string fileName = $"{invoice.InvoiceNumber}.pdf";
        try 
        {
            var pdfRequest = new Billing.Contracts.InvoiceTemplate.GenerateInvoicePdfRequest { InvoiceId = invoice.Id };
            var pdfResponse = await _templateService.GenerateInvoicePdfAsync(pdfRequest, tenantId, userName ?? "System");
            var fileData = await _templateService.GetInvoicePdfAsync(pdfResponse.InvoiceId, tenantId);
            pdfBytes = fileData.FileBytes;
            fileName = fileData.FileName;
        }
        catch (Exception ex)
        {
            return ApiResponse<bool>.Fail($"Failed to generate invoice PDF: {ex.Message}");
        }

        string subject = $"Invoice {invoice.InvoiceNumber} from {invoice.Tenant?.Name ?? "Our Company"}";
        string body = $"Dear {invoice.Customer.Name},\n\nPlease find attached the invoice {invoice.InvoiceNumber} for the amount of {invoice.TotalAmount} {invoice.GetCurrency()}.\n\nThank you for your business!";

        // Send Email
        try
        {
            await _emailService.SendEmailAsync(invoice.Customer.Email, subject, body, pdfBytes, fileName);
        }
        catch (Exception ex)
        {
            return ApiResponse<bool>.Fail($"Failed to send email: {ex.Message}");
        }

        // Log Delivery History
        var communication = new Billing.Domain.Entities.InvoiceCommunication
        {
            TenantId = tenantId,
            InvoiceId = invoice.Id,
            CommunicationType = "Email",
            Recipient = invoice.Customer.Email,
            Subject = subject,
            Message = body,
            Status = "Sent",
            SentAtUtc = DateTime.UtcNow,
            SentBy = userName ?? "System"
        };
        await _communicationRepository.AddAsync(communication);

        // Update Audit
        await _auditLogRepository.AddAsync(new Billing.Domain.Entities.AuditLog { TenantId = tenantId, EntityName = "Invoice", EntityId = invoice.Id.ToString(), Action = "Delivered", UserName = userName ?? "System", Changes = $"Invoice {invoice.InvoiceNumber} delivered to {invoice.Customer.Email}.", Timestamp = DateTime.UtcNow });

        if (invoice.Status == "Issued")
        {
            invoice.Status = "Sent";
            await _invoiceRepository.UpdateAsync(invoice);
        }

        return ApiResponse<bool>.Ok(true, "Invoice delivered successfully.");
    }
}



