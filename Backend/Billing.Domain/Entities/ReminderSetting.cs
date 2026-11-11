namespace Billing.Domain.Entities;

public class ReminderSetting
{
    public int Id { get; set; }

    public int TenantId { get; set; } = 1;
    public Tenant? Tenant { get; set; }

    public bool PartialPaymentReminderEnabled { get; set; } = true;

    public int PartialPaymentIntervalValue { get; set; } = 7;

    public string PartialPaymentIntervalUnit { get; set; } = "Days";

    public bool OverdueReminderEnabled { get; set; } = true;

    public int OverdueReminderIntervalDays { get; set; } = 1;

    public bool UpcomingDueReminderEnabled { get; set; } = true;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAtUtc { get; set; }

    public string? UpdatedBy { get; set; }

    /// <summary>
    /// Converts the configured partial payment interval value and unit into a non-zero <see cref="TimeSpan"/>.
    /// </summary>
    public TimeSpan GetPartialPaymentInterval()
    {
        var value = Math.Max(1, PartialPaymentIntervalValue);
        return (PartialPaymentIntervalUnit ?? string.Empty).Trim().ToLowerInvariant() switch
        {
            "minutes" or "minute" => TimeSpan.FromMinutes(value),
            "hours" or "hour" => TimeSpan.FromHours(value),
            _ => TimeSpan.FromDays(value)
        };
    }
}
