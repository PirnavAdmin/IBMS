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

    public InvoiceService(
        IInvoiceRepository invoiceRepository,
        INumberGenerationService numberGenerationService,
        IFinancialCalculationEngine calculationEngine,
        IUnitOfWork unitOfWork,
        IAuditLogRepository auditLogRepository)
    {
        _invoiceRepository = invoiceRepository;
        _numberGenerationService = numberGenerationService;
        _calculationEngine = calculationEngine;
        _unitOfWork = unitOfWork;
        _auditLogRepository = auditLogRepository;
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
            TransactionDate = invoice.InvoiceDate
        };

        var calcResponse = await _calculationEngine.CalculateAsync(request, tenantId);
        if (calcResponse.Success && calcResponse.Data != null)
        {
            var calc = calcResponse.Data;
            invoice.Subtotal = calc.GrossSubtotal;
            invoice.DiscountAmount = calc.TotalLineDiscounts + calc.InvoiceDiscountAmount;
            invoice.TaxAmount = calc.TotalTaxes;
            invoice.ChargesAmount = calc.ChargesTotal + calc.TaxOnChargesTotal;
            invoice.TotalAmount = calc.GrandTotal;
            if (invoice.Status == "Draft")
            {
                invoice.BalanceAmount = calc.GrandTotal;
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

    public async Task<ApiResponse<Invoice>> CreateDraftAsync(Invoice invoice, int tenantId)
    {
        invoice.TenantId = tenantId;
        invoice.Status = "Draft";
        invoice.CreatedAtUtc = DateTime.UtcNow;
        invoice.RowVersion = DateTime.UtcNow;

        await RecalculateInvoiceTotalsAsync(invoice, tenantId);

        var result = await _invoiceRepository.AddAsync(invoice);
        await _auditLogRepository.AddAsync(new AuditLog { TenantId = tenantId, EntityName = "Invoice", EntityId = result.Id.ToString(), Action = "Created", Changes = "Draft invoice created.", Timestamp = DateTime.UtcNow });

        return ApiResponse<Invoice>.Ok(result, "Draft invoice created successfully.");
    }

    public async Task<ApiResponse<Invoice>> UpdateDraftAsync(int id, Invoice updatedInvoice, int tenantId)
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
        
        existing.Items.Clear();
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
                SortOrder = item.SortOrder
            });
        }

        await RecalculateInvoiceTotalsAsync(existing, tenantId);

        existing.UpdatedAtUtc = DateTime.UtcNow;
        existing.RowVersion = DateTime.UtcNow;

        await _invoiceRepository.UpdateAsync(existing);
        await _auditLogRepository.AddAsync(new AuditLog { TenantId = tenantId, EntityName = "Invoice", EntityId = existing.Id.ToString(), Action = "Updated", Changes = "Draft invoice updated.", Timestamp = DateTime.UtcNow });

        return ApiResponse<Invoice>.Ok(existing, "Draft updated successfully.");
    }

    public async Task<ApiResponse<Invoice>> IssueInvoiceAsync(int id, int tenantId)
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
            await _auditLogRepository.AddAsync(new AuditLog { TenantId = tenantId, EntityName = "Invoice", EntityId = invoice.Id.ToString(), Action = "Issued", Changes = $"Invoice issued with number {invoice.InvoiceNumber}.", Timestamp = DateTime.UtcNow });
            
            await _unitOfWork.CommitTransactionAsync();

            return ApiResponse<Invoice>.Ok(invoice, "Invoice issued successfully.");
        }
        catch
        {
            await _unitOfWork.RollbackTransactionAsync();
            throw;
        }
    }

    public async Task<ApiResponse<Invoice>> CancelInvoiceAsync(int id, int tenantId, string reason)
    {
        var invoice = await _invoiceRepository.GetByIdAsync(id, tenantId);
        if (invoice == null) return ApiResponse<Invoice>.Fail("Invoice not found.");

        if (invoice.Status != "Issued" && invoice.Status != "Sent" && invoice.Status != "Overdue")
            return ApiResponse<Invoice>.Fail("Invoice cannot be cancelled in its current state.");

        invoice.Status = "Cancelled";
        invoice.Notes = string.IsNullOrEmpty(invoice.Notes) ? $"Cancelled: {reason}" : $"{invoice.Notes}\nCancelled: {reason}";
        invoice.BalanceAmount = 0; 
        invoice.UpdatedAtUtc = DateTime.UtcNow;
        invoice.RowVersion = DateTime.UtcNow;

        await _invoiceRepository.UpdateAsync(invoice);
        await _auditLogRepository.AddAsync(new AuditLog { TenantId = tenantId, EntityName = "Invoice", EntityId = invoice.Id.ToString(), Action = "Cancelled", Changes = $"Invoice cancelled. Reason: {reason}", Timestamp = DateTime.UtcNow });

        return ApiResponse<Invoice>.Ok(invoice, "Invoice cancelled successfully.");
    }

    public async Task<ApiResponse<Invoice>> VoidInvoiceAsync(int id, int tenantId, string reason)
    {
        var invoice = await _invoiceRepository.GetByIdAsync(id, tenantId);
        if (invoice == null) return ApiResponse<Invoice>.Fail("Invoice not found.");

        if (invoice.Status != "Issued" && invoice.Status != "Sent" && invoice.Status != "Overdue")
            return ApiResponse<Invoice>.Fail("Invoice cannot be voided in its current state.");

        invoice.Status = "Voided";
        invoice.Notes = string.IsNullOrEmpty(invoice.Notes) ? $"Voided: {reason}" : $"{invoice.Notes}\nVoided: {reason}";
        invoice.BalanceAmount = 0; 
        invoice.UpdatedAtUtc = DateTime.UtcNow;
        invoice.RowVersion = DateTime.UtcNow;

        await _invoiceRepository.UpdateAsync(invoice);
        await _auditLogRepository.AddAsync(new AuditLog { TenantId = tenantId, EntityName = "Invoice", EntityId = invoice.Id.ToString(), Action = "Voided", Changes = $"Invoice voided. Reason: {reason}", Timestamp = DateTime.UtcNow });

        return ApiResponse<Invoice>.Ok(invoice, "Invoice voided successfully.");
    }

    public async Task<ApiResponse<bool>> DeliverInvoiceAsync(int id, int tenantId)
    {
        var invoice = await _invoiceRepository.GetByIdAsync(id, tenantId);
        if (invoice == null) return ApiResponse<bool>.Fail("Invoice not found.");
        if (invoice.Status == "Draft" || invoice.Status == "Cancelled" || invoice.Status == "Voided") return ApiResponse<bool>.Fail("Invoice cannot be delivered in its current state.");

        await _auditLogRepository.AddAsync(new AuditLog { TenantId = tenantId, EntityName = "Invoice", EntityId = invoice.Id.ToString(), Action = "Delivered", Changes = $"Invoice {invoice.InvoiceNumber} delivered to customer.", Timestamp = DateTime.UtcNow });

        if (invoice.Status == "Issued")
        {
            invoice.Status = "Sent";
            await _invoiceRepository.UpdateAsync(invoice);
        }

        return ApiResponse<bool>.Ok(true, "Invoice delivered successfully.");
    }
}
