using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Numbering;
using Billing.Contracts.Quotation;
using Billing.Domain.Entities;
using Billing.Domain.Enums;

namespace Billing.Application.Services;

public class QuotationService : IQuotationService
{
    private readonly IQuotationRepository _quotationRepository;
    private readonly ICustomerRepository _customerRepository;
    private readonly INumberGenerationService _numberGenerationService;

    public QuotationService(
        IQuotationRepository quotationRepository,
        ICustomerRepository customerRepository,
        INumberGenerationService numberGenerationService)
    {
        _quotationRepository = quotationRepository;
        _customerRepository = customerRepository;
        _numberGenerationService = numberGenerationService;
    }

    public async Task<ApiResponse<PagedResult<QuotationResponse>>> GetPagedListAsync(QuotationListFilterRequest filter, int tenantId)
    {
        if (tenantId <= 0)
        {
            return ApiResponse<PagedResult<QuotationResponse>>.Fail("Invalid tenant identifier", "Tenant ID must be greater than 0.");
        }

        var (items, totalCount) = await _quotationRepository.GetPagedListAsync(tenantId, filter);

        var dtos = items.Select(MapToResponse).ToList();
        var pagedResult = new PagedResult<QuotationResponse>(dtos, totalCount, filter.PageNumber, filter.PageSize);

        return ApiResponse<PagedResult<QuotationResponse>>.Ok(pagedResult);
    }

    public async Task<ApiResponse<QuotationDetailResponse>> GetByIdAsync(int id, int tenantId)
    {
        if (tenantId <= 0)
        {
            return ApiResponse<QuotationDetailResponse>.Fail("Invalid tenant identifier", "Tenant ID must be greater than 0.");
        }

        var quotation = await _quotationRepository.GetByIdAsync(id, tenantId);
        if (quotation == null)
        {
            return ApiResponse<QuotationDetailResponse>.Fail("Quotation not found", $"Quotation with ID {id} was not found.");
        }

        return ApiResponse<QuotationDetailResponse>.Ok(MapToDetailResponse(quotation));
    }

