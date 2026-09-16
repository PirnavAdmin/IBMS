using System.Text.RegularExpressions;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Domain.Entities;

namespace Billing.Application.Services;

public class ProductService : IProductService
{
    private static readonly Regex ProductCodeRegex = new(
        @"^[A-Za-z0-9_-]{2,64}$",
        RegexOptions.Compiled);

    private readonly IProductRepository _productRepository;

    public ProductService(IProductRepository productRepository)
    {
        _productRepository = productRepository;
    }

    public async Task<ApiResponse<ProductDto>> CreateProductAsync(CreateProductRequest request, int tenantId)
    {
        if (tenantId <= 0)
        {
            return ApiResponse<ProductDto>.Fail("Invalid tenant identifier", "A valid positive Tenant ID is required.");
        }

        var errors = ValidateCreateRequest(request);
        if (errors.Any())
        {
            return ApiResponse<ProductDto>.Fail("Validation failed", errors);
        }

        var code = string.IsNullOrWhiteSpace(request.ProductCode)
            ? $"PROD-{Guid.NewGuid().ToString("N")[..8].ToUpperInvariant()}"
            : request.ProductCode.Trim().ToUpperInvariant();

        var existingWithCode = await _productRepository.GetByCodeAsync(code, tenantId);
        if (existingWithCode != null)
        {
            return ApiResponse<ProductDto>.Fail("Product code conflict", $"Product with code '{code}' already exists for this tenant.");
        }

        int? resolvedCategoryId = request.CategoryId;
        ProductCategory? resolvedCategory = null;

        if (request.CategoryId.HasValue && request.CategoryId.Value > 0)
        {
            resolvedCategory = await _productRepository.GetCategoryByIdAsync(request.CategoryId.Value, tenantId);
            if (resolvedCategory == null)
            {
                return ApiResponse<ProductDto>.Fail("Validation failed", $"Product category with ID {request.CategoryId.Value} was not found for this tenant.");
            }
        }
        else if (!string.IsNullOrWhiteSpace(request.Category))
        {
            var categoryName = request.Category.Trim();
            resolvedCategory = await _productRepository.GetCategoryByNameAsync(categoryName, tenantId);
            if (resolvedCategory == null)
            {
                resolvedCategory = await _productRepository.AddCategoryAsync(new ProductCategory
                {
                    TenantId = tenantId,
                    Name = categoryName,
                    Status = "Active",
                    CreatedAtUtc = DateTime.UtcNow
                });
            }
            resolvedCategoryId = resolvedCategory.Id;
        }

        var product = new Product
        {
            TenantId = tenantId,
            ProductCode = code,
            Name = request.Name.Trim(),
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            Type = string.IsNullOrWhiteSpace(request.Type) ? "Product" : request.Type.Trim(),
            CategoryId = resolvedCategoryId,
            Category = resolvedCategory,
            Unit = string.IsNullOrWhiteSpace(request.Unit) ? "Piece" : request.Unit.Trim(),
            Price = request.Price,
            Currency = string.IsNullOrWhiteSpace(request.Currency) ? "INR" : request.Currency.Trim().ToUpperInvariant(),
            TaxCategory = string.IsNullOrWhiteSpace(request.TaxCategory) ? null : request.TaxCategory.Trim(),
            HsnSacCode = string.IsNullOrWhiteSpace(request.HsnSacCode) ? null : request.HsnSacCode.Trim(),
            DiscountAllowed = request.DiscountAllowed,
            Status = string.IsNullOrWhiteSpace(request.Status) ? "Active" : request.Status.Trim(),
            CreatedAtUtc = DateTime.UtcNow,
            RowVersion = DateTime.UtcNow
        };

        var created = await _productRepository.AddAsync(product);
        if (created.Category == null && resolvedCategory != null)
        {
            created.Category = resolvedCategory;
        }

        return ApiResponse<ProductDto>.Ok(MapToDto(created), "Product created successfully.");
    }

    public async Task<ApiResponse<PagedResult<ProductDto>>> GetProductsAsync(ProductQueryParameters query, int? tenantId)
    {
        query ??= new ProductQueryParameters();

        var (items, totalCount) = await _productRepository.GetPagedListAsync(tenantId, query);
        var dtos = items.Select(MapToDto).ToList();

        var pagedResult = new PagedResult<ProductDto>(dtos, totalCount, query.PageNumber, query.PageSize);
        return ApiResponse<PagedResult<ProductDto>>.Ok(pagedResult, "Products retrieved successfully.");
    }

