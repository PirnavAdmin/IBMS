using System.ComponentModel.DataAnnotations;

namespace Billing.Contracts.InvoiceTemplate;

public enum TemplateStyle
{
    Standard = 1,
    Professional = 2,
    Compact = 3
}

public enum TemplateStatus
{
    Draft = 1,
    Active = 2,
    Inactive = 3,
    Archived = 4
}

#region Configuration Sub-DTOs

public class BrandingConfigDto
{
    public string? LogoUrl { get; set; }
    public string? LogoName { get; set; }
    public string LogoPosition { get; set; } = "left";
    public int LogoWidth { get; set; } = 96;
    public string PrimaryColor { get; set; } = "#70472f";
    public string SecondaryColor { get; set; } = "#e9dfd5";
    public string? Primary { get => PrimaryColor; set => PrimaryColor = value ?? "#70472f"; }
    public string? Secondary { get => SecondaryColor; set => SecondaryColor = value ?? "#e9dfd5"; }
    public string AccentColor { get; set; } = "#f1f5f9";
    public string FontFamily { get; set; } = "Segoe UI";
    public int LogoWidthMm { get; set; } = 40;
    public int LogoHeightMm { get; set; } = 20;
}

public class CompanyDetailsConfigDto
{
    public string CompanyName { get; set; } = string.Empty;
    public string? Company { get => CompanyName; set => CompanyName = value ?? string.Empty; }
    public string? LegalName { get; set; }
    public string? TaxId { get; set; }
    public string? RegistrationNumber { get; set; }
    public string? Registration { get => RegistrationNumber ?? TaxId; set => RegistrationNumber = value; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? Contact { get => Phone ?? Email; set => Phone = value; }
    public string? Website { get; set; }
    public string? AddressLine1 { get; set; }
    public string? Address { get => AddressLine1; set => AddressLine1 = value; }
    public string? AddressLine2 { get; set; }
    public string? City { get; set; }
    public string? State { get; set; }
    public string? PostalCode { get; set; }
    public string? Country { get; set; } = "India";
}

public class LayoutConfigDto
{
    /// <summary>
    /// Enables the Pirnav branded invoice layout. This is configuration stored with a
    /// template version, so the renderer can apply the layout without depending on a
    /// template name or invoice-specific data.
    /// </summary>
    public bool UsePirnavStandardLayout { get; set; }
    public bool ShowLogo { get; set; } = true;
    public bool ShowHeader { get; set; } = true;
    public bool ShowFooter { get; set; } = true;
    public bool ShowTaxBreakdown { get; set; } = true;
    public bool ShowPaymentInstructions { get; set; } = true;
    public bool ShowTermsAndConditions { get; set; } = true;
    public string CurrencyCode { get; set; } = "INR";
    public string CurrencySymbol { get; set; } = "₹";
    public int MarginTopMm { get; set; } = 12;
    public int MarginBottomMm { get; set; } = 12;
    public int MarginLeftMm { get; set; } = 14;
    public int MarginRightMm { get; set; } = 14;

