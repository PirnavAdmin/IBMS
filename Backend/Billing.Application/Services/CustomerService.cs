using System.Text.RegularExpressions;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Domain.Entities;

namespace Billing.Application.Services;

public class CustomerService : ICustomerService
{
    private static readonly Regex EmailRegex = new(
        @"^[a-zA-Z0-9]+([._+-][a-zA-Z0-9]+)*@[a-zA-Z0-9]+([.-][a-zA-Z0-9]+)*\.[a-zA-Z]{2,}$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex PhoneRegex = new(
        @"^[+]*[(]{0,1}[0-9]{1,4}[)]{0,1}[-\s\./0-9]*$",
        RegexOptions.Compiled);

    private static readonly Regex NameSpecialCharactersRegex = new(
        @"[.,!@#$%^&*()_+=\[\]{};:""\\|<>?/~`]",
        RegexOptions.Compiled);

    private static readonly Regex StreetAddressRegex = new(
        @"^[\p{L}\p{M}0-9\s,.\-/#':()]+$",
        RegexOptions.Compiled);

    private static readonly Regex ConsecutiveAddressSymbolsRegex = new(
        @"[,\-/#':().]{2,}",
        RegexOptions.Compiled);

    private static readonly Regex CompanyNameRegex = new(
        @"^[\p{L}\p{M}0-9\s.,&'\-()]+$",
        RegexOptions.Compiled);

    private static readonly Regex ConsecutiveCompanySymbolsRegex = new(
        @"[.,&'\-()]{2,}",
        RegexOptions.Compiled);

    private static readonly Regex WebsiteUrlRegex = new(
        @"^(https?:\/\/)?(([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,})(:\d{1,5})?(\/[a-zA-Z0-9\-._~%!$&'()*+,;=:@/?#]*)?$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex IllegalUrlCharactersRegex = new(
        @"[<>"'\\^|{}\s]",
        RegexOptions.Compiled);

    private static bool IsValidWebsiteUrl(string? website)
    {
        if (string.IsNullOrWhiteSpace(website)) return true;
        var trimmed = website.Trim();
        if (trimmed.Length > 256) return false;
        if (IllegalUrlCharactersRegex.IsMatch(trimmed)) return false;
        if (!WebsiteUrlRegex.IsMatch(trimmed)) return false;

        var urlToTest = Regex.IsMatch(trimmed, @"^https?:\/\/", RegexOptions.IgnoreCase)
            ? trimmed
            : "https://" + trimmed;

        if (!Uri.TryCreate(urlToTest, UriKind.Absolute, out var uri)) return false;
        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) return false;
        if (string.IsNullOrWhiteSpace(uri.Host) || !uri.Host.Contains('.')) return false;

        var parts = uri.Host.Split('.');
        if (parts.Any(p => string.IsNullOrWhiteSpace(p) || p.StartsWith('-') || p.EndsWith('-'))) return false;
        var tld = parts[^1];
        if (tld.Length < 2 || !tld.All(char.IsLetter)) return false;

