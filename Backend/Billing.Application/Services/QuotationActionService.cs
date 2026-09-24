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

    public QuotationActionService(
        IQuotationRepository quotationRepository,
        IInvoiceRepository invoiceRepository,
        IUnitOfWork unitOfWork,
        IFinancialCalculationEngine financialEngine,
        INumberGenerationService numberGenerationService,
        IAuditLogRepository auditLogRepository)
    {
        _quotationRepository = quotationRepository;
        _invoiceRepository = invoiceRepository;
        _unitOfWork = unitOfWork;
        _financialEngine = financialEngine;
        _numberGenerationService = numberGenerationService;
        _auditLogRepository = auditLogRepository;
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

        quotation.Status = QuotationStatus.Sent;
        quotation.Communications.Add(new QuotationCommunication
        {
            QuotationId = quotationId,
            CommunicationType = "Email",
            Recipient = quotation.Customer?.Email ?? "customer@example.com",
            Subject = $"Quotation #{quotation.QuoteNumber}",
            Message = $"Quotation #{quotation.QuoteNumber} has been sent.",
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
            Changes = "Status changed to Sent",
            Timestamp = DateTime.UtcNow
        };
        await _auditLogRepository.AddAsync(auditLog);
        
        return ApiResponse<bool>.Ok(true, "Quotation sent.");
    }

    public async Task<ApiResponse<bool>> ApproveQuotationAsync(int quotationId, int tenantId, string approverId)
    {
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
                Subtotal = quotation.Subtotal,
                DiscountAmount = quotation.DiscountAmount,
                TaxAmount = quotation.TaxAmount,
                ChargesAmount = quotation.ChargesAmount,
                TotalAmount = quotation.TotalAmount,
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
