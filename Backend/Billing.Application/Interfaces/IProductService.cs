using Billing.Contracts;

namespace Billing.Application.Interfaces;

public interface IProductService
{
    Task<ApiResponse<ProductDto>> CreateProductAsync(CreateProductRequest request, int tenantId);

    Task<ApiResponse<PagedResult<ProductDto>>> GetProductsAsync(ProductQueryParameters query, int? tenantId);

    Task<ApiResponse<ProductDto>> GetProductByIdAsync(int id, int? tenantId);

    Task<ApiResponse<ProductDto>> UpdateProductAsync(int id, UpdateProductRequest request, int? tenantId);

    Task<ApiResponse<ProductDto>> DeactivateProductAsync(int id, int? tenantId);

    Task<ApiResponse<ProductDto>> ValidateProductForInvoicingAsync(int id, int tenantId);

    Task<ApiResponse<List<ProductCategoryDto>>> GetCategoriesAsync(int? tenantId);

    Task<ApiResponse<ProductCategoryDto>> CreateCategoryAsync(CreateCategoryRequest request, int tenantId);

    Task<ApiResponse<ProductCategoryDto>> UpdateCategoryStatusAsync(int categoryId, bool isActive, int tenantId);
}
