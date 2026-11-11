using System.Diagnostics;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.BackgroundJobs;
using Billing.Contracts.Notification;
using Billing.Contracts.Payment;
using Billing.Domain.Entities;
using Billing.Domain.Enums;
using Microsoft.Extensions.Logging;

namespace Billing.Application.Services;

public sealed class PartialPaymentReminderOptions
{
    public TimeSpan Interval { get; set; } = ReminderJobService.DefaultPartialPaymentReminderInterval;

    public static PartialPaymentReminderOptions Create(double? days = null, double? hours = null, double? minutes = null)
    {
        if (days.HasValue && days.Value > 0) return new() { Interval = TimeSpan.FromDays(days.Value) };
        if (hours.HasValue && hours.Value > 0) return new() { Interval = TimeSpan.FromHours(hours.Value) };
        if (minutes.HasValue && minutes.Value > 0) return new() { Interval = TimeSpan.FromMinutes(minutes.Value) };
        return new();
    }
}

public class ReminderJobService : IReminderJobService
{
    // =========================================================================
    // REMINDER TIMER — Edit TimeSpan.FromHours(1) below to change how often
    // partial-payment customers receive remaining-balance reminders
    // (for example, change TimeSpan.FromHours(1) to TimeSpan.FromDays(7)).
    // Can also be overridden via Backend/appsettings.json -> PaymentReminders:PartialPaymentIntervalHours.
    // =========================================================================
    public static readonly TimeSpan DefaultPartialPaymentReminderInterval = TimeSpan.FromHours(1);

    private readonly IInvoiceRepository _invoiceRepository;
    private readonly ITenantRepository _tenantRepository;
    private readonly INotificationService _notificationService;
    private readonly INotificationLogRepository _notificationLogRepository;
    private readonly IInvoiceCommunicationRepository _communicationRepository;
    private readonly IPaymentRepository? _paymentRepository;
    private readonly PartialPaymentReminderOptions? _options;
    private readonly IReminderSettingRepository? _settingRepository;
    private readonly ILogger<ReminderJobService> _logger;

    public ReminderJobService(
        IInvoiceRepository invoiceRepository,
        ITenantRepository tenantRepository,
        INotificationService notificationService,
        INotificationLogRepository notificationLogRepository,
        IInvoiceCommunicationRepository communicationRepository,
        ILogger<ReminderJobService> logger,
        IPaymentRepository? paymentRepository = null,
        PartialPaymentReminderOptions? options = null,
        IReminderSettingRepository? settingRepository = null)
    {
        _invoiceRepository = invoiceRepository;
        _tenantRepository = tenantRepository;
        _notificationService = notificationService;
        _notificationLogRepository = notificationLogRepository;
        _communicationRepository = communicationRepository;
        _logger = logger;
        _paymentRepository = paymentRepository;
        _options = options;
        _settingRepository = settingRepository;
    }