    public async Task<ApiResponse<QuotationDetailResponse>> CreateDraftAsync(CreateQuotationRequest request, int tenantId, string? userId = null)
    {
        if (tenantId <= 0)
        {
            return ApiResponse<QuotationDetailResponse>.Fail("Invalid tenant identifier", "Tenant ID must be greater than 0.");
        }

        if (request == null)
        {
            return ApiResponse<QuotationDetailResponse>.Fail("Invalid request", "Quotation request payload cannot be null.");
        }

        if (request.Items == null || !request.Items.Any())
        {
            return ApiResponse<QuotationDetailResponse>.Fail("Validation error", "At least one line item is required in the quotation.");
        }

        // Validate Customer
        var customer = await _customerRepository.GetByIdAsync(request.CustomerId, tenantId);
        if (customer == null)
        {
            return ApiResponse<QuotationDetailResponse>.Fail("Validation error", $"Customer with ID {request.CustomerId} was not found for current organization.");
        }

        // Generate or Validate QuoteNumber
        string quoteNumber;
        if (!string.IsNullOrWhiteSpace(request.QuoteNumber))
        {
            quoteNumber = request.QuoteNumber.Trim().ToUpperInvariant();
            var exists = await _quotationRepository.ExistsQuoteNumberAsync(quoteNumber, tenantId);
            if (exists)
            {
                return ApiResponse<QuotationDetailResponse>.Fail($"A quotation with number '{quoteNumber}' already exists.", errorCode: "DUPLICATE_QUOTE_NUMBER");
            }
        }
        else
        {
            var numberGenResult = await _numberGenerationService.GenerateNextNumberAsync(
                new GenerateNumberRequest
                {
                    DocumentType = "Quotation",
                    TransactionDate = request.QuotationDate ?? DateTime.UtcNow
                },
                tenantId);

            if (numberGenResult != null && numberGenResult.Success && numberGenResult.Data != null && !string.IsNullOrWhiteSpace(numberGenResult.Data.GeneratedNumber))
            {
                quoteNumber = numberGenResult.Data.GeneratedNumber;
            }
            else
            {
                quoteNumber = $"QT-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";
            }
        }

        var quotation = new Quotation
        {
            TenantId = tenantId,
            QuoteNumber = quoteNumber,
            CustomerId = request.CustomerId,
            QuotationDate = request.QuotationDate ?? DateTime.UtcNow,
            ValidUntil = request.ValidUntil,
            Reference = request.Reference?.Trim(),
            Notes = request.Notes?.Trim(),
            TermsAndConditions = request.TermsAndConditions?.Trim(),
            Status = QuotationStatus.Draft,
            CreatedAtUtc = DateTime.UtcNow,
            RowVersion = DateTime.UtcNow
        };

        // Calculate and add items
        decimal subtotal = 0m;
        decimal totalDiscount = 0m;
        decimal totalTax = 0m;

        foreach (var itemReq in request.Items)
        {
            var gross = Math.Round(itemReq.Quantity * itemReq.UnitPrice, 2, MidpointRounding.AwayFromZero);

            decimal discountAmount = 0m;
            if (itemReq.DiscountRate.HasValue && itemReq.DiscountRate.Value > 0)
            {
                if (string.Equals(itemReq.DiscountType, "Percentage", StringComparison.OrdinalIgnoreCase))
                {
                    var rate = Math.Min(100m, itemReq.DiscountRate.Value);
                    discountAmount = Math.Round(gross * (rate / 100m), 2, MidpointRounding.AwayFromZero);
                }
                else
                {
                    discountAmount = Math.Min(gross, itemReq.DiscountRate.Value);
                }
            }

            var taxable = Math.Max(0m, gross - discountAmount);
            decimal taxAmount = 0m;
            if (itemReq.TaxRate.HasValue && itemReq.TaxRate.Value > 0)
            {
                taxAmount = Math.Round(taxable * (itemReq.TaxRate.Value / 100m), 2, MidpointRounding.AwayFromZero);
            }

            var lineTotal = taxable + taxAmount;

            subtotal += gross;
            totalDiscount += discountAmount;
            totalTax += taxAmount;

            quotation.Items.Add(new QuotationItem
            {
                ProductId = itemReq.ProductId,
                Description = itemReq.Description.Trim(),
                Quantity = itemReq.Quantity,
                UnitPrice = itemReq.UnitPrice,
                DiscountType = itemReq.DiscountType,
                DiscountRate = itemReq.DiscountRate,
                DiscountAmount = discountAmount,
                TaxType = itemReq.TaxType,
                TaxRate = itemReq.TaxRate,
                TaxAmount = taxAmount,
                TotalAmount = lineTotal,
                HSNSAC = itemReq.HSNSAC?.Trim()
            });
        }

        quotation.Subtotal = subtotal;
        quotation.DiscountAmount = totalDiscount;
        quotation.TaxAmount = totalTax;
        quotation.ChargesAmount = 0m;
        quotation.TotalAmount = subtotal - totalDiscount + totalTax;

        await _quotationRepository.AddAsync(quotation);
        quotation.Customer = customer;

        return ApiResponse<QuotationDetailResponse>.Ok(MapToDetailResponse(quotation), "Quotation draft created successfully.");
    }

