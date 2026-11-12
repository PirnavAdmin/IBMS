using System.Text.Json;
using Billing.Domain.Entities;

namespace Billing.Application.Common;

/// <summary>
/// Shared helper to evaluate integration application active state and feature flags consistently
/// across webhook creation, delivery replay, and outbox dispatch.
/// </summary>
public static class IntegrationApplicationPolicy
{
    public static readonly string[] DefaultFlagKeys =
    [
        "allowWebhooks",
        "allowExcelSync",
        "allowAutoReplay",
        "syncInvoices"
    ];

    public static Dictionary<string, bool> ParseFlags(string? featureFlagsJson)
    {
        if (string.IsNullOrWhiteSpace(featureFlagsJson))
        {
            return new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
        }

        try
        {
            var raw = JsonSerializer.Deserialize<Dictionary<string, bool>>(featureFlagsJson);
            return raw == null
                ? new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase)
                : new Dictionary<string, bool>(raw, StringComparer.OrdinalIgnoreCase);
        }
        catch
        {
            return new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
        }
    }

    public static bool IsWebhookExecutionAllowed(IntegrationApplication? application, out string? blockReason)
    {
        blockReason = null;
        if (application == null)
        {
            return true;
        }

        if (!string.Equals(application.Status, "Active", StringComparison.OrdinalIgnoreCase))
        {
            blockReason = $"Linked integration application '{application.Name}' is {application.Status}.";
            return false;
        }

        var flags = ParseFlags(application.FeatureFlagsJson);
        if (flags.TryGetValue("allowWebhooks", out var allowWebhooks) && !allowWebhooks)
        {
            blockReason = $"Linked integration application '{application.Name}' has 'allowWebhooks' disabled.";
            return false;
        }

        return true;
    }

    public static bool IsExcelSyncAllowed(IntegrationApplication? application, out string? blockReason)
    {
        blockReason = null;
        if (application == null)
        {
            return true;
        }

        if (!string.Equals(application.Status, "Active", StringComparison.OrdinalIgnoreCase))
        {
            blockReason = $"Linked integration application '{application.Name}' is {application.Status}.";
            return false;
        }

        var flags = ParseFlags(application.FeatureFlagsJson);
        if (flags.TryGetValue("allowExcelSync", out var allowExcelSync) && !allowExcelSync)
        {
            blockReason = $"Linked integration application '{application.Name}' has 'allowExcelSync' disabled.";
            return false;
        }

        return true;
    }
}
