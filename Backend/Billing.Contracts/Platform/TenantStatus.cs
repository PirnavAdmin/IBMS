namespace Billing.Contracts.Platform;

public enum TenantStatus
{
    Active,
    Suspended,
    Inactive
}

public static class TenantStatusValidator
{
    public const string Active = "Active";
    public const string Suspended = "Suspended";
    public const string Inactive = "Inactive";

    public static readonly IReadOnlyList<string> AllStatuses = new[]
    {
        Active,
        Suspended,
        Inactive
    };

    public static bool IsValidStatus(string? status)
    {
        if (string.IsNullOrWhiteSpace(status)) return false;
        return AllStatuses.Any(s => string.Equals(s, status.Trim(), StringComparison.OrdinalIgnoreCase));
    }

    public static string Normalize(string status)
    {
        if (string.Equals(status.Trim(), Active, StringComparison.OrdinalIgnoreCase)) return Active;
        if (string.Equals(status.Trim(), Suspended, StringComparison.OrdinalIgnoreCase)) return Suspended;
        if (string.Equals(status.Trim(), Inactive, StringComparison.OrdinalIgnoreCase)) return Inactive;
        throw new ArgumentException($"Invalid tenant status: '{status}'. Valid statuses are: {string.Join(", ", AllStatuses)}");
    }

    public static bool CanTransition(string currentStatus, string targetStatus, out string? errorMessage)
    {
        var current = Normalize(currentStatus);
        var target = Normalize(targetStatus);

        if (string.Equals(current, target, StringComparison.OrdinalIgnoreCase))
        {
            errorMessage = $"Tenant is already in '{current}' status.";
            return false;
        }

        // Permitted transitions:
        // Active -> Suspended, Inactive
        // Suspended -> Active (Reactivate), Inactive
        // Inactive -> Active (Reactivate), Suspended
        errorMessage = null;
        return true;
    }
}
