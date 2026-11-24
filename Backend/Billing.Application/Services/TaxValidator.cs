using System.Text.RegularExpressions;
using Billing.Contracts.Tax;
using Billing.Domain.Entities;

namespace Billing.Application.Services;

public static class TaxValidator
{
    private static readonly HashSet<string> ValidTaxTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "GST", "CGST", "SGST", "IGST", "VAT", "Custom"
    };

    private static readonly HashSet<string> ValidApplicationLevels = new(StringComparer.OrdinalIgnoreCase)
    {
        "Item", "Invoice", "Both"
    };

    public static List<string> ValidateCreateRate(CreateTaxRateRequest request)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            errors.Add("Tax rate name is required.");
        }
        else if (request.Name.Trim().Length < 2)
        {
            errors.Add("Tax rate name must be at least 2 characters.");
        }
        else if (request.Name.Trim().Length > 128)
        {
            errors.Add("Tax rate name must not exceed 128 characters.");
        }
        else if (!Regex.IsMatch(request.Name.Trim(), @"^[\p{L}\p{M}0-9\s\-_()]+$"))
        {
            errors.Add("Tax rate name can only contain letters, numbers, spaces, hyphens, and parentheses.");
        }

        if (string.IsNullOrWhiteSpace(request.Code))
        {
            errors.Add("Tax rate code is required.");
        }
        else if (request.Code.Trim().Length < 2)
        {
            errors.Add("Tax rate code must be at least 2 characters.");
        }
        else if (request.Code.Trim().Length > 64)
        {
            errors.Add("Tax rate code must not exceed 64 characters.");
        }
        else if (!Regex.IsMatch(request.Code.Trim(), @"^[a-zA-Z0-9\-_]+$"))
        {
            errors.Add("Tax rate code can only contain letters, numbers, hyphens, and underscores.");
        }

        if (string.IsNullOrWhiteSpace(request.TaxType) || !ValidTaxTypes.Contains(request.TaxType.Trim()))
        {
            errors.Add($"Invalid TaxType. Supported values are: {string.Join(", ", ValidTaxTypes)}.");
        }

        if (request.Rate < 0.00m || request.Rate > 100.00m)
        {
            errors.Add("Tax rate must be between 0.00% and 100.00%.");
        }

        if (!string.IsNullOrWhiteSpace(request.ApplicationLevel) && !ValidApplicationLevels.Contains(request.ApplicationLevel.Trim()))
        {
            errors.Add($"Invalid ApplicationLevel. Supported values are: {string.Join(", ", ValidApplicationLevels)}.");
        }

        if (request.Priority < 1)
        {
            errors.Add("Priority must be greater than or equal to 1.");
        }

        if (request.EffectiveFrom.HasValue && request.EffectiveTo.HasValue && request.EffectiveTo.Value < request.EffectiveFrom.Value)
        {
            errors.Add("EffectiveTo date cannot be earlier than EffectiveFrom date.");
        }

        return errors;
    }

    public static List<string> ValidateUpdateRate(UpdateTaxRateRequest request)
    {
        var errors = new List<string>();

        if (request.Name != null)
        {
            if (string.IsNullOrWhiteSpace(request.Name))
                errors.Add("Tax rate name cannot be empty.");
            else if (request.Name.Trim().Length < 2)
                errors.Add("Tax rate name must be at least 2 characters.");
            else if (request.Name.Trim().Length > 128)
                errors.Add("Tax rate name must not exceed 128 characters.");
            else if (!Regex.IsMatch(request.Name.Trim(), @"^[\p{L}\p{M}0-9\s\-_()]+$"))
                errors.Add("Tax rate name can only contain letters, numbers, spaces, hyphens, and parentheses.");
        }

        if (request.Code != null)
        {
            if (string.IsNullOrWhiteSpace(request.Code))
                errors.Add("Tax rate code cannot be empty.");
            else if (request.Code.Trim().Length < 2)
                errors.Add("Tax rate code must be at least 2 characters.");
            else if (request.Code.Trim().Length > 64)
                errors.Add("Tax rate code must not exceed 64 characters.");
            else if (!Regex.IsMatch(request.Code.Trim(), @"^[a-zA-Z0-9\-_]+$"))
                errors.Add("Tax rate code can only contain letters, numbers, hyphens, and underscores.");
        }

        if (request.TaxType != null)
        {
            if (string.IsNullOrWhiteSpace(request.TaxType) || !ValidTaxTypes.Contains(request.TaxType.Trim()))
                errors.Add($"Invalid TaxType. Supported values are: {string.Join(", ", ValidTaxTypes)}.");
        }

        if (request.Rate.HasValue && (request.Rate.Value < 0.00m || request.Rate.Value > 100.00m))
        {
            errors.Add("Tax rate must be between 0.00% and 100.00%.");
        }

        if (request.ApplicationLevel != null && !ValidApplicationLevels.Contains(request.ApplicationLevel.Trim()))
        {
            errors.Add($"Invalid ApplicationLevel. Supported values are: {string.Join(", ", ValidApplicationLevels)}.");
        }

        if (request.Priority.HasValue && request.Priority.Value < 1)
        {
            errors.Add("Priority must be greater than or equal to 1.");
        }

        if (request.EffectiveFrom.HasValue && request.EffectiveTo.HasValue && request.EffectiveTo.Value < request.EffectiveFrom.Value)
        {
            errors.Add("EffectiveTo date cannot be earlier than EffectiveFrom date.");
        }

        return errors;
    }

    /// <summary>
    /// IBMSBE-005: Validates tax configuration conflicts, overlapping dates, and conflicting tax combinations.
    /// </summary>
    public static List<string> ValidateConflicts(IEnumerable<TaxRate> rates)
    {
        var errors = new List<string>();
        var rateList = rates.Where(r => r.IsActive).ToList();

        // Check for date overlap among active rates with the same Code
        for (int i = 0; i < rateList.Count; i++)
        {
            for (int j = i + 1; j < rateList.Count; j++)
            {
                var a = rateList[i];
                var b = rateList[j];

                if (string.Equals(a.Code, b.Code, StringComparison.OrdinalIgnoreCase))
                {
                    if (DatesOverlap(a.EffectiveFrom, a.EffectiveTo, b.EffectiveFrom, b.EffectiveTo))
                    {
                        errors.Add($"Conflicting overlapping effective dates for tax code '{a.Code}' between '{a.Name}' and '{b.Name}'.");
                    }
                }
            }
        }

        return errors;
    }

    /// <summary>
    /// Checks whether applied tax list contains mutually exclusive tax rules (e.g. IGST cannot be combined with CGST or SGST on the same item).
    /// </summary>
    public static List<string> ValidateAppliedTaxConflicts(IEnumerable<TaxRate> taxes)
    {
        var errors = new List<string>();
        var list = taxes.ToList();

        bool hasIgst = list.Any(t => string.Equals(t.TaxType, "IGST", StringComparison.OrdinalIgnoreCase));
        bool hasCgst = list.Any(t => string.Equals(t.TaxType, "CGST", StringComparison.OrdinalIgnoreCase));
        bool hasSgst = list.Any(t => string.Equals(t.TaxType, "SGST", StringComparison.OrdinalIgnoreCase));

        if (hasIgst && (hasCgst || hasSgst))
        {
            errors.Add("Conflict: IGST (Integrated Tax) cannot be applied simultaneously with CGST/SGST.");
        }

        return errors;
    }

    public static bool DatesOverlap(DateTime? startA, DateTime? endA, DateTime? startB, DateTime? endB)
    {
        DateTime effectiveStartA = startA ?? DateTime.MinValue;
        DateTime effectiveEndA = endA ?? DateTime.MaxValue;
        DateTime effectiveStartB = startB ?? DateTime.MinValue;
        DateTime effectiveEndB = endB ?? DateTime.MaxValue;

        return effectiveStartA <= effectiveEndB && effectiveEndA >= effectiveStartB;
    }

    public static bool IsTaxActiveOnDate(TaxRate rate, DateTime transactionDate)
    {
        if (!rate.IsActive) return false;

        if (rate.EffectiveFrom.HasValue && transactionDate < rate.EffectiveFrom.Value)
            return false;

        if (rate.EffectiveTo.HasValue && transactionDate > rate.EffectiveTo.Value)
            return false;

        return true;
    }
}
