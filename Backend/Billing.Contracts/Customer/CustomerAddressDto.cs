using System.Text.Json.Serialization;

namespace Billing.Contracts;

public class CustomerAddressDto
{
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public int? Id { get; set; }

    [JsonIgnore]
    public int CustomerId { get; set; }

    [JsonIgnore]
    public int TenantId { get; set; }

    public string AddressType { get; set; } = "Billing";
    public string AddressLine1 { get; set; } = string.Empty;
    public string? AddressLine2 { get; set; }
    public string City { get; set; } = string.Empty;
    public string? State { get; set; }
    public string? PostalCode { get; set; }
    public string Country { get; set; } = string.Empty;
    public bool IsDefault { get; set; }
    public string DefaultStatus => IsDefault ? "Default" : "Non-Default";
}

