using Billing.Contracts;

namespace Billing.Application.Interfaces;

public interface ICustomerService
{
    Task<ApiResponse<CustomerDto>> CreateCustomerAsync(CreateCustomerRequest request, int tenantId);

    Task<ApiResponse<PagedResult<CustomerDto>>> GetCustomersAsync(CustomerQueryParameters query, int? tenantId);

    Task<ApiResponse<CustomerDto>> GetCustomerByIdAsync(int id, int? tenantId);

    Task<ApiResponse<CustomerDto>> UpdateCustomerAsync(int id, UpdateCustomerRequest request, int? tenantId);

    Task<ApiResponse<CustomerDto>> DeactivateCustomerAsync(int id, int? tenantId);

    Task<ApiResponse<CustomerDetailsDto>> GetCustomerDetailsAsync(int id, int? tenantId);
}
