using System.Diagnostics;
using Billing.Application.Interfaces;
using Billing.Contracts.BackgroundJobs;
using Billing.Contracts.Notification;
using Billing.Domain.Entities;
using Microsoft.Extensions.Logging;

namespace Billing.Application.Services;

public class ReminderJobService : IReminderJobService
{
    private readonly IInvoiceRepository _invoiceRepository;
    private readonly ITenantRepository _tenantRepository;
    private readonly INotificationService _notificationService;
    private readonly INotificationLogRepository _notificationLogRepository;
    private readonly IInvoiceCommunicationRepository _communicationRepository;
    private readonly ILogger<ReminderJobService> _logger;

    public ReminderJobService(
        IInvoiceRepository invoiceRepository,
        ITenantRepository tenantRepository,
        INotificationService notificationService,
        INotificationLogRepository notificationLogRepository,
        IInvoiceCommunicationRepository communicationRepository,
        ILogger<ReminderJobService> logger)
    {
        _invoiceRepository = invoiceRepository;
        _tenantRepository = tenantRepository;
        _notificationService = notificationService;
        _notificationLogRepository = notificationLogRepository;
        _communicationRepository = communicationRepository;
        _logger = logger;
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

                var invoices = await _invoiceRepository.GetAllAsync(tId);
                var activeInvoices = invoices.Where(i =>
                    i.DueDate.HasValue &&
                    i.GetEffectiveBalance() > 0 &&
                    !string.Equals(i.Status, "Paid", StringComparison.OrdinalIgnoreCase) &&
                    !string.Equals(i.Status, "Cancelled", StringComparison.OrdinalIgnoreCase) &&
                    !string.Equals(i.Status, "Canceled", StringComparison.OrdinalIgnoreCase) &&
                    !string.Equals(i.Status, "Void", StringComparison.OrdinalIgnoreCase) &&
                    !string.Equals(i.Status, "Draft", StringComparison.OrdinalIgnoreCase)
                ).ToList();

                foreach (var invoice in activeInvoices)
                {
                    if (cancellationToken.IsCancellationRequested) break;

                    var dueDate = invoice.DueDate!.Value.Date;
                    var daysUntilDue = (int)(dueDate - today).TotalDays;

                    // Trigger conditions:
                    // 1. Due in 3 days (daysUntilDue == 3)
                    // 2. Due in 1 day (daysUntilDue == 1)
                    // 3. Due today (daysUntilDue == 0)
                    // 4. Overdue (daysUntilDue < 0)
                    bool isReminderCandidate = (daysUntilDue == 3 || daysUntilDue == 1 || daysUntilDue == 0 || daysUntilDue < 0);
                    if (!isReminderCandidate) continue;

                    string eventType = daysUntilDue < 0 ? "InvoiceOverdue" : "PaymentReminder";

                    // Check if a reminder was already sent recently (same day for upcoming, within 7 days for overdue)
                    var logCheckStartDate = daysUntilDue < 0 ? today.AddDays(-7) : today;
                    var existingLogs = await _notificationLogRepository.QueryLogsAsync(tId, new NotificationLogQueryParameters
                    {
                        EntityType = "Invoice",
                        EntityId = invoice.Id,
                        EventType = eventType,
                        StartDate = logCheckStartDate,
                        EndDate = today.AddDays(1).AddTicks(-1),
                        PageSize = 1
                    });

                    if (existingLogs.Items.Count > 0)
                    {
                        // Already sent recently; skip to prevent customer spam
                        continue;
                    }

                    try
                    {
                        var sendResult = await _notificationService.SendInvoiceNotificationAsync(
                            invoice.Id,
                            tId,
                            eventType,
                            "SystemReminderJob");

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
}
