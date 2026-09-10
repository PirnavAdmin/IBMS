using System.Text.Json.Serialization;

namespace Billing.Contracts;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum CustomerStatus
{
    Active,
    Inactive,
    All
}

public class CustomerQueryParameters
{
    private const int MaxPageSize = 100;
    private int _pageSize = 10;
    private int _pageNumber = 1;

    public string? Search { get; set; }

    public string? CustomerType { get; set; }

    public string? TaxId { get; set; }

    public string? TaxRegistration { get; set; }

    public string? Outstanding { get; set; }

    public bool? IsActive { get; set; }

    public int PageNumber
    {
        get => _pageNumber;
        set => _pageNumber = value < 1 ? 1 : value;
    }

    public int PageSize
    {
        get => _pageSize;
        set => _pageSize = value < 1 ? 10 : (value > MaxPageSize ? MaxPageSize : value);
    }

    public string? SortBy { get; set; } = "createdAt";

    public string? SortOrder { get; set; } = "desc";
}