        return true;
    }

    private static IEnumerable<Invoice> BillableInvoices(Customer customer) => customer.Invoices.Where(i =>
        i.TenantId == customer.TenantId && !new[] { "Draft", "Cancelled", "Void" }.Contains(i.Status, StringComparer.OrdinalIgnoreCase));
    private static decimal Outstanding(Customer customer) => BillableInvoices(customer).Sum(i => Math.Max(0, i.BalanceAmount));

    private readonly ICustomerRepository _customerRepository;
    private readonly IOutboxService? _outboxService;

    public CustomerService(ICustomerRepository customerRepository, IOutboxService? outboxService = null)
    {
        _customerRepository = customerRepository;
        _outboxService = outboxService;
    }

    public async Task<ApiResponse<CustomerDto>> CreateCustomerAsync(CreateCustomerRequest request, int tenantId)
    {
        if (tenantId <= 0)
        {
            return ApiResponse<CustomerDto>.Fail("Invalid tenant identifier", "A valid positive Tenant ID is required.");
        }

        var errors = ValidateCreateRequest(request);
        if (errors.Any())
        {
            return ApiResponse<CustomerDto>.Fail("Validation failed", errors);
        }

        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var existingCustomer = await _customerRepository.GetByEmailAsync(normalizedEmail, tenantId);
        if (existingCustomer != null)
        {
            return ApiResponse<CustomerDto>.Fail("Customer with this email already exists", "A customer with the email address '" + normalizedEmail + "' already exists.");
        }

        if (!string.IsNullOrWhiteSpace(request.Phone))
        {
            var existingWithPhone = await _customerRepository.GetByPhoneAsync(request.Phone, tenantId);
            if (existingWithPhone != null)
            {
                return ApiResponse<CustomerDto>.Fail("This phone number is already associated with an existing customer.", "This phone number is already associated with an existing customer.", "PHONE_ALREADY_EXISTS");
            }
        }

        var customerCode = string.IsNullOrWhiteSpace(request.CustomerCode)
            ? await _customerRepository.GetNextCustomerCodeAsync(tenantId, "CUST-")
            : request.CustomerCode.Trim().ToUpperInvariant();

        var existingWithCode = await _customerRepository.GetByCodeAsync(customerCode, tenantId);
        if (existingWithCode != null)
        {
            return ApiResponse<CustomerDto>.Fail("Customer code conflict", $"Customer with code '{customerCode}' already exists for this tenant.");
        }

        var customer = new Customer
        {
            TenantId = tenantId,
            CustomerCode = customerCode,
            Name = request.Name.Trim(),
            Email = normalizedEmail,
            Phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim(),
            CompanyName = string.IsNullOrWhiteSpace(request.CompanyName) ? null : request.CompanyName.Trim(),
            CustomerType = !string.IsNullOrWhiteSpace(request.CustomerType)
                ? (request.CustomerType.Trim().Equals("organization", StringComparison.OrdinalIgnoreCase) ? "Organization"
                  : request.CustomerType.Trim().Equals("business", StringComparison.OrdinalIgnoreCase) ? "Business"
                  : request.CustomerType.Trim().Equals("individual", StringComparison.OrdinalIgnoreCase) ? "Individual"
                  : request.CustomerType.Trim())
                : (!string.IsNullOrWhiteSpace(request.CompanyName) ? "Business" : "Individual"),
            TaxId = string.IsNullOrWhiteSpace(request.TaxId) ? null : request.TaxId.Trim(),
            Address = string.IsNullOrWhiteSpace(request.Address) ? null : request.Address.Trim(),
            City = string.IsNullOrWhiteSpace(request.City) ? null : request.City.Trim(),
            State = string.IsNullOrWhiteSpace(request.State) ? null : request.State.Trim(),
            PostalCode = string.IsNullOrWhiteSpace(request.PostalCode) ? null : request.PostalCode.Trim(),
            Country = string.IsNullOrWhiteSpace(request.Country) ? null : request.Country.Trim(),
            Website = string.IsNullOrWhiteSpace(request.Website) ? null : request.Website.Trim(),
            Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
            Currency = string.IsNullOrWhiteSpace(request.Currency) ? "INR" : request.Currency.Trim().ToUpperInvariant(),
            PaymentTerms = string.IsNullOrWhiteSpace(request.PaymentTerms) ? null : request.PaymentTerms.Trim(),
            Status = "Active",
            IsActive = true,
            CreatedAtUtc = DateTime.UtcNow,
            RowVersion = DateTime.UtcNow
        };

        if (request.Addresses != null && request.Addresses.Any())
        {
            foreach (var addr in request.Addresses)
            {
                customer.Addresses.Add(new CustomerAddress
                {
                    TenantId = tenantId,
                    AddressType = string.IsNullOrWhiteSpace(addr.AddressType) ? "Billing" : addr.AddressType.Trim(),
                    AddressLine1 = addr.AddressLine1?.Trim() ?? string.Empty,
                    AddressLine2 = addr.AddressLine2?.Trim(),
                    City = addr.City?.Trim() ?? string.Empty,
                    State = addr.State?.Trim(),
                    PostalCode = addr.PostalCode?.Trim(),
                    Country = string.IsNullOrWhiteSpace(addr.Country) ? "USA" : addr.Country.Trim(),
                    IsDefault = addr.IsDefault,
                    CreatedAtUtc = DateTime.UtcNow
                });
            }
        }
        else if (!string.IsNullOrWhiteSpace(request.Address) || !string.IsNullOrWhiteSpace(request.City))
        {
            customer.Addresses.Add(new CustomerAddress
            {
                TenantId = tenantId,
                AddressType = "Billing",
                AddressLine1 = string.IsNullOrWhiteSpace(request.Address) ? "N/A" : request.Address.Trim(),
                City = string.IsNullOrWhiteSpace(request.City) ? "N/A" : request.City.Trim(),
                State = request.State?.Trim(),
                PostalCode = request.PostalCode?.Trim(),
                Country = string.IsNullOrWhiteSpace(request.Country) ? "USA" : request.Country.Trim(),
                IsDefault = true,
                CreatedAtUtc = DateTime.UtcNow
            });
        }

        try
        {
            await _customerRepository.AddAsync(customer);
        }
        catch (Billing.Application.Common.DuplicateCustomerCodeException ex)
        {
            return ApiResponse<CustomerDto>.Fail("Customer code conflict", ex.Message);
        }

        if (_outboxService != null)
        {
            try
            {
                await _outboxService.PublishEventAsync(tenantId, "customer.created", new
                {
                    CustomerId = customer.Id,
                    CustomerCode = customer.CustomerCode,
                    Name = customer.Name,
                    CustomerName = customer.Name,
                    Customer = customer.Name,
                    Email = customer.Email,
                    Phone = customer.Phone,
                    CompanyName = customer.CompanyName,
                    CustomerType = customer.CustomerType,
                    Currency = customer.Currency,
                    Status = customer.Status,
                    IsActive = customer.IsActive,
                    CreatedAtUtc = customer.CreatedAtUtc
                });
            }
            catch
            {
            }
        }

        return ApiResponse<CustomerDto>.Ok(MapToDto(customer), "Customer created successfully.");
    }

    public async Task<ApiResponse<PagedResult<CustomerDto>>> GetCustomersAsync(CustomerQueryParameters query, int? tenantId)
    {
        query ??= new CustomerQueryParameters();

        var (items, totalCount) = await _customerRepository.GetPagedListAsync(tenantId, query);

        var dtos = items.Select(MapToDto).ToList();
        var result = new PagedResult<CustomerDto>(dtos, totalCount, query.PageNumber, query.PageSize);

        return ApiResponse<PagedResult<CustomerDto>>.Ok(result, "Customers retrieved successfully.");
    }

    public async Task<ApiResponse<CustomerDto>> GetCustomerByIdAsync(int id, int? tenantId)
    {
        if (id <= 0)
        {
            return ApiResponse<CustomerDto>.Fail("Invalid customer identifier", "Customer ID must be greater than zero.");
        }

        var customer = await _customerRepository.GetByIdAsync(id, tenantId);
        if (customer == null)
        {
            return ApiResponse<CustomerDto>.Fail("Customer not found", $"Customer with ID {id} was not found.");
        }

        return ApiResponse<CustomerDto>.Ok(MapToDto(customer), "Customer details retrieved successfully.");
    }

    public async Task<ApiResponse<CustomerDto>> UpdateCustomerAsync(int id, UpdateCustomerRequest request, int? tenantId)
    {
        if (id <= 0)
        {
            return ApiResponse<CustomerDto>.Fail("Invalid customer identifier", "Customer ID must be greater than zero.");
        }

        var customer = await _customerRepository.GetByIdForUpdateAsync(id, tenantId);
        if (customer == null)
        {
            return ApiResponse<CustomerDto>.Fail("Customer not found", $"Customer with ID {id} was not found.");
        }

        var errors = ValidateUpdateRequest(request);
        if (errors.Any())
        {
            return ApiResponse<CustomerDto>.Fail("Validation failed", errors);
        }

        if (request.RowVersion.HasValue && customer.RowVersion != DateTime.MinValue && customer.RowVersion != request.RowVersion.Value)
        {
            return ApiResponse<CustomerDto>.Fail("Concurrency conflict", "The customer record has been modified by another process. Please reload and try again.");
        }

        var targetTenantId = customer.TenantId;

        if (!string.IsNullOrWhiteSpace(request.Email))
        {
            var normalizedEmail = request.Email.Trim().ToLowerInvariant();
            if (!string.Equals(customer.Email, normalizedEmail, StringComparison.OrdinalIgnoreCase))
            {
                var existingWithEmail = await _customerRepository.GetByEmailAsync(normalizedEmail, targetTenantId);
                if (existingWithEmail != null && existingWithEmail.Id != id)
                {
                    return ApiResponse<CustomerDto>.Fail("Email conflict", $"Another customer with email '{normalizedEmail}' already exists.");
                }
            }
            customer.Email = normalizedEmail;
        }

        if (!string.IsNullOrWhiteSpace(request.CustomerCode))
        {
            var normalizedCode = request.CustomerCode.Trim().ToUpperInvariant();
            if (!string.Equals(customer.CustomerCode, normalizedCode, StringComparison.OrdinalIgnoreCase))
            {
                var existingWithCode = await _customerRepository.GetByCodeAsync(normalizedCode, targetTenantId);
                if (existingWithCode != null && existingWithCode.Id != id)
                {
                    return ApiResponse<CustomerDto>.Fail("Customer code conflict", $"Another customer with code '{normalizedCode}' already exists for this tenant.");
                }
                customer.CustomerCode = normalizedCode;
            }
        }

        if (!string.IsNullOrWhiteSpace(request.Name))
        {
            customer.Name = request.Name.Trim();
        }

        if (request.Phone != null)
        {
            var cleanPhone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();
            if (!string.IsNullOrWhiteSpace(cleanPhone) && !string.Equals(customer.Phone, cleanPhone, StringComparison.OrdinalIgnoreCase))
            {
                var existingWithPhone = await _customerRepository.GetByPhoneAsync(cleanPhone, targetTenantId);
                if (existingWithPhone != null && existingWithPhone.Id != id)
                {
                    return ApiResponse<CustomerDto>.Fail("This phone number is already associated with an existing customer.", "This phone number is already associated with an existing customer.", "PHONE_ALREADY_EXISTS");
                }
            }
            customer.Phone = cleanPhone;
        }

        if (request.CompanyName != null)
        {
            customer.CompanyName = string.IsNullOrWhiteSpace(request.CompanyName) ? null : request.CompanyName.Trim();
        }

        if (request.CustomerType != null)
        {
            var rawType = request.CustomerType.Trim();
            customer.CustomerType = string.IsNullOrWhiteSpace(rawType)
                ? (!string.IsNullOrWhiteSpace(customer.CompanyName) ? "Business" : "Individual")
                : (rawType.Equals("organization", StringComparison.OrdinalIgnoreCase) ? "Organization"
                  : rawType.Equals("business", StringComparison.OrdinalIgnoreCase) ? "Business"
                  : rawType.Equals("individual", StringComparison.OrdinalIgnoreCase) ? "Individual"
                  : rawType);
        }

        if (request.TaxId != null)
        {
            customer.TaxId = string.IsNullOrWhiteSpace(request.TaxId) ? null : request.TaxId.Trim();
        }

        if (request.Address != null)
        {
            customer.Address = string.IsNullOrWhiteSpace(request.Address) ? null : request.Address.Trim();
        }

        if (request.City != null)
        {
            customer.City = string.IsNullOrWhiteSpace(request.City) ? null : request.City.Trim();
        }

        if (request.State != null)
        {
            customer.State = string.IsNullOrWhiteSpace(request.State) ? null : request.State.Trim();
        }

        if (request.PostalCode != null)
        {
            customer.PostalCode = string.IsNullOrWhiteSpace(request.PostalCode) ? null : request.PostalCode.Trim();
        }

        if (request.Country != null)
        {
            customer.Country = string.IsNullOrWhiteSpace(request.Country) ? null : request.Country.Trim();
        }

        if (request.Website != null)
        {
            customer.Website = string.IsNullOrWhiteSpace(request.Website) ? null : request.Website.Trim();
        }

        if (request.Notes != null)
        {
            customer.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        }

        if (!string.IsNullOrWhiteSpace(request.Currency))
        {
            customer.Currency = request.Currency.Trim().ToUpperInvariant();
        }

        if (!string.IsNullOrWhiteSpace(request.PaymentTerms))
        {
            customer.PaymentTerms = request.PaymentTerms.Trim();
        }

        if (!string.IsNullOrWhiteSpace(request.Status))
        {
            customer.Status = string.Equals(request.Status.Trim(), "inactive", StringComparison.OrdinalIgnoreCase)
                ? "Inactive"
                : "Active";
        }
        else if (request.IsActive.HasValue)
        {
            customer.IsActive = request.IsActive.Value;
        }

        if (request.Addresses != null)
        {
            customer.Addresses.Clear();
            foreach (var addr in request.Addresses)
            {
                customer.Addresses.Add(new CustomerAddress
                {
                    TenantId = targetTenantId,
                    AddressType = string.IsNullOrWhiteSpace(addr.AddressType) ? "Billing" : addr.AddressType.Trim(),
                    AddressLine1 = addr.AddressLine1?.Trim() ?? string.Empty,
                    AddressLine2 = addr.AddressLine2?.Trim(),
                    City = addr.City?.Trim() ?? string.Empty,
                    State = addr.State?.Trim(),
                    PostalCode = addr.PostalCode?.Trim(),
                    Country = string.IsNullOrWhiteSpace(addr.Country) ? "USA" : addr.Country.Trim(),
                    IsDefault = addr.IsDefault,
                    CreatedAtUtc = DateTime.UtcNow
                });
            }
        }

        customer.UpdatedAtUtc = DateTime.UtcNow;

        try
        {
            await _customerRepository.UpdateAsync(customer);
        }
        catch (Billing.Application.Common.ConcurrencyConflictException)
        {
            return ApiResponse<CustomerDto>.Fail(
                "Concurrency conflict",
                "The customer record has been modified by another process. Please reload and try again."
            );
        }
        catch (Billing.Application.Common.DuplicateCustomerCodeException ex)
        {
            return ApiResponse<CustomerDto>.Fail("Customer code conflict", ex.Message);
        }

        if (_outboxService != null)
        {
            try
            {
                await _outboxService.PublishEventAsync(targetTenantId, "customer.updated", new
                {
                    CustomerId = customer.Id,
                    CustomerCode = customer.CustomerCode,
                    Name = customer.Name,
                    CustomerName = customer.Name,
                    Customer = customer.Name,
                    Email = customer.Email,
                    Phone = customer.Phone,
                    CompanyName = customer.CompanyName,
                    CustomerType = customer.CustomerType,
                    Currency = customer.Currency,
                    Status = customer.Status,
                    IsActive = customer.IsActive,
                    UpdatedAtUtc = customer.UpdatedAtUtc ?? DateTime.UtcNow
                });
            }
            catch
            {
            }
        }

        return ApiResponse<CustomerDto>.Ok(MapToDto(customer), "Customer updated successfully.");
    }

    public async Task<ApiResponse<CustomerDto>> DeactivateCustomerAsync(int id, int? tenantId)
    {
        if (id <= 0)
        {
            return ApiResponse<CustomerDto>.Fail("Invalid customer identifier", "Customer ID must be greater than zero.");
        }

        var customer = await _customerRepository.GetByIdForUpdateAsync(id, tenantId);
        if (customer == null)
        {
            return ApiResponse<CustomerDto>.Fail("Customer not found", $"Customer with ID {id} was not found.");
        }

        customer.IsActive = false;
        customer.UpdatedAtUtc = DateTime.UtcNow;

        try
        {
            await _customerRepository.UpdateAsync(customer);
        }
        catch (Billing.Application.Common.ConcurrencyConflictException)
        {
            return ApiResponse<CustomerDto>.Fail(
                "Concurrency conflict",
                "The customer record has been modified by another process. Please reload and try again."
            );
        }

        if (_outboxService != null)
        {
            try
            {
                await _outboxService.PublishEventAsync(customer.TenantId, "customer.updated", new
                {
                    CustomerId = customer.Id,
                    CustomerCode = customer.CustomerCode,
                    Name = customer.Name,
                    CustomerName = customer.Name,
                    Customer = customer.Name,
                    Status = "Inactive",
                    IsActive = false,
                    UpdatedAtUtc = customer.UpdatedAtUtc ?? DateTime.UtcNow
                });
            }
            catch
            {
            }
        }

        return ApiResponse<CustomerDto>.Ok(MapToDto(customer), "Customer deactivated successfully.");
    }

    public async Task<ApiResponse<CustomerDetailsDto>> GetCustomerDetailsAsync(int id, int? tenantId)
    {
        if (id <= 0)
        {
            return ApiResponse<CustomerDetailsDto>.Fail("Invalid customer identifier", "Customer ID must be greater than zero.");
        }

        var customer = await _customerRepository.GetByIdAsync(id, tenantId);
        if (customer == null)
        {
            return ApiResponse<CustomerDetailsDto>.Fail("Customer not found", $"Customer with ID {id} was not found.");
        }

        var billingAddr = customer.Addresses
            .FirstOrDefault(a => a.AddressType.Equals("Billing", StringComparison.OrdinalIgnoreCase) && a.IsDefault)
            ?? customer.Addresses.FirstOrDefault(a => a.AddressType.Equals("Billing", StringComparison.OrdinalIgnoreCase));

        var shippingAddr = customer.Addresses
            .FirstOrDefault(a => a.AddressType.Equals("Shipping", StringComparison.OrdinalIgnoreCase) && a.IsDefault)
            ?? customer.Addresses.FirstOrDefault(a => a.AddressType.Equals("Shipping", StringComparison.OrdinalIgnoreCase));

        var details = new CustomerDetailsDto
        {
            Customer = MapToDto(customer),
            BillingAddress = billingAddr != null ? MapAddressToDto(billingAddr) : null,
            ShippingAddress = shippingAddr != null ? MapAddressToDto(shippingAddr) : null,
            Addresses = customer.Addresses.Select(MapAddressToDto).ToList(),
            FinancialSummary = new CustomerFinancialSummaryDto
            {
                TotalInvoiced = BillableInvoices(customer).Sum(i => i.TotalAmount),
                TotalPaid = BillableInvoices(customer).Sum(i => i.PaidAmount),
                OutstandingBalance = Outstanding(customer),
                CreditLimit = 0.00m,
                Currency = customer.Currency,
                TotalInvoicesCount = customer.Invoices.Count(i => i.TenantId == customer.TenantId),
                OpenInvoicesCount = BillableInvoices(customer).Count(i => i.BalanceAmount > 0),
                OverdueInvoicesCount = BillableInvoices(customer).Count(i => i.BalanceAmount > 0 && i.DueDate < DateTime.UtcNow.Date)
            },
            Invoices = customer.Invoices.Where(i => i.TenantId == customer.TenantId).OrderBy(i => i.DueDate).Select(i => new CustomerInvoiceSummaryDto
            {
                Id = i.Id, InvoiceNumber = i.InvoiceNumber, IssueDate = i.InvoiceDate,
                DueDate = i.DueDate ?? i.InvoiceDate, TotalAmount = i.TotalAmount,
                AmountPaid = i.PaidAmount, BalanceDue = i.BalanceAmount, Status = i.Status, Currency = customer.Currency
            }).ToList(),
            Payments = new List<CustomerPaymentSummaryDto>()
        };

        return ApiResponse<CustomerDetailsDto>.Ok(details, "Customer supporting details retrieved successfully.");
    }

    public async Task<ApiResponse<CustomerKpiSummaryDto>> GetCustomerSummaryAsync(int? tenantId)
    {
        var (allItems, totalCount) = await _customerRepository.GetPagedListAsync(tenantId, new CustomerQueryParameters
        {
            PageNumber = 1,
            PageSize = 10000,
            IsActive = null
        });

        var activeCount = allItems.Count(c => string.Equals(c.Status, "Active", StringComparison.OrdinalIgnoreCase));
        var inactiveCount = allItems.Count(c => string.Equals(c.Status, "Inactive", StringComparison.OrdinalIgnoreCase));

        var summary = new CustomerKpiSummaryDto
        {
            TotalCustomers = totalCount,
            ActiveCustomers = activeCount,
            InactiveCustomers = inactiveCount,
            TotalOutstanding = allItems.Sum(Outstanding),
            Currency = "INR"
        };

        return ApiResponse<CustomerKpiSummaryDto>.Ok(summary, "Customer summary retrieved successfully.");
    }

    private static CustomerAddressDto MapAddressToDto(CustomerAddress a)
    {
        return new CustomerAddressDto
        {
            Id = a.Id,
            CustomerId = a.CustomerId,
            TenantId = a.TenantId,
            AddressType = a.AddressType,
            AddressLine1 = a.AddressLine1,
            AddressLine2 = a.AddressLine2,
            City = a.City,
            State = a.State,
            PostalCode = a.PostalCode,
            Country = a.Country,
            IsDefault = a.IsDefault
        };
    }

    private static List<string> ValidateCreateRequest(CreateCustomerRequest request)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            errors.Add("Customer name is required.");
        }
        else if (request.Name.Trim().Length < 2)
        {
            errors.Add("Customer name must be at least 2 characters.");
        }
        else if (request.Name.Trim().Length > 256)
        {
            errors.Add("Customer name must not exceed 256 characters.");
        }
        else if (NameSpecialCharactersRegex.IsMatch(request.Name))
        {
            errors.Add("Customer Name should not contain special characters.");
        }

        if (string.IsNullOrWhiteSpace(request.Email))
        {
            errors.Add("Email is required.");
        }
        else
        {
            var email = request.Email.Trim();
            if (email.Length > 256)
            {
                errors.Add("Email must not exceed 256 characters.");
            }
            if (!EmailRegex.IsMatch(email))
            {
                errors.Add("Invalid email format.");
            }
        }

        if (!string.IsNullOrWhiteSpace(request.Phone))
        {
            var phone = request.Phone.Trim();
            if (phone.Length > 64)
            {
                errors.Add("Phone number must not exceed 64 characters.");
            }
            else if (!PhoneRegex.IsMatch(phone))
            {
                errors.Add("Invalid phone number format.");
            }
        }

        if (!string.IsNullOrWhiteSpace(request.CompanyName))
        {
            var company = request.CompanyName.Trim();
            if (company.Length < 2 || company.Length > 256)
            {
                errors.Add("Company name must be between 2 and 256 characters.");
            }
            else if (!CompanyNameRegex.IsMatch(company))
            {
                errors.Add("Company name can only contain letters, numbers, spaces, and standard characters (., &, ', -, ()).");
            }
            else if (ConsecutiveCompanySymbolsRegex.IsMatch(company))
            {
                errors.Add("Company name cannot contain consecutive special characters.");
            }
            else if (!Regex.IsMatch(company, @"[\p{L}0-9]"))
            {
                errors.Add("Company name must contain letters or numbers.");
            }
        }
        if (request.TaxId?.Length > 64) errors.Add("Tax ID must not exceed 64 characters.");
        if (!string.IsNullOrWhiteSpace(request.Address))
        {
            var address = request.Address.Trim();
            if (address.Length < 3 || address.Length > 512)
            {
                errors.Add("Address must be between 3 and 512 characters.");
            }
            else if (!StreetAddressRegex.IsMatch(address))
            {
                errors.Add("Please enter a valid street address. Unsupported special characters are not allowed.");
            }
            else if (ConsecutiveAddressSymbolsRegex.IsMatch(address))
            {
                errors.Add("Street address cannot contain consecutive special characters.");
            }
            else if (!Regex.IsMatch(address, @"[\p{L}0-9]"))
            {
                errors.Add("Street address must contain letters or numbers.");
            }
        }

        if (request.Addresses != null && request.Addresses.Any())
        {
            foreach (var addr in request.Addresses)
            {
                if (!string.IsNullOrWhiteSpace(addr.AddressLine1))
                {
                    var line1 = addr.AddressLine1.Trim();
                    if (line1.Length < 3 || line1.Length > 512)
                    {
                        errors.Add("Street address must be between 3 and 512 characters.");
                    }
                    else if (!StreetAddressRegex.IsMatch(line1))
                    {
                        errors.Add("Please enter a valid street address. Unsupported special characters are not allowed.");
                    }
                    else if (ConsecutiveAddressSymbolsRegex.IsMatch(line1))
                    {
                        errors.Add("Street address cannot contain consecutive special characters.");
                    }
                    else if (!Regex.IsMatch(line1, @"[\p{L}0-9]"))
                    {
                        errors.Add("Street address must contain letters or numbers.");
                    }
                }
            }
        }
        if (request.City?.Length > 128) errors.Add("City must not exceed 128 characters.");
        if (request.State?.Length > 128) errors.Add("State must not exceed 128 characters.");
        if (request.PostalCode?.Length > 32) errors.Add("Postal code must not exceed 32 characters.");
        if (request.Country?.Length > 128) errors.Add("Country must not exceed 128 characters.");
        if (!string.IsNullOrWhiteSpace(request.Website))
        {
            var trimmedWebsite = request.Website.Trim();
            if (trimmedWebsite.Length > 256)
            {
                errors.Add("Website must not exceed 256 characters.");
            }
            else if (!IsValidWebsiteUrl(trimmedWebsite))
            {
                errors.Add("Please enter a valid website URL.");
            }
        }
        if (request.Notes?.Length > 1000) errors.Add("Notes must not exceed 1000 characters.");
        if (request.Currency?.Length > 10) errors.Add("Currency code must not exceed 10 characters.");
        if (request.PaymentTerms?.Length > 64) errors.Add("Payment terms must not exceed 64 characters.");

        return errors;
    }

    private static List<string> ValidateUpdateRequest(UpdateCustomerRequest request)
    {
        var errors = new List<string>();

        if (request.Name != null)
        {
            if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length < 2)
            {
                errors.Add("Customer name must be at least 2 characters.");
            }
            else if (request.Name.Trim().Length > 256)
            {
                errors.Add("Customer name must not exceed 256 characters.");
            }
            else if (NameSpecialCharactersRegex.IsMatch(request.Name))
            {
                errors.Add("Customer Name should not contain special characters.");
            }
        }

        if (request.Email != null)
        {
            var email = request.Email.Trim();
            if (string.IsNullOrWhiteSpace(email) || !EmailRegex.IsMatch(email))
            {
                errors.Add("Invalid email format.");
            }
            else if (email.Length > 256)
            {
                errors.Add("Email must not exceed 256 characters.");
            }
        }

        if (!string.IsNullOrWhiteSpace(request.Phone))
        {
            var phone = request.Phone.Trim();
            if (phone.Length > 64)
            {
                errors.Add("Phone number must not exceed 64 characters.");
            }
            else if (!PhoneRegex.IsMatch(phone))
            {
                errors.Add("Invalid phone number format.");
            }
        }

        if (!string.IsNullOrWhiteSpace(request.CompanyName))
        {
            var company = request.CompanyName.Trim();
            if (company.Length < 2 || company.Length > 256)
            {
                errors.Add("Company name must be between 2 and 256 characters.");
            }
            else if (!CompanyNameRegex.IsMatch(company))
            {
                errors.Add("Company name can only contain letters, numbers, spaces, and standard characters (., &, ', -, ()).");
            }
            else if (ConsecutiveCompanySymbolsRegex.IsMatch(company))
            {
                errors.Add("Company name cannot contain consecutive special characters.");
            }
            else if (!Regex.IsMatch(company, @"[\p{L}0-9]"))
            {
                errors.Add("Company name must contain letters or numbers.");
            }
        }
        if (request.TaxId?.Length > 64) errors.Add("Tax ID must not exceed 64 characters.");
        if (!string.IsNullOrWhiteSpace(request.Address))
        {
            var address = request.Address.Trim();
            if (address.Length < 3 || address.Length > 512)
            {
                errors.Add("Address must be between 3 and 512 characters.");
            }
            else if (!StreetAddressRegex.IsMatch(address))
            {
                errors.Add("Please enter a valid street address. Unsupported special characters are not allowed.");
            }
            else if (ConsecutiveAddressSymbolsRegex.IsMatch(address))
            {
                errors.Add("Street address cannot contain consecutive special characters.");
            }
            else if (!Regex.IsMatch(address, @"[\p{L}0-9]"))
            {
                errors.Add("Street address must contain letters or numbers.");
            }
        }

        if (request.Addresses != null && request.Addresses.Any())
        {
            foreach (var addr in request.Addresses)
            {
                if (!string.IsNullOrWhiteSpace(addr.AddressLine1))
                {
                    var line1 = addr.AddressLine1.Trim();
                    if (line1.Length < 3 || line1.Length > 512)
                    {
                        errors.Add("Street address must be between 3 and 512 characters.");
                    }
                    else if (!StreetAddressRegex.IsMatch(line1))
                    {
                        errors.Add("Please enter a valid street address. Unsupported special characters are not allowed.");
                    }
                    else if (ConsecutiveAddressSymbolsRegex.IsMatch(line1))
                    {
                        errors.Add("Street address cannot contain consecutive special characters.");
                    }
                    else if (!Regex.IsMatch(line1, @"[\p{L}0-9]"))
                    {
                        errors.Add("Street address must contain letters or numbers.");
                    }
                }
            }
        }
        if (request.City?.Length > 128) errors.Add("City must not exceed 128 characters.");
        if (request.State?.Length > 128) errors.Add("State must not exceed 128 characters.");
        if (request.PostalCode?.Length > 32) errors.Add("Postal code must not exceed 32 characters.");
        if (request.Country?.Length > 128) errors.Add("Country must not exceed 128 characters.");
        if (!string.IsNullOrWhiteSpace(request.Website))
        {
            var trimmedWebsite = request.Website.Trim();
            if (trimmedWebsite.Length > 256)
            {
                errors.Add("Website must not exceed 256 characters.");
            }
            else if (!IsValidWebsiteUrl(trimmedWebsite))
            {
                errors.Add("Please enter a valid website URL.");
            }
        }
        if (request.Notes?.Length > 1000) errors.Add("Notes must not exceed 1000 characters.");
        if (request.Currency?.Length > 10) errors.Add("Currency code must not exceed 10 characters.");
        if (request.PaymentTerms?.Length > 64) errors.Add("Payment terms must not exceed 64 characters.");

        return errors;
    }

    private static CustomerDto MapToDto(Customer customer)
    {
        return new CustomerDto
        {
            Id = customer.Id,
            TenantId = customer.TenantId,
            CustomerCode = customer.CustomerCode,
            Name = customer.Name,
            Email = customer.Email,
            Phone = customer.Phone,
            CompanyName = customer.CompanyName,
            CustomerType = customer.CustomerType ?? (!string.IsNullOrWhiteSpace(customer.CompanyName) ? "Business" : "Individual"),
            TaxId = customer.TaxId,
            Address = customer.Address,
            City = customer.City,
            State = customer.State,
            PostalCode = customer.PostalCode,
            Country = customer.Country ?? string.Empty,
            Website = customer.Website,
            Notes = customer.Notes,
            Currency = customer.Currency,
            OutstandingBalance = Outstanding(customer),
            PaymentTerms = customer.PaymentTerms,
            Status = customer.Status,
            IsActive = customer.IsActive,
            CreatedAtUtc = customer.CreatedAtUtc,
            UpdatedAtUtc = customer.UpdatedAtUtc,
            RowVersion = customer.RowVersion == DateTime.MinValue ? null : customer.RowVersion,
            Addresses = customer.Addresses?.Select(a => new CustomerAddressDto
            {
                Id = a.Id,
                CustomerId = a.CustomerId,
                TenantId = a.TenantId,
                AddressType = a.AddressType,
                AddressLine1 = a.AddressLine1,
                AddressLine2 = a.AddressLine2,
                City = a.City,
                State = a.State,
                PostalCode = a.PostalCode,
                Country = a.Country,
                IsDefault = a.IsDefault
            }).ToList() ?? new()
        };
    }

    public async Task<ApiResponse<string>> GetNextCustomerCodeAsync(int tenantId)
    {
        if (tenantId <= 0)
        {
            return ApiResponse<string>.Fail("Invalid tenant", "Tenant ID must be specified.");
        }

        var nextCode = await _customerRepository.GetNextCustomerCodeAsync(tenantId, "CUST-");
        return ApiResponse<string>.Ok(nextCode, "Next customer code generated successfully.");
    }
}
