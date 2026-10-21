using Billing.Application.Interfaces;

namespace Billing.Worker;

public class Worker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<Worker> _logger;

    private DateTime _lastOverdueCheckUtc = DateTime.MinValue;
    private DateTime _lastReminderCheckUtc = DateTime.MinValue;
    private DateTime _lastPdfGenerationCheckUtc = DateTime.MinValue;
    private DateTime _lastCleanupCheckUtc = DateTime.MinValue;

    public Worker(IServiceProvider serviceProvider, ILogger<Worker> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Billing.Worker service running at: {time}", DateTimeOffset.Now);

        while (!stoppingToken.IsCancellationRequested)
        {
            var now = DateTime.UtcNow;

            try
            {
                // 1. Webhook deliveries & Outbox
                await RunJobInIsolatedScopeAsync("WebhookDeliveryJob", stoppingToken);

                // 2. Report exports
                await RunJobInIsolatedScopeAsync("ExportJob", stoppingToken);

                // 3. Email notifications
                await RunJobInIsolatedScopeAsync("EmailNotificationJob", stoppingToken);

                // 4. PDF pre-generation (every 5 minutes)
                if (now - _lastPdfGenerationCheckUtc > TimeSpan.FromMinutes(5))
                {
                    _lastPdfGenerationCheckUtc = now;
                    await RunJobInIsolatedScopeAsync("PdfGenerationJob", stoppingToken);
                }

                // 5. Overdue invoice processing (every hour)
                if (now - _lastOverdueCheckUtc > TimeSpan.FromHours(1))
                {
                    _lastOverdueCheckUtc = now;
                    await RunJobInIsolatedScopeAsync("OverdueInvoiceJob", stoppingToken);
                }

                // 6. Payment reminders (every hour)
                if (now - _lastReminderCheckUtc > TimeSpan.FromHours(1))
                {
                    _lastReminderCheckUtc = now;
                    await RunJobInIsolatedScopeAsync("ReminderJob", stoppingToken);
                }

                // 7. Operational cleanup (every 6 hours)
                if (now - _lastCleanupCheckUtc > TimeSpan.FromHours(6))
                {
                    _lastCleanupCheckUtc = now;
                    await RunJobInIsolatedScopeAsync("OperationalCleanupJob", stoppingToken);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred during Billing.Worker execution cycle.");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        _logger.LogInformation("Billing.Worker service stopping.");
    }

    private async Task RunJobInIsolatedScopeAsync(string jobName, CancellationToken stoppingToken)
    {
        using var scope = _serviceProvider.CreateScope();
        var coordinator = scope.ServiceProvider.GetRequiredService<IBackgroundJobCoordinator>();
        await coordinator.RunJobByNameAsync(jobName, cancellationToken: stoppingToken);
    }
}
