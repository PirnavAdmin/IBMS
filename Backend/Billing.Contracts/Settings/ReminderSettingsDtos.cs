using System.ComponentModel.DataAnnotations;

namespace Billing.Contracts.Settings;

public class ReminderSettingsDto
{
    public int TenantId { get; set; }
    public bool PartialPaymentReminderEnabled { get; set; } = true;
    public int PartialPaymentIntervalValue { get; set; } = 7;
    public string PartialPaymentIntervalUnit { get; set; } = "Days";
    public bool OverdueReminderEnabled { get; set; } = true;
    public int OverdueReminderIntervalDays { get; set; } = 1;
    public bool UpcomingDueReminderEnabled { get; set; } = true;
    public DateTime? UpdatedAtUtc { get; set; }
    public string? UpdatedBy { get; set; }
}

public class UpdateReminderSettingsRequest
{
    public bool PartialPaymentReminderEnabled { get; set; } = true;

    [Range(1, 365)]
    public int PartialPaymentIntervalValue { get; set; } = 7;

    [Required]
    public string PartialPaymentIntervalUnit { get; set; } = "Days";

    public bool OverdueReminderEnabled { get; set; } = true;

    [Range(1, 365)]
    public int OverdueReminderIntervalDays { get; set; } = 1;

    public bool UpcomingDueReminderEnabled { get; set; } = true;
}