    /// <summary>
    /// Section visibility toggles matching frontend Screen 2 checkboxes.
    /// </summary>
    public Dictionary<string, bool> Sections { get; set; } = new(StringComparer.OrdinalIgnoreCase)
    {
        ["invoiceNumber"] = true,
        ["invoiceDate"] = true,
        ["dueDate"] = true,
        ["customer"] = true,
        ["items"] = true,
        ["quantity"] = true,
        ["unitPrice"] = true,
        ["discount"] = true,
        ["tax"] = true,
        ["lineTotals"] = true,
        ["totals"] = true
    };
}

public class PaymentInstructionsConfigDto
{
    public string? BankName { get; set; }
    public string? AccountHolderName { get; set; }
    public string? AccountNumber { get; set; }
    public string? RoutingNumber { get; set; }
    public string? IfscCode { get; set; }
    public string? Iban { get; set; }
    public string? SwiftCode { get; set; }
    public string? UpiId { get; set; }
    public string? PaymentNotes { get; set; }
    public string? Payment { get => PaymentNotes; set => PaymentNotes = value; }
    public string? BankDetails { get; set; }
}

public class TermsConfigDto
{
    public string? HeaderText { get; set; }
    public string? Header { get => HeaderText; set => HeaderText = value; }
    public string? TermsAndConditions { get; set; }
    public string? Terms { get => TermsAndConditions; set => TermsAndConditions = value; }
    public string? CustomerNotes { get; set; }
    public string? FooterNote { get; set; }
    public string? Footer { get => FooterNote; set => FooterNote = value; }
}

#endregion

#region Template & Version DTOs

public class TemplateVersionDto
{
    public int Id { get; set; }
    public int TemplateId { get; set; }
    public bool IsCurrent { get; set; }
    public int VersionNumber { get; set; }
    public string Version => $"v{VersionNumber}";
    public TemplateStatus Status { get; set; }
    public string? VersionDescription { get; set; }
    public string? ChangeDescription => VersionDescription;
    public BrandingConfigDto Branding { get; set; } = new();
    public CompanyDetailsConfigDto CompanyDetails { get; set; } = new();
    public LayoutConfigDto Layout { get; set; } = new();
    public PaymentInstructionsConfigDto PaymentInstructions { get; set; } = new();
    public TermsConfigDto Terms { get; set; } = new();
    public DateTime CreatedAtUtc { get; set; }
    public DateTime CreatedDate => CreatedAtUtc;
    public string? CreatedBy { get; set; }
}

public class InvoiceTemplateDto
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public TemplateStyle Style { get; set; }
    public TemplateStatus Status { get; set; }
    public bool IsDefault { get; set; }
    public int CurrentVersionNumber { get; set; }
    public string Version => $"v{CurrentVersionNumber}";
    public int VersionNumber => CurrentVersionNumber;
    public int? ActiveVersionId { get; set; }
    public TemplateVersionDto? ActiveVersion { get; set; }
    public List<TemplateVersionDto> Versions { get; set; } = new();
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
    public DateTime LastModified => UpdatedAtUtc ?? CreatedAtUtc;
    public DateTime LastModifiedDate => LastModified;
    public string? CreatedBy { get; set; }
    public string? UpdatedBy { get; set; }
    public string? LastModifiedUser => UpdatedBy ?? CreatedBy ?? "Admin";
}

#endregion

#region Request DTOs

public class CreateTemplateRequest
{
    [Required]
    [StringLength(100, MinimumLength = 2)]
    public string Name { get; set; } = string.Empty;

    public string? Description { get; set; }

    public TemplateStyle Style { get; set; } = TemplateStyle.Standard;

    public bool SetAsDefault { get; set; }

    public BrandingConfigDto Branding { get; set; } = new();

    public CompanyDetailsConfigDto CompanyDetails { get; set; } = new();

    public LayoutConfigDto Layout { get; set; } = new();

    public PaymentInstructionsConfigDto PaymentInstructions { get; set; } = new();

    public TermsConfigDto Terms { get; set; } = new();

    // Direct section toggles from Screen 2
    public Dictionary<string, bool>? Sections { get => Layout.Sections; set { if (value != null) Layout.Sections = value; } }
}

public class UpdateTemplateRequest
{
    [Required]
    [StringLength(100, MinimumLength = 2)]
    public string Name { get; set; } = string.Empty;

    public string? Description { get; set; }

    public TemplateStyle Style { get; set; } = TemplateStyle.Standard;

    public string? ChangeDescription { get; set; }

    public bool ActivateImmediately { get; set; } = true;

    public BrandingConfigDto Branding { get; set; } = new();

    public CompanyDetailsConfigDto CompanyDetails { get; set; } = new();

    public LayoutConfigDto Layout { get; set; } = new();

    public PaymentInstructionsConfigDto PaymentInstructions { get; set; } = new();

    public TermsConfigDto Terms { get; set; } = new();

    public Dictionary<string, bool>? Sections { get => Layout.Sections; set { if (value != null) Layout.Sections = value; } }
}

public class DuplicateTemplateRequest
{
    [Required]
    [StringLength(100, MinimumLength = 2)]
    public string NewTemplateName { get; set; } = string.Empty;

    public string? NewDescription { get; set; }
}

public class TemplateFilterRequest
{
    public string? Search { get; set; }
    public string? Style { get; set; }
    public string? Status { get; set; }
    public int PageNumber { get; set; } = 1;
    public int PageSize { get; set; } = 10;
}

public class TemplatePreviewRequest
{
    public TemplateStyle Style { get; set; } = TemplateStyle.Standard;
    public BrandingConfigDto Branding { get; set; } = new();
    public CompanyDetailsConfigDto CompanyDetails { get; set; } = new();
    public LayoutConfigDto Layout { get; set; } = new();
    public PaymentInstructionsConfigDto PaymentInstructions { get; set; } = new();
    public TermsConfigDto Terms { get; set; } = new();
    public InvoiceSnapshotDto? CustomSampleData { get; set; }

