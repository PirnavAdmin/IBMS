using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Numbering;
using Billing.Domain.Entities;

namespace Billing.Application.Services;

public class InvoiceService : IInvoiceService
{
    private readonly IInvoiceRepository _invoiceRepository;
    private readonly INumberGenerationService _numberGenerationService;

    public InvoiceService(
        IInvoiceRepository invoiceRepository,
        INumberGenerationService numberGenerationService)
    {
        _invoiceRepository = invoiceRepository;
        _numberGenerationService = numberGenerationService;
    }

    public async Task<ApiResponse<Invoice>> CreateDraftAsync(Invoice invoice, int tenantId)
    {
        invoice.TenantId = tenantId;
        invoice.Status = "Draft";
        invoice.CreatedAtUtc = DateTime.UtcNow;
        invoice.RowVersion = DateTime.UtcNow;

        var result = await _invoiceRepository.AddAsync(invoice);
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

        // Update fields
        existing.CustomerId = updatedInvoice.CustomerId;
        existing.InvoiceDate = updatedInvoice.InvoiceDate;
        existing.DueDate = updatedInvoice.DueDate;
        existing.Reference = updatedInvoice.Reference;
        existing.Notes = updatedInvoice.Notes;
        existing.TermsAndConditions = updatedInvoice.TermsAndConditions;
        
        // Update totals (Normally would use calculation engine)
        existing.Subtotal = updatedInvoice.Subtotal;
        existing.DiscountAmount = updatedInvoice.DiscountAmount;
        existing.TaxAmount = updatedInvoice.TaxAmount;
        existing.ChargesAmount = updatedInvoice.ChargesAmount;
        existing.TotalAmount = updatedInvoice.TotalAmount;
        existing.BalanceAmount = updatedInvoice.TotalAmount;

        // Update items manually for simplicity (in real-world, handle add/remove/update collection)
        existing.Items = updatedInvoice.Items;

        existing.UpdatedAtUtc = DateTime.UtcNow;
        existing.RowVersion = DateTime.UtcNow;

        await _invoiceRepository.UpdateAsync(existing);
        return ApiResponse<Invoice>.Ok(existing, "Draft updated successfully.");
    }

    public async Task<ApiResponse<Invoice>> IssueInvoiceAsync(int id, int tenantId)
    {
        var invoice = await _invoiceRepository.GetByIdAsync(id, tenantId);
        if (invoice == null) return ApiResponse<Invoice>.Fail("Invoice not found.");

        if (invoice.Status != "Draft")
            return ApiResponse<Invoice>.Fail("Only Draft invoices can be issued.");

        // 1. Generate the permanent Invoice Number safely
        var numberRequest = new GenerateNumberRequest { DocumentType = "Invoice", TransactionDate = invoice.InvoiceDate };
        var numberResponse = await _numberGenerationService.GenerateNextNumberAsync(numberRequest, tenantId);

        if (!numberResponse.Success || numberResponse.Data == null)
            return ApiResponse<Invoice>.Fail("Failed to generate invoice number: " + numberResponse.Message);

        invoice.InvoiceNumber = numberResponse.Data.GeneratedNumber;
        invoice.Status = "Issued";
        invoice.UpdatedAtUtc = DateTime.UtcNow;
        invoice.RowVersion = DateTime.UtcNow;

        await _invoiceRepository.UpdateAsync(invoice);
        return ApiResponse<Invoice>.Ok(invoice, "Invoice issued successfully.");
    }

    public async Task<ApiResponse<Invoice>> CancelInvoiceAsync(int id, int tenantId, string reason)
    {
        var invoice = await _invoiceRepository.GetByIdAsync(id, tenantId);
        if (invoice == null) return ApiResponse<Invoice>.Fail("Invoice not found.");

        if (invoice.Status != "Issued" && invoice.Status != "Sent" && invoice.Status != "Overdue")
            return ApiResponse<Invoice>.Fail("Invoice cannot be cancelled in its current state.");

        invoice.Status = "Cancelled";
        invoice.Notes = string.IsNullOrEmpty(invoice.Notes) ? $"Cancelled: {reason}" : $"{invoice.Notes}\nCancelled: {reason}";
        invoice.BalanceAmount = 0; // Clear balance
        invoice.UpdatedAtUtc = DateTime.UtcNow;
        invoice.RowVersion = DateTime.UtcNow;

        await _invoiceRepository.UpdateAsync(invoice);
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
        invoice.BalanceAmount = 0; // Clear balance
        invoice.UpdatedAtUtc = DateTime.UtcNow;
        invoice.RowVersion = DateTime.UtcNow;

        await _invoiceRepository.UpdateAsync(invoice);
        return ApiResponse<Invoice>.Ok(invoice, "Invoice voided successfully.");
    }
}
