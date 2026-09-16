namespace Billing.Contracts;

/// <summary>
/// Data transfer object representing a product category with associated metadata and product count.
/// </summary>
public class ProductCategoryDto
{
    /// <summary>Unique identifier of the category</summary>
    public int Id { get; set; }

    /// <summary>Tenant identifier to which this category belongs</summary>
    public int TenantId { get; set; }

    /// <summary>Display name of the category (e.g. Electronics, Consulting)</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Optional description of the category</summary>
    public string? Description { get; set; }

    /// <summary>Status of the category: Active or Inactive</summary>
    public string Status { get; set; } = "Active";

    /// <summary>Convenience boolean indicating whether category is Active</summary>
    public bool IsActive { get; set; } = true;

    /// <summary>Total number of products currently linked to this category</summary>
    public int ProductCount { get; set; }

    /// <summary>UTC timestamp when the category was created</summary>
    public DateTime CreatedAtUtc { get; set; }
}

/// <summary>
/// Request payload for creating a new product category.
/// </summary>
public class CreateCategoryRequest
{
    /// <summary>Category name (Required, 2-128 characters, unique per tenant)</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Optional description of category contents or scope</summary>
    public string? Description { get; set; }

    /// <summary>Initial category status: Active (default) or Inactive</summary>
    public string Status { get; set; } = "Active";
}

/// <summary>
/// Request payload for modifying an existing product category.
/// </summary>
public class UpdateCategoryRequest
{
    /// <summary>Updated category name (Required, 2-128 characters, unique per tenant)</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Updated category description</summary>
    public string? Description { get; set; }

    /// <summary>Category status: Active or Inactive</summary>
    public string Status { get; set; } = "Active";

    /// <summary>Optional boolean flag to toggle active status</summary>
    public bool? IsActive { get; set; }
}
