using System.Text.RegularExpressions;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Domain.Entities;

namespace Billing.Application.Services;

public class CustomerService : ICustomerService
{
    private static readonly Regex EmailRegex = new(
        @"^[^@\s]+@[^@\s]+\.[^@\s]+$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex PhoneRegex = new(
        @"^[+]*[(]{0,1}[0-9]{1,4}[)]{0,1}[-\s\./0-9]*$",
        RegexOptions.Compiled);

    private readonly ICustomerRepository _customerRepository;

    public CustomerService(ICustomerRepository customerRepository)
    {
        _customerRepository = customerRepository;
    }

    public async Task<ApiResponse<CustomerDto>> CreateCustomerAsync(CreateCustomerRequest request, int tenantId)
    {
        var errors = ValidateCreateRequest(request);
        if (errors.Any())
        {
            return ApiResponse<CustomerDto>.Fail("Validation failed", errors);
        }

        var resolvedTenantId = tenantId <= 0 ? 1 : tenantId;
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var existingCustomer = await _customerRepository.GetByEmailAsync(normalizedEmail, resolvedTenantId);
        if (existingCustomer != null)
        {
            return ApiResponse<CustomerDto>.Fail("Customer with this email already exists", "A customer with the email address '" + normalizedEmail + "' already exists.");
        }

        var customerCode = string.IsNullOrWhiteSpace(request.CustomerCode)
            ? $"CUST-{Guid.NewGuid().ToString("N")[..8].ToUpperInvariant()}"
            : request.CustomerCode.Trim().ToUpperInvariant();

        var existingWithCode = await _customerRepository.GetByCodeAsync(customerCode, resolvedTenantId);
        if (existingWithCode != null)
        {
            return ApiResponse<CustomerDto>.Fail("Customer code conflict", $"Customer with code '{customerCode}' already exists for this tenant.");
        }

        var customer = new Customer
        {
            TenantId = resolvedTenantId,
            CustomerCode = customerCode,
            Name = request.Name.Trim(),
            Email = normalizedEmail,
            Phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim(),
            CompanyName = string.IsNullOrWhiteSpace(request.CompanyName) ? null : request.CompanyName.Trim(),
            TaxId = string.IsNullOrWhiteSpace(request.TaxId) ? null : request.TaxId.Trim(),
            Address = string.IsNullOrWhiteSpace(request.Address) ? null : request.Address.Trim(),
            City = string.IsNullOrWhiteSpace(request.City) ? null : request.City.Trim(),
            State = string.IsNullOrWhiteSpace(request.State) ? null : request.State.Trim(),
            PostalCode = string.IsNullOrWhiteSpace(request.PostalCode) ? null : request.PostalCode.Trim(),
            Country = string.IsNullOrWhiteSpace(request.Country) ? null : request.Country.Trim(),
            Website = string.IsNullOrWhiteSpace(request.Website) ? null : request.Website.Trim(),
            Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
            Currency = string.IsNullOrWhiteSpace(request.Currency) ? "USD" : request.Currency.Trim().ToUpperInvariant(),
            PaymentTerms = string.IsNullOrWhiteSpace(request.PaymentTerms) ? null : request.PaymentTerms.Trim(),
            IsActive = true,
            CreatedAtUtc = DateTime.UtcNow
        };

        if (request.Addresses != null && request.Addresses.Any())
        {
            foreach (var addr in request.Addresses)
            {
                customer.Addresses.Add(new CustomerAddress
                {
                    TenantId = resolvedTenantId,
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
                TenantId = resolvedTenantId,
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

        await _customerRepository.AddAsync(customer);

        return ApiResponse<CustomerDto>.Ok(MapToDto(customer), "Customer created successfully.");
    }

    public async Task<ApiResponse<PagedResult<CustomerDto>>> GetCustomersAsync(CustomerQueryParameters query, int tenantId)
    {
        query ??= new CustomerQueryParameters();
        var resolvedTenantId = tenantId <= 0 ? 1 : tenantId;

        var (items, totalCount) = await _customerRepository.GetPagedListAsync(resolvedTenantId, query);

        var dtos = items.Select(MapToDto).ToList();
        var result = new PagedResult<CustomerDto>(dtos, totalCount, query.PageNumber, query.PageSize);

        return ApiResponse<PagedResult<CustomerDto>>.Ok(result, "Customers retrieved successfully.");
    }

    public async Task<ApiResponse<CustomerDto>> GetCustomerByIdAsync(int id, int tenantId)
    {
        if (id <= 0)
        {
            return ApiResponse<CustomerDto>.Fail("Invalid customer identifier", "Customer ID must be greater than zero.");
        }

        var resolvedTenantId = tenantId <= 0 ? 1 : tenantId;
        var customer = await _customerRepository.GetByIdAsync(id, resolvedTenantId);
        if (customer == null)
        {
            return ApiResponse<CustomerDto>.Fail("Customer not found", $"Customer with ID {id} was not found.");
        }

        return ApiResponse<CustomerDto>.Ok(MapToDto(customer), "Customer details retrieved successfully.");
    }

    public async Task<ApiResponse<CustomerDto>> UpdateCustomerAsync(int id, UpdateCustomerRequest request, int tenantId)
    {
        if (id <= 0)
        {
            return ApiResponse<CustomerDto>.Fail("Invalid customer identifier", "Customer ID must be greater than zero.");
        }

        var resolvedTenantId = tenantId <= 0 ? 1 : tenantId;
        var customer = await _customerRepository.GetByIdAsync(id, resolvedTenantId);
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

        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        if (!string.Equals(customer.Email, normalizedEmail, StringComparison.OrdinalIgnoreCase))
        {
            var existingWithEmail = await _customerRepository.GetByEmailAsync(normalizedEmail, resolvedTenantId);
            if (existingWithEmail != null && existingWithEmail.Id != id)
            {
                return ApiResponse<CustomerDto>.Fail("Email conflict", $"Another customer with email '{normalizedEmail}' already exists.");
            }
        }

        if (!string.IsNullOrWhiteSpace(request.CustomerCode))
        {
            var normalizedCode = request.CustomerCode.Trim().ToUpperInvariant();
            if (!string.Equals(customer.CustomerCode, normalizedCode, StringComparison.OrdinalIgnoreCase))
            {
                var existingWithCode = await _customerRepository.GetByCodeAsync(normalizedCode, resolvedTenantId);
                if (existingWithCode != null && existingWithCode.Id != id)
                {
                    return ApiResponse<CustomerDto>.Fail("Customer code conflict", $"Another customer with code '{normalizedCode}' already exists for this tenant.");
                }
                customer.CustomerCode = normalizedCode;
            }
        }

        customer.Name = request.Name.Trim();
        customer.Email = normalizedEmail;
        customer.Phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();
        customer.CompanyName = string.IsNullOrWhiteSpace(request.CompanyName) ? null : request.CompanyName.Trim();
        customer.TaxId = string.IsNullOrWhiteSpace(request.TaxId) ? null : request.TaxId.Trim();
        customer.Address = string.IsNullOrWhiteSpace(request.Address) ? null : request.Address.Trim();
        customer.City = string.IsNullOrWhiteSpace(request.City) ? null : request.City.Trim();
        customer.State = string.IsNullOrWhiteSpace(request.State) ? null : request.State.Trim();
        customer.PostalCode = string.IsNullOrWhiteSpace(request.PostalCode) ? null : request.PostalCode.Trim();
        customer.Country = string.IsNullOrWhiteSpace(request.Country) ? null : request.Country.Trim();
        customer.Website = string.IsNullOrWhiteSpace(request.Website) ? null : request.Website.Trim();
        customer.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();

        if (!string.IsNullOrWhiteSpace(request.Currency))
        {
            customer.Currency = request.Currency.Trim().ToUpperInvariant();
        }

        if (!string.IsNullOrWhiteSpace(request.PaymentTerms))
        {
            customer.PaymentTerms = request.PaymentTerms.Trim();
        }

        if (request.IsActive.HasValue)
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
                    TenantId = resolvedTenantId,
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

        await _customerRepository.UpdateAsync(customer);

        return ApiResponse<CustomerDto>.Ok(MapToDto(customer), "Customer updated successfully.");
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

        if (request.CompanyName?.Length > 256) errors.Add("Company name must not exceed 256 characters.");
        if (request.TaxId?.Length > 64) errors.Add("Tax ID must not exceed 64 characters.");
        if (request.Address?.Length > 512) errors.Add("Address must not exceed 512 characters.");
        if (request.City?.Length > 128) errors.Add("City must not exceed 128 characters.");
        if (request.State?.Length > 128) errors.Add("State must not exceed 128 characters.");
        if (request.PostalCode?.Length > 32) errors.Add("Postal code must not exceed 32 characters.");
        if (request.Country?.Length > 128) errors.Add("Country must not exceed 128 characters.");
        if (request.Website?.Length > 256) errors.Add("Website must not exceed 256 characters.");
        if (request.Notes?.Length > 1000) errors.Add("Notes must not exceed 1000 characters.");
        if (request.Currency?.Length > 10) errors.Add("Currency code must not exceed 10 characters.");
        if (request.PaymentTerms?.Length > 64) errors.Add("Payment terms must not exceed 64 characters.");

        return errors;
    }

    private static List<string> ValidateUpdateRequest(UpdateCustomerRequest request)
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

        if (request.CompanyName?.Length > 256) errors.Add("Company name must not exceed 256 characters.");
        if (request.TaxId?.Length > 64) errors.Add("Tax ID must not exceed 64 characters.");
        if (request.Address?.Length > 512) errors.Add("Address must not exceed 512 characters.");
        if (request.City?.Length > 128) errors.Add("City must not exceed 128 characters.");
        if (request.State?.Length > 128) errors.Add("State must not exceed 128 characters.");
        if (request.PostalCode?.Length > 32) errors.Add("Postal code must not exceed 32 characters.");
        if (request.Country?.Length > 128) errors.Add("Country must not exceed 128 characters.");
        if (request.Website?.Length > 256) errors.Add("Website must not exceed 256 characters.");
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
            TaxId = customer.TaxId,
            Address = customer.Address,
            City = customer.City,
            State = customer.State,
            PostalCode = customer.PostalCode,
            Country = customer.Country ?? string.Empty,
            Website = customer.Website,
            Notes = customer.Notes,
            Currency = customer.Currency,
            PaymentTerms = customer.PaymentTerms,
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
}