    public async Task<ApiResponse<ProductDto>> GetProductByIdAsync(int id, int? tenantId)
    {
        if (id <= 0)
        {
            return ApiResponse<ProductDto>.Fail("Invalid product identifier", "Product ID must be greater than 0.");
        }

        var product = await _productRepository.GetByIdAsync(id, tenantId);
        if (product == null)
        {
            return ApiResponse<ProductDto>.Fail("Product not found", $"Product with ID {id} was not found.");
        }

        return ApiResponse<ProductDto>.Ok(MapToDto(product), "Product retrieved successfully.");
    }

    public async Task<ApiResponse<ProductDto>> UpdateProductAsync(int id, UpdateProductRequest request, int? tenantId)
    {
        if (id <= 0)
        {
            return ApiResponse<ProductDto>.Fail("Invalid product identifier", "Product ID must be greater than 0.");
        }

        var errors = ValidateUpdateRequest(request);
        if (errors.Any())
        {
            return ApiResponse<ProductDto>.Fail("Validation failed", errors);
        }

        var product = await _productRepository.GetByIdForUpdateAsync(id, tenantId);
        if (product == null)
        {
            return ApiResponse<ProductDto>.Fail("Product not found", $"Product with ID {id} was not found.");
        }

        // Check if product code is being updated
        if (!string.IsNullOrWhiteSpace(request.ProductCode))
        {
            var newCode = request.ProductCode.Trim().ToUpperInvariant();
            if (!string.Equals(product.ProductCode, newCode, StringComparison.OrdinalIgnoreCase))
            {
                var existingWithCode = await _productRepository.GetByCodeAsync(newCode, product.TenantId);
                if (existingWithCode != null && existingWithCode.Id != product.Id)
                {
                    return ApiResponse<ProductDto>.Fail("Product code conflict", $"Product with code '{newCode}' already exists for this tenant.");
                }
                product.ProductCode = newCode;
            }
        }

        // Category resolution
        int? resolvedCategoryId = request.CategoryId;
        ProductCategory? resolvedCategory = null;

        if (request.CategoryId.HasValue && request.CategoryId.Value > 0)
        {
            resolvedCategory = await _productRepository.GetCategoryByIdAsync(request.CategoryId.Value, product.TenantId);
            if (resolvedCategory == null)
            {
                return ApiResponse<ProductDto>.Fail("Validation failed", $"Product category with ID {request.CategoryId.Value} was not found for this tenant.");
            }
            product.CategoryId = resolvedCategory.Id;
            product.Category = resolvedCategory;
        }
        else if (!string.IsNullOrWhiteSpace(request.Category))
        {
            var categoryName = request.Category.Trim();
            resolvedCategory = await _productRepository.GetCategoryByNameAsync(categoryName, product.TenantId);
            if (resolvedCategory == null)
            {
                resolvedCategory = await _productRepository.AddCategoryAsync(new ProductCategory
                {
                    TenantId = product.TenantId,
                    Name = categoryName,
                    Status = "Active",
                    CreatedAtUtc = DateTime.UtcNow
                });
            }
            product.CategoryId = resolvedCategory.Id;
            product.Category = resolvedCategory;
        }

        product.Name = request.Name.Trim();
        product.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        product.Type = string.IsNullOrWhiteSpace(request.Type) ? "Product" : request.Type.Trim();
        product.Unit = string.IsNullOrWhiteSpace(request.Unit) ? "Piece" : request.Unit.Trim();
        product.Price = request.Price;
        product.Currency = string.IsNullOrWhiteSpace(request.Currency) ? "INR" : request.Currency.Trim().ToUpperInvariant();
        product.TaxCategory = string.IsNullOrWhiteSpace(request.TaxCategory) ? null : request.TaxCategory.Trim();
        product.HsnSacCode = string.IsNullOrWhiteSpace(request.HsnSacCode) ? null : request.HsnSacCode.Trim();
        product.DiscountAllowed = request.DiscountAllowed;
        product.Status = string.IsNullOrWhiteSpace(request.Status) ? "Active" : request.Status.Trim();
        product.UpdatedAtUtc = DateTime.UtcNow;
        product.RowVersion = DateTime.UtcNow;

        var updated = await _productRepository.UpdateAsync(product);
        if (updated.Category == null && resolvedCategory != null)
        {
            updated.Category = resolvedCategory;
        }

        return ApiResponse<ProductDto>.Ok(MapToDto(updated), "Product updated successfully.");
    }