    public async Task<JobExecutionResultDto> ProcessPaymentRemindersAsync(int? tenantId = null, CancellationToken cancellationToken = default)
    {
        var sw = Stopwatch.StartNew();
        int remindersSent = 0;
        var today = DateTime.UtcNow.Date;

        try
        {
            var tenantIds = new List<int>();
            if (tenantId.HasValue)
            {
                tenantIds.Add(tenantId.Value);
            }
            else
            {
                var tenants = await _tenantRepository.GetAllAsync();
                tenantIds = tenants.Select(t => t.Id).ToList();
                if (tenantIds.Count == 0)
                {
                    tenantIds.Add(1);
                }
            }

            foreach (var tId in tenantIds)
            {
                if (cancellationToken.IsCancellationRequested) break;

                ReminderSetting? tenantSettings = null;
                if (_settingRepository != null)
                {
                    tenantSettings = await _settingRepository.GetOrCreateAsync(tId, cancellationToken);
                }

                var upcomingEnabled = tenantSettings?.UpcomingDueReminderEnabled ?? true;
                var overdueEnabled = tenantSettings?.OverdueReminderEnabled ?? true;
                var overdueIntervalDays = tenantSettings != null
                    ? Math.Max(1, tenantSettings.OverdueReminderIntervalDays)
                    : 7;

                var invoices = await _invoiceRepository.GetAllAsync(tId);
                var activeInvoices = invoices.Where(i =>
                    i.DueDate.HasValue &&
                    i.GetEffectiveBalance() > 0 &&
                    !string.Equals(i.Status, "Paid", StringComparison.OrdinalIgnoreCase) &&
                    !string.Equals(i.Status, "Cancelled", StringComparison.OrdinalIgnoreCase) &&
                    !string.Equals(i.Status, "Canceled", StringComparison.OrdinalIgnoreCase) &&
                    !string.Equals(i.Status, "Void", StringComparison.OrdinalIgnoreCase) &&
                    !string.Equals(i.Status, "Voided", StringComparison.OrdinalIgnoreCase) &&
                    !string.Equals(i.Status, "Draft", StringComparison.OrdinalIgnoreCase)
                ).ToList();

                foreach (var invoice in activeInvoices)
                {
                    if (cancellationToken.IsCancellationRequested) break;

                    var dueDate = invoice.DueDate!.Value.Date;
                    var daysUntilDue = (int)(dueDate - today).TotalDays;

                    // Trigger conditions:
                    // 1. Overdue (daysUntilDue < 0)
                    // 2. Upcoming/Due today (daysUntilDue == 3 || 1 || 0)
                    bool isOverdue = daysUntilDue < 0;
                    bool isUpcomingOrDue = daysUntilDue == 3 || daysUntilDue == 1 || daysUntilDue == 0;

                    if (isOverdue && !overdueEnabled) continue;
                    if (isUpcomingOrDue && !upcomingEnabled) continue;
                    if (!isOverdue && !isUpcomingOrDue) continue;

                    string eventType = isOverdue ? "InvoiceOverdue" : "PaymentReminder";

                    // Overdue check: when interval = 1 day, check today; when N days, check rolling (N-1) prior days + today.
                    var logCheckStartDate = isOverdue
                        ? (tenantSettings != null ? today.AddDays(-(overdueIntervalDays - 1)) : today.AddDays(-7))
                        : today;

                    var existingLogs = await _notificationLogRepository.QueryLogsAsync(tId, new NotificationLogQueryParameters
                    {
                        EntityType = "Invoice",
                        EntityId = invoice.Id,
                        EventType = eventType,
                        Status = "Sent",
                        StartDate = logCheckStartDate,
                        EndDate = today.AddDays(1).AddTicks(-1),
                        PageSize = 1
                    });

                    if (existingLogs?.Items != null &&
                        existingLogs.Items.Any(l => string.Equals(l.Status, "Sent", StringComparison.OrdinalIgnoreCase)))
                    {
                        // Already sent recently; skip to prevent customer spam
                        continue;
                    }

                    try
                    {
                        var sendResult = await DispatchInvoiceReminderAsync(invoice, tId, eventType);

                        if (sendResult.Success)
                        {
                            await _communicationRepository.AddAsync(new InvoiceCommunication
                            {
                                TenantId = tId,
                                InvoiceId = invoice.Id,
                                CommunicationType = "Email",
                                Recipient = invoice.Customer?.Email ?? "customer@example.com",
                                Subject = $"Payment Reminder: Invoice {invoice.InvoiceNumber}",
                                Message = $"Automated payment reminder dispatched. Balance due: {invoice.BalanceAmount:F2}.",
                                Status = "Sent",
                                SentAtUtc = DateTime.UtcNow,
                                SentBy = "SystemReminderJob"
                            });

                            remindersSent++;
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to send payment reminder for invoice {InvoiceId}", invoice.Id);
                    }
                }

                remindersSent += await ProcessPartialPaymentRemindersAsync(tId, invoices, DateTime.UtcNow, tenantSettings, cancellationToken);
            }

            sw.Stop();
            return new JobExecutionResultDto
            {
                JobName = "ReminderJob",
                Success = true,
                ProcessedCount = remindersSent,
                Duration = sw.Elapsed,
                Message = $"Payment reminder job finished. Dispatched {remindersSent} reminders."
            };
        }
        catch (Exception ex)
        {
            sw.Stop();
            _logger.LogError(ex, "Error occurred during ReminderJob execution.");
            return new JobExecutionResultDto
            {
                JobName = "ReminderJob",
                Success = false,
                ProcessedCount = remindersSent,
                Duration = sw.Elapsed,
                Message = $"Failed to execute ReminderJob: {ex.Message}"
            };
        }
    }

    private TimeSpan GetPartialPaymentReminderInterval() =>
        _options?.Interval > TimeSpan.Zero ? _options.Interval : DefaultPartialPaymentReminderInterval;

    private static DateTime NormalizeUtc(DateTime dt) =>
        dt.Kind == DateTimeKind.Utc ? dt : DateTime.SpecifyKind(dt, DateTimeKind.Utc);

    private Task<ApiResponse<NotificationLogDto>> DispatchInvoiceReminderAsync(Invoice invoice, int tenantId, string eventType)
    {
        return invoice.IncludePayOnlineButton
            ? _notificationService.SendInvoiceNotificationAsync(invoice.Id, tenantId, eventType, "SystemReminderJob")
            : _notificationService.SendInvoiceNotificationAsync(invoice.Id, tenantId, eventType, "SystemReminderJob", null, null, false);
    }

    private async Task<int> ProcessPartialPaymentRemindersAsync(
        int tenantId,
        List<Invoice> invoices,
        DateTime nowUtc,
        ReminderSetting? tenantSettings,
        CancellationToken cancellationToken)
    {
        if (tenantSettings != null && !tenantSettings.PartialPaymentReminderEnabled)
        {
            return 0;
        }

        var sentCount = 0;
        var interval = tenantSettings != null
            ? tenantSettings.GetPartialPaymentInterval()
            : GetPartialPaymentReminderInterval();
        // Allow small polling drift so an hourly reminder does not slip to hour 2.
        var effectiveWait = interval > TimeSpan.FromMinutes(5)
            ? interval - TimeSpan.FromMinutes(2)
            : interval;

        var partialInvoices = invoices.Where(i =>
            i.AllowPartialPayments &&
            i.GetEffectiveBalance() > 0m &&
            !string.Equals(i.Status, "Paid", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(i.Status, "Cancelled", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(i.Status, "Canceled", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(i.Status, "Void", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(i.Status, "Voided", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(i.Status, "Draft", StringComparison.OrdinalIgnoreCase) &&
            (i.PaidAmount > 0m || !string.Equals(i.Status, "Issued", StringComparison.OrdinalIgnoreCase))
        ).ToList();

        foreach (var invoice in partialInvoices)
        {
            if (cancellationToken.IsCancellationRequested) break;

            DateTime? lastPaymentUtc = null;
            if (_paymentRepository != null)
            {
                try
                {
                    var paymentsPage = await _paymentRepository.GetPagedListAsync(tenantId, new PaymentListFilterRequest
                    {
                        InvoiceId = invoice.Id,
                        Status = "Completed",
                        SortBy = "createdatutc",
                        SortOrder = "desc",
                        PageNumber = 1,
                        PageSize = 1
                    });
                    var latestPayment = paymentsPage?.Items?.FirstOrDefault();
                    if (latestPayment != null)
                    {
                        lastPaymentUtc = NormalizeUtc(latestPayment.CreatedAtUtc);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Could not load last payment timestamp for partial invoice {InvoiceId}", invoice.Id);
                }
            }

            if (!lastPaymentUtc.HasValue && invoice.UpdatedAtUtc.HasValue)
            {
                lastPaymentUtc = NormalizeUtc(invoice.UpdatedAtUtc.Value);
            }

            var existingLogs = await _notificationLogRepository.QueryLogsAsync(tenantId, new NotificationLogQueryParameters
            {
                EntityType = "Invoice",
                EntityId = invoice.Id,
                EventType = "PartialPaymentReminder",
                Status = "Sent",
                PageNumber = 1,
                PageSize = 1
            });

            var latestSentLog = existingLogs?.Items?
                .Where(l => string.Equals(l.Status, "Sent", StringComparison.OrdinalIgnoreCase))
                .OrderByDescending(l => l.SentAtUtc)
                .FirstOrDefault();

            DateTime? anchorUtc = null;
            if (latestSentLog != null && lastPaymentUtc.HasValue)
            {
                var logUtc = NormalizeUtc(latestSentLog.SentAtUtc);
                anchorUtc = logUtc >= lastPaymentUtc.Value ? logUtc : lastPaymentUtc.Value;
            }
            else if (latestSentLog != null)
            {
                anchorUtc = NormalizeUtc(latestSentLog.SentAtUtc);
            }
            else if (lastPaymentUtc.HasValue)
            {
                anchorUtc = lastPaymentUtc.Value;
            }
            else
            {
                var sentLogs = await _notificationLogRepository.QueryLogsAsync(tenantId, new NotificationLogQueryParameters
                {
                    EntityType = "Invoice",
                    EntityId = invoice.Id,
                    EventType = "InvoiceSent",
                    Status = "Sent",
                    PageNumber = 1,
                    PageSize = 1
                });
                var latestInvoiceSentLog = sentLogs?.Items?
                    .Where(l => string.Equals(l.Status, "Sent", StringComparison.OrdinalIgnoreCase))
                    .OrderByDescending(l => l.SentAtUtc)
                    .FirstOrDefault();

                if (latestInvoiceSentLog != null)
                {
                    anchorUtc = NormalizeUtc(latestInvoiceSentLog.SentAtUtc);
                }
                else
                {
                    anchorUtc = NormalizeUtc(invoice.CreatedAtUtc);
                }
            }

            if (anchorUtc.HasValue && (nowUtc - anchorUtc.Value) < effectiveWait)
            {
                continue;
            }

            try
            {
                var sendResult = await DispatchInvoiceReminderAsync(invoice, tenantId, "PartialPaymentReminder");

                if (sendResult.Success)
                {
                    await _communicationRepository.AddAsync(new InvoiceCommunication
                    {
                        TenantId = tenantId,
                        InvoiceId = invoice.Id,
                        CommunicationType = "Email",
                        Recipient = invoice.Customer?.Email ?? "customer@example.com",
                        Subject = $"Payment Reminder: Remaining Balance for Invoice {invoice.InvoiceNumber}",
                        Message = $"Automated partial-payment reminder dispatched. Paid: {invoice.PaidAmount:F2}, Remaining Balance: {invoice.BalanceAmount:F2}.",
                        Status = "Sent",
                        SentAtUtc = DateTime.UtcNow,
                        SentBy = "SystemReminderJob"
                    });

                    sentCount++;
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to send partial payment reminder for invoice {InvoiceId}", invoice.Id);
            }
        }

        return sentCount;
    }
}