    public async Task<ApiResponse<QuotationDetailResponse>> UpdateDraftAsync(int id, UpdateQuotationRequest request, int tenantId)
    {
        if (tenantId <= 0)
        {
            return ApiResponse<QuotationDetailResponse>.Fail("Invalid tenant identifier", "Tenant ID must be greater than 0.");
        }

        var quotation = await _quotationRepository.GetByIdForUpdateAsync(id, tenantId);
        if (quotation == null)
        {
            return ApiResponse<QuotationDetailResponse>.Fail("Not found", $"Quotation with ID {id} was not found.");
        }

        // Draft Immutability Guard: Only Draft quotations can be edited
        if (quotation.Status != QuotationStatus.Draft)
        {
            return ApiResponse<QuotationDetailResponse>.Fail(
                $"Only Draft quotations can be edited. Quotation {quotation.QuoteNumber} is in '{quotation.Status}' status and cannot be modified.",
                errorCode: "INVALID_STATUS");
        }

        // Concurrency Check
        if (!string.IsNullOrWhiteSpace(request.RowVersion))
        {
            var currentBase64 = Convert.ToBase64String(BitConverter.GetBytes(quotation.RowVersion.Ticks));
            var currentIso = quotation.RowVersion.ToString("o");

            if (!string.Equals(request.RowVersion.Trim(), currentBase64, StringComparison.Ordinal) &&
                !string.Equals(request.RowVersion.Trim(), currentIso, StringComparison.Ordinal))
            {
                return ApiResponse<QuotationDetailResponse>.Fail(
                    "A concurrency conflict occurred. The quotation was updated or locked concurrently. Please reload and retry the operation.",
                    errorCode: "CONCURRENCY_CONFLICT");
            }
        }

        // Validate Customer
        var customer = await _customerRepository.GetByIdAsync(request.CustomerId, tenantId);
        if (customer == null)
        {
            return ApiResponse<QuotationDetailResponse>.Fail("Validation error", $"Customer with ID {request.CustomerId} was not found for current organization.");
        }

        if (request.Items == null || !request.Items.Any())
        {
            return ApiResponse<QuotationDetailResponse>.Fail("Validation error", "At least one line item is required in the quotation.");
        }

        // Update fields
        quotation.CustomerId = request.CustomerId;
        quotation.QuotationDate = request.QuotationDate;
        quotation.ValidUntil = request.ValidUntil;
        quotation.Reference = request.Reference?.Trim();
        quotation.Notes = request.Notes?.Trim();
        quotation.TermsAndConditions = request.TermsAndConditions?.Trim();

        // Clear and rebuild line items
        quotation.Items.Clear();

        decimal subtotal = 0m;
        decimal totalDiscount = 0m;
        decimal totalTax = 0m;

        foreach (var itemReq in request.Items)
        {
            var gross = Math.Round(itemReq.Quantity * itemReq.UnitPrice, 2, MidpointRounding.AwayFromZero);

            decimal discountAmount = 0m;
            if (itemReq.DiscountRate.HasValue && itemReq.DiscountRate.Value > 0)
            {
                if (string.Equals(itemReq.DiscountType, "Percentage", StringComparison.OrdinalIgnoreCase))
                {
                    var rate = Math.Min(100m, itemReq.DiscountRate.Value);
                    discountAmount = Math.Round(gross * (rate / 100m), 2, MidpointRounding.AwayFromZero);
                }
                else
                {
                    discountAmount = Math.Min(gross, itemReq.DiscountRate.Value);
                }
            }

            var taxable = Math.Max(0m, gross - discountAmount);
            decimal taxAmount = 0m;
            if (itemReq.TaxRate.HasValue && itemReq.TaxRate.Value > 0)
            {
                taxAmount = Math.Round(taxable * (itemReq.TaxRate.Value / 100m), 2, MidpointRounding.AwayFromZero);
            }

            var lineTotal = taxable + taxAmount;

            subtotal += gross;
            totalDiscount += discountAmount;
            totalTax += taxAmount;

            quotation.Items.Add(new QuotationItem
            {
                QuotationId = quotation.Id,
                ProductId = itemReq.ProductId,
                Description = itemReq.Description.Trim(),
                Quantity = itemReq.Quantity,
                UnitPrice = itemReq.UnitPrice,
                DiscountType = itemReq.DiscountType,
                DiscountRate = itemReq.DiscountRate,
                DiscountAmount = discountAmount,
                TaxType = itemReq.TaxType,
                TaxRate = itemReq.TaxRate,
                TaxAmount = taxAmount,
                TotalAmount = lineTotal,
                HSNSAC = itemReq.HSNSAC?.Trim()
            });
        }

        quotation.Subtotal = subtotal;
        quotation.DiscountAmount = totalDiscount;
        quotation.TaxAmount = totalTax;
        quotation.TotalAmount = subtotal - totalDiscount + totalTax + quotation.ChargesAmount;

        await _quotationRepository.UpdateAsync(quotation);
        quotation.Customer = customer;

        return ApiResponse<QuotationDetailResponse>.Ok(MapToDetailResponse(quotation), "Quotation draft updated successfully.");
    }

