using System.Diagnostics;
using Billing.Application.Interfaces;
using Billing.Contracts.BackgroundJobs;
using Billing.Domain.Entities;
using Microsoft.Extensions.Logging;

namespace Billing.Application.Services;

public class OverdueInvoiceJobService : IOverdueInvoiceJobService
{
    private readonly IInvoiceRepository _invoiceRepository;
    private readonly ITenantRepository _tenantRepository;
    private readonly IAuditLogRepository _auditLogRepository;
    private readonly IOutboxService? _outboxService;
    private readonly INotificationService? _notificationService;
    private readonly ILogger<OverdueInvoiceJobService> _logger;

    public OverdueInvoiceJobService(
        IInvoiceRepository invoiceRepository,
        ITenantRepository tenantRepository,
        IAuditLogRepository auditLogRepository,
        ILogger<OverdueInvoiceJobService> logger,
        IOutboxService? outboxService = null,
        INotificationService? notificationService = null)
    {
        _invoiceRepository = invoiceRepository;
        _tenantRepository = tenantRepository;
        _auditLogRepository = auditLogRepository;
        _logger = logger;
        _outboxService = outboxService;
        _notificationService = notificationService;
    }

    public async Task<JobExecutionResultDto> ProcessOverdueInvoicesAsync(int? tenantId = null, CancellationToken cancellationToken = default)
    {
        var sw = Stopwatch.StartNew();
        int totalProcessed = 0;
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
                var overdueInvoices = invoices.Where(i =>
                    i.DueDate.HasValue &&
                    i.DueDate.Value.Date < today &&
                    !string.Equals(i.Status, "Draft", StringComparison.OrdinalIgnoreCase) &&
                    !string.Equals(i.Status, "Paid", StringComparison.OrdinalIgnoreCase) &&
                    !string.Equals(i.Status, "Cancelled", StringComparison.OrdinalIgnoreCase) &&
                    !string.Equals(i.Status, "Canceled", StringComparison.OrdinalIgnoreCase) &&
                    !string.Equals(i.Status, "Void", StringComparison.OrdinalIgnoreCase) &&
                    !string.Equals(i.Status, "Voided", StringComparison.OrdinalIgnoreCase) &&
                    !string.Equals(i.Status, "Overdue", StringComparison.OrdinalIgnoreCase) &&
                    i.GetEffectiveBalance() > 0
                ).ToList();

                foreach (var invoice in overdueInvoices)
                {
                    if (cancellationToken.IsCancellationRequested) break;

                    invoice.RecalculateBalanceAndStatus();
                    if (invoice.BalanceAmount <= 0) continue;

                    invoice.Status = "Overdue";
                    invoice.UpdatedAtUtc = DateTime.UtcNow;

                    await _invoiceRepository.UpdateAsync(invoice, cancellationToken);

                    await _auditLogRepository.AddAsync(new AuditLog
                    {
                        TenantId = tId,
                        Action = "Invoice Overdue Transition",
                        Changes = $"Invoice {invoice.InvoiceNumber} status automatically changed to Overdue. Due date: {invoice.DueDate:yyyy-MM-dd}.",
                        EntityName = "Invoice",
                        EntityId = invoice.Id.ToString(),
                        UserName = "SystemWorker",
                        Timestamp = DateTime.UtcNow
                    }, cancellationToken);

                    if (_outboxService != null)
                    {
                        try
                        {
                            await _outboxService.PublishEventAsync(tId, "invoice.overdue", new
                            {
                                invoiceId = invoice.Id,
                                invoiceNumber = invoice.InvoiceNumber,
                                customerId = invoice.CustomerId,
                                balanceAmount = invoice.BalanceAmount,
                                dueDate = invoice.DueDate,
                                status = "Overdue"
                            });
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, "Failed to publish outbox event invoice.overdue for invoice {InvoiceId}", invoice.Id);
                        }
                    }

                    if (_notificationService != null)
                    {
                        try
                        {
                            await _notificationService.SendInvoiceNotificationAsync(invoice.Id, tId, "InvoiceOverdue", "SystemWorker");
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, "Failed to send overdue notification for invoice {InvoiceId}", invoice.Id);
                        }
                    }

                    totalProcessed++;
                }
            }

            sw.Stop();
            return new JobExecutionResultDto
            {
                JobName = "OverdueInvoiceJob",
                Success = true,
                ProcessedCount = totalProcessed,
                Duration = sw.Elapsed,
                Message = $"Successfully transitioned {totalProcessed} invoices to Overdue status."
            };
        }
        catch (Exception ex)
        {
            sw.Stop();
            _logger.LogError(ex, "Error occurred during OverdueInvoiceJob execution.");
            return new JobExecutionResultDto
            {
                JobName = "OverdueInvoiceJob",
                Success = false,
                ProcessedCount = totalProcessed,
                Duration = sw.Elapsed,
                Message = $"Failed to execute OverdueInvoiceJob: {ex.Message}"
            };
        }
    }
}