    /// <summary>
    /// Deactivates a product safely to protect historical invoice and transaction references. (IBMSBE-012)
    /// Hard physical deletion is prevented to maintain relational and financial integrity.
    /// </summary>
    public async Task<ApiResponse<ProductDto>> DeactivateProductAsync(int id, int? tenantId)
    {
        if (id <= 0)
        {
            return ApiResponse<ProductDto>.Fail("Invalid product identifier", "Product ID must be greater than 0.");
        }

        var product = await _productRepository.GetByIdForUpdateAsync(id, tenantId);
        if (product == null)
        {
            return ApiResponse<ProductDto>.Fail("Product not found", $"Product with ID {id} was not found.");
        }

        product.Status = "Inactive";
        product.UpdatedAtUtc = DateTime.UtcNow;
        product.RowVersion = DateTime.UtcNow;

        var updated = await _productRepository.UpdateAsync(product);
        return ApiResponse<ProductDto>.Ok(MapToDto(updated), "Product deactivated successfully. Historical invoice references are preserved.");
    }

    /// <summary>
    /// Validates product availability and active status for new invoice line item selection. (IBMSBE-011)
    /// Prevents inactive or decommissioned products from being added to new invoices.
    /// </summary>
    public async Task<ApiResponse<ProductDto>> ValidateProductForInvoicingAsync(int id, int tenantId)
    {
        if (id <= 0)
        {
            return ApiResponse<ProductDto>.Fail("Invalid product identifier", "Product ID must be greater than 0.");
        }

        if (tenantId <= 0)
        {
            return ApiResponse<ProductDto>.Fail("Invalid tenant identifier", "A valid positive Tenant ID is required.");
        }

        var product = await _productRepository.GetByIdAsync(id, tenantId);
        if (product == null)
        {
            return ApiResponse<ProductDto>.Fail("Product not found", $"Product with ID {id} was not found for this tenant.");
        }

        if (!product.IsActive || !string.Equals(product.Status, "Active", StringComparison.OrdinalIgnoreCase))
        {
            return ApiResponse<ProductDto>.Fail(
                "Inactive product selection prohibited",
                $"Product '{product.Name}' ({product.ProductCode}) is inactive and cannot be selected for new invoices.");
        }

        return ApiResponse<ProductDto>.Ok(MapToDto(product), "Product is active and eligible for invoice line item selection.");
    }

    /// <summary>
    /// Retrieve product categories scoped to tenant. (IBMSBE-009, IBMSBE-013)
    /// </summary>
    public async Task<ApiResponse<List<ProductCategoryDto>>> GetCategoriesAsync(int? tenantId)
    {
        var categories = await _productRepository.GetCategoriesListAsync(tenantId);
        var dtos = new List<ProductCategoryDto>();

        foreach (var cat in categories)
        {
            var count = await _productRepository.CountProductsByCategoryIdAsync(cat.Id, cat.TenantId);
            dtos.Add(MapCategoryToDto(cat, count));
        }

        return ApiResponse<List<ProductCategoryDto>>.Ok(dtos, "Categories retrieved successfully.");
    }

    /// <summary>
    /// Create product category with tenant isolation and duplicate name prevention. (IBMSBE-010, IBMSBE-013)
    /// </summary>
    public async Task<ApiResponse<ProductCategoryDto>> CreateCategoryAsync(CreateCategoryRequest request, int tenantId)
    {
        if (tenantId <= 0)
        {
            return ApiResponse<ProductCategoryDto>.Fail("Invalid tenant identifier", "A valid positive Tenant ID is required.");
        }

        if (request == null || string.IsNullOrWhiteSpace(request.Name))
        {
            return ApiResponse<ProductCategoryDto>.Fail("Validation failed", "Category name is required.");
        }

        var name = request.Name.Trim();
        if (name.Length < 2 || name.Length > 128)
        {
            return ApiResponse<ProductCategoryDto>.Fail("Validation failed", "Category name must be between 2 and 128 characters.");
        }

        var existing = await _productRepository.GetCategoryByNameAsync(name, tenantId);
        if (existing != null)
        {
            return ApiResponse<ProductCategoryDto>.Fail("Category name conflict", $"A category named '{name}' already exists for this tenant.");
        }

        var category = new ProductCategory
        {
            TenantId = tenantId,
            Name = name,
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            Status = string.IsNullOrWhiteSpace(request.Status) ? "Active" : request.Status.Trim(),
            CreatedAtUtc = DateTime.UtcNow
        };

        var created = await _productRepository.AddCategoryAsync(category);
        return ApiResponse<ProductCategoryDto>.Ok(MapCategoryToDto(created), "Category created successfully.");
    }