    private static QuotationResponse MapToResponse(Quotation q)
    {
        return new QuotationResponse
        {
            Id = q.Id,
            TenantId = q.TenantId,
            QuoteNumber = q.QuoteNumber,
            CustomerId = q.CustomerId,
            CustomerName = q.Customer?.Name ?? string.Empty,
            QuotationDate = q.QuotationDate,
            ValidUntil = q.ValidUntil,
            Reference = q.Reference,
            Status = q.Status.ToString(),
            Subtotal = q.Subtotal,
            DiscountAmount = q.DiscountAmount,
            TaxAmount = q.TaxAmount,
            ChargesAmount = q.ChargesAmount,
            TotalAmount = q.TotalAmount,
            ConvertedInvoiceId = q.ConvertedInvoiceId,
            ItemCount = q.Items?.Count ?? 0,
            RowVersion = Convert.ToBase64String(BitConverter.GetBytes(q.RowVersion.Ticks)),
            CreatedAtUtc = q.CreatedAtUtc,
            UpdatedAtUtc = q.UpdatedAtUtc
        };
    }

    private static QuotationDetailResponse MapToDetailResponse(Quotation q)
    {
        var resp = new QuotationDetailResponse
        {
            Id = q.Id,
            TenantId = q.TenantId,
            QuoteNumber = q.QuoteNumber,
            CustomerId = q.CustomerId,
            CustomerName = q.Customer?.Name ?? string.Empty,
            CustomerEmail = q.Customer?.Email,
            CustomerPhone = q.Customer?.Phone,
            CustomerAddress = q.Customer?.Address,
            QuotationDate = q.QuotationDate,
            ValidUntil = q.ValidUntil,
            Reference = q.Reference,
            Status = q.Status.ToString(),
            Subtotal = q.Subtotal,
            DiscountAmount = q.DiscountAmount,
            TaxAmount = q.TaxAmount,
            ChargesAmount = q.ChargesAmount,
            TotalAmount = q.TotalAmount,
            ConvertedInvoiceId = q.ConvertedInvoiceId,
            Notes = q.Notes,
            TermsAndConditions = q.TermsAndConditions,
            ItemCount = q.Items?.Count ?? 0,
            RowVersion = Convert.ToBase64String(BitConverter.GetBytes(q.RowVersion.Ticks)),
            CreatedAtUtc = q.CreatedAtUtc,
            UpdatedAtUtc = q.UpdatedAtUtc,
            Items = q.Items?.Select(i => new QuotationItemDto
            {
                Id = i.Id,
                ProductId = i.ProductId,
                ProductCode = i.Product?.ProductCode,
                ProductName = i.Product?.Name,
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
            }).ToList() ?? new List<QuotationItemDto>(),
            Communications = q.Communications?.Select(c => new QuotationCommunicationDto
            {
                Id = c.Id,
                CommunicationType = c.CommunicationType,
                Recipient = c.Recipient,
                Subject = c.Subject,
                Message = c.Message,
                Status = c.Status,
                SentAt = c.SentAt,
                SentBy = c.SentBy
            }).ToList() ?? new List<QuotationCommunicationDto>()
        };

        return resp;
    }
}
