using Billing.Contracts;

namespace Billing.Application.Interfaces;

public interface IProductService
{
    Task<ApiResponse<ProductDto>> CreateProductAsync(CreateProductRequest request, int tenantId);

    Task<ApiResponse<PagedResult<ProductDto>>> GetProductsAsync(ProductQueryParameters query, int? tenantId);

    Task<ApiResponse<ProductDto>> GetProductByIdAsync(int id, int? tenantId);

    Task<ApiResponse<ProductDto>> UpdateProductAsync(int id, UpdateProductRequest request, int? tenantId);
}
