namespace Billing.Domain.Entities;

public class DiscountSetting
{
    public int Id { get; set; }
    public int TenantId { get; set; } = 1;
    public Tenant? Tenant { get; set; }

    public string Status { get; set; } = "Active";
    public string MaximumType { get; set; } = "Percentage"; // Percentage, Fixed Amount
    public decimal MaximumValue { get; set; } = 50.00m;
    public string DiscountType { get; set; } = "Percentage"; // Fixed, Percentage
    public string ApplicationLevel { get; set; } = "Invoice Level"; // Line Level, Invoice Level

    public bool AllowLineLevel { get; set; } = true;
    public bool AllowInvoiceLevel { get; set; } = true;
    public bool EnforceMaximum { get; set; } = true;

    public bool AllowManualOverride { get; set; } = true;
    public bool RequireOverrideReason { get; set; } = true;
    public int MinimumReasonLength { get; set; } = 10;

    public string RolesJson { get; set; } = string.Empty;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAtUtc { get; set; }
    public DateTime RowVersion { get; set; } = DateTime.UtcNow;
}