    // Direct flat properties matching frontend config
    public string? Name { get; set; }
    public string? Description { get; set; }
    public string? Company { get => CompanyDetails.Company; set => CompanyDetails.Company = value; }
    public string? Address { get => CompanyDetails.Address; set => CompanyDetails.Address = value; }
    public string? Contact { get => CompanyDetails.Contact; set => CompanyDetails.Contact = value; }
    public string? Registration { get => CompanyDetails.Registration; set => CompanyDetails.Registration = value; }
    public string? Primary { get => Branding.Primary; set => Branding.Primary = value; }
    public string? Secondary { get => Branding.Secondary; set => Branding.Secondary = value; }
    public string? Header { get => Terms.Header; set => Terms.Header = value; }
    public string? Footer { get => Terms.Footer; set => Terms.Footer = value; }
    public string? Payment { get => PaymentInstructions.Payment; set => PaymentInstructions.Payment = value; }
    public string? BankDetails { get => PaymentInstructions.BankDetails; set => PaymentInstructions.BankDetails = value; }
    public string? TermsText { get => Terms.Terms; set => Terms.Terms = value; }
    public string? LogoUrl { get => Branding.LogoUrl; set => Branding.LogoUrl = value; }
    public string? LogoName { get => Branding.LogoName; set => Branding.LogoName = value; }
    public string? LogoPosition { get => Branding.LogoPosition; set => Branding.LogoPosition = value ?? "left"; }
    public int? LogoWidth { get => Branding.LogoWidth; set => Branding.LogoWidth = value ?? 96; }
    public Dictionary<string, bool>? Sections { get => Layout.Sections; set { if (value != null) Layout.Sections = value; } }
}

public class GenerateInvoicePdfRequest
{
    [Required]
    public int InvoiceId { get; set; }
    public int? OverrideTemplateId { get; set; }
    public bool ForceRegenerate { get; set; }
}

public class InvoicePdfResponse
{
    public int InvoiceId { get; set; }
    public string InvoiceNumber { get; set; } = string.Empty;
    public int DocumentId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string DownloadUrl { get; set; } = string.Empty;
    public long FileSizeBytes { get; set; }
    public DateTime GeneratedAtUtc { get; set; }
    public bool IsHistoricalReproduction { get; set; }
}

public class LogoUploadResponse
{
    public string LogoUrl { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public long FileSizeBytes { get; set; }
}

/// <summary>
/// Audit trail activity record for Screen 6 (Audit & Traceability).
/// </summary>
public class TemplateAuditLogDto
{
    public long Id { get; set; }
    public string Event { get; set; } = string.Empty;
    public DateTime DateAndTime { get; set; }
    public string PerformedBy { get; set; } = string.Empty;
    public string ChangesOrResult { get; set; } = string.Empty;
    public string TemplateVersionOrDocument { get; set; } = string.Empty;
}

#endregion

#region Snapshot DTOs for Immutable Storage

public class InvoiceSnapshotDto
{
    public int InvoiceId { get; set; }
    public string InvoiceNumber { get; set; } = string.Empty;
    public DateTime IssueDate { get; set; }
    public DateTime DueDate { get; set; }
    public string Status { get; set; } = "Issued";
    public string Currency { get; set; } = "INR";
    public string CurrencySymbol { get; set; } = "₹";

    public CustomerSnapshotDto Customer { get; set; } = new();
    public List<InvoiceItemSnapshotDto> Items { get; set; } = new();

    public decimal Subtotal { get; set; }
    public decimal TotalDiscount { get; set; }
    public decimal TotalTax { get; set; }
    public decimal TotalAdditionalCharges { get; set; }
    public decimal GrandTotal { get; set; }
    public decimal AmountPaid { get; set; }
    public decimal BalanceDue { get; set; }

    public List<TaxBreakdownSnapshotDto> TaxBreakdowns { get; set; } = new();
    public List<ChargeSnapshotDto> AdditionalCharges { get; set; } = new();
}

public class CustomerSnapshotDto
{
    public int CustomerId { get; set; }
    public string CustomerName { get; set; } = string.Empty;
    public string? CustomerCode { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? TaxId { get; set; }
    public string? BillingAddress { get; set; }
    public string? ShippingAddress { get; set; }
}

public class InvoiceItemSnapshotDto
{
    public int ItemId { get; set; }
    public string ItemName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? HsnSacCode { get; set; }
    public decimal Quantity { get; set; }
    public string Unit { get; set; } = "Unit";
    public decimal UnitPrice { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TaxRatePercent { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal LineTotal { get; set; }
}

public class TaxBreakdownSnapshotDto
{
    public string TaxName { get; set; } = string.Empty;
    public decimal RatePercent { get; set; }
    public decimal TaxableAmount { get; set; }
    public decimal TaxAmount { get; set; }
}

public class ChargeSnapshotDto
{
    public string ChargeName { get; set; } = string.Empty;
    public decimal Amount { get; set; }
}

#endregion
