namespace Billing.Domain.Enums;

/// <summary>
/// Lifecycle status of an invoice template or template version.
/// </summary>
public enum TemplateStatus
{
    Draft = 1,
    Active = 2,
    Inactive = 3,
    Archived = 4
}
