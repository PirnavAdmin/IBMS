using Billing.Application.Interfaces;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Billing.Infrastructure.BackgroundJobs;

public class BackgroundWorkerHostedService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<BackgroundWorkerHostedService> _logger;

    private DateTime _lastOverdueCheckUtc = DateTime.MinValue;
    private DateTime _lastReminderCheckUtc = DateTime.MinValue;
    private DateTime _lastPdfGenerationCheckUtc = DateTime.MinValue;
    private DateTime _lastCleanupCheckUtc = DateTime.MinValue;

    public BackgroundWorkerHostedService(
        IServiceProvider serviceProvider,
        ILogger<BackgroundWorkerHostedService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Billing Background Worker Service started.");

        while (!stoppingToken.IsCancellationRequested)
        {
            var now = DateTime.UtcNow;

            try
            {
                // 1. High-frequency: Webhook & Outbox processing (every cycle)
                await RunJobInIsolatedScopeAsync("WebhookDeliveryJob", stoppingToken);

                // 2. High-frequency: Export jobs (every cycle)
                await RunJobInIsolatedScopeAsync("ExportJob", stoppingToken);

                // 3. High-frequency: Email notification queue & retries (every cycle)
                await RunJobInIsolatedScopeAsync("EmailNotificationJob", stoppingToken);

                // 4. Medium-frequency: PDF pre-generation (every 5 minutes)
                if (now - _lastPdfGenerationCheckUtc > TimeSpan.FromMinutes(5))
                {
                    _lastPdfGenerationCheckUtc = now;
                    await RunJobInIsolatedScopeAsync("PdfGenerationJob", stoppingToken);
                }

                // 5. Hourly: Overdue invoice check
                if (now - _lastOverdueCheckUtc > TimeSpan.FromHours(1))
                {
                    _lastOverdueCheckUtc = now;
                    await RunJobInIsolatedScopeAsync("OverdueInvoiceJob", stoppingToken);
                }

                // 6. Hourly: Payment reminders
                if (now - _lastReminderCheckUtc > TimeSpan.FromHours(1))
                {
                    _lastReminderCheckUtc = now;
                    await RunJobInIsolatedScopeAsync("ReminderJob", stoppingToken);
                }

                // 7. Daily / 6-hourly: Operational cleanup
                if (now - _lastCleanupCheckUtc > TimeSpan.FromHours(6))
                {
                    _lastCleanupCheckUtc = now;
                    await RunJobInIsolatedScopeAsync("OperationalCleanupJob", stoppingToken);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred during Billing Background Worker loop execution.");
            }

            try
            {
                // Wait 5 seconds between fast polling loops
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        _logger.LogInformation("Billing Background Worker Service stopped.");
    }

    private async Task RunJobInIsolatedScopeAsync(string jobName, CancellationToken stoppingToken)
    {
        using var scope = _serviceProvider.CreateScope();
        var coordinator = scope.ServiceProvider.GetRequiredService<IBackgroundJobCoordinator>();
        await coordinator.RunJobByNameAsync(jobName, cancellationToken: stoppingToken);
    }
}