    /// <summary>
    /// Safe activation or deactivation of product categories with tenant verification. (IBMSBE-013)
    /// </summary>
    public async Task<ApiResponse<ProductCategoryDto>> UpdateCategoryStatusAsync(int categoryId, bool isActive, int tenantId)
    {
        if (categoryId <= 0)
        {
            return ApiResponse<ProductCategoryDto>.Fail("Invalid category identifier", "Category ID must be greater than 0.");
        }

        if (tenantId <= 0)
        {
            return ApiResponse<ProductCategoryDto>.Fail("Invalid tenant identifier", "A valid positive Tenant ID is required.");
        }

        var category = await _productRepository.GetCategoryByIdAsync(categoryId, tenantId);
        if (category == null)
        {
            return ApiResponse<ProductCategoryDto>.Fail("Category not found", $"Category with ID {categoryId} was not found for this tenant.");
        }

        category.Status = isActive ? "Active" : "Inactive";
        var updated = await _productRepository.UpdateCategoryAsync(category);

        var productCount = await _productRepository.CountProductsByCategoryIdAsync(categoryId, tenantId);
        var actionText = isActive ? "activated" : "deactivated";
        return ApiResponse<ProductCategoryDto>.Ok(
            MapCategoryToDto(updated, productCount),
            $"Category '{category.Name}' {actionText} successfully. ({productCount} products currently in this category).");
    }

    private static ProductCategoryDto MapCategoryToDto(ProductCategory c, int productCount = 0)
    {
        return new ProductCategoryDto
        {
            Id = c.Id,
            TenantId = c.TenantId,
            Name = c.Name,
            Description = c.Description,
            Status = c.Status,
            IsActive = string.Equals(c.Status, "Active", StringComparison.OrdinalIgnoreCase),
            ProductCount = productCount,
            CreatedAtUtc = c.CreatedAtUtc
        };
    }

    private static List<string> ValidateCreateRequest(CreateProductRequest request)
    {
        var errors = new List<string>();

        if (request == null)
        {
            errors.Add("Request body cannot be null.");
            return errors;
        }

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            errors.Add("Product name is required.");
        }
        else if (request.Name.Trim().Length < 2 || request.Name.Trim().Length > 256)
        {
            errors.Add("Product name must be between 2 and 256 characters.");
        }

        if (request.Price < 0)
        {
            errors.Add("Price must be a non-negative number.");
        }

        if (!string.IsNullOrWhiteSpace(request.ProductCode))
        {
            var code = request.ProductCode.Trim();
            if (code.Length < 2 || code.Length > 64 || !ProductCodeRegex.IsMatch(code))
            {
                errors.Add("Product code must be 2 to 64 alphanumeric characters (hyphens and underscores allowed).");
            }
        }

        return errors;
    }

    private static List<string> ValidateUpdateRequest(UpdateProductRequest request)
    {
        var errors = new List<string>();

        if (request == null)
        {
            errors.Add("Request body cannot be null.");
            return errors;
        }

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            errors.Add("Product name is required.");
        }
        else if (request.Name.Trim().Length < 2 || request.Name.Trim().Length > 256)
        {
            errors.Add("Product name must be between 2 and 256 characters.");
        }

        if (request.Price < 0)
        {
            errors.Add("Price must be a non-negative number.");
        }

        if (!string.IsNullOrWhiteSpace(request.ProductCode))
        {
            var code = request.ProductCode.Trim();
            if (code.Length < 2 || code.Length > 64 || !ProductCodeRegex.IsMatch(code))
            {
                errors.Add("Product code must be 2 to 64 alphanumeric characters (hyphens and underscores allowed).");
            }
        }

        return errors;
    }

    private static ProductDto MapToDto(Product p)
    {
        return new ProductDto
        {
            Id = p.Id,
            TenantId = p.TenantId,
            ProductCode = p.ProductCode,
            Name = p.Name,
            Description = p.Description,
            Type = p.Type,
            CategoryId = p.CategoryId,
            CategoryName = p.Category?.Name,
            Unit = p.Unit,
            Price = p.Price,
            Currency = p.Currency,
            TaxCategory = p.TaxCategory,
            HsnSacCode = p.HsnSacCode,
            DiscountAllowed = p.DiscountAllowed,
            Status = p.Status,
            IsActive = p.IsActive,
            CreatedAtUtc = p.CreatedAtUtc,
            UpdatedAtUtc = p.UpdatedAtUtc,
            RowVersion = Convert.ToBase64String(BitConverter.GetBytes(p.RowVersion.Ticks))
        };
    }
}
