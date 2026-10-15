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
                using var scope = _serviceProvider.CreateScope();
                var coordinator = scope.ServiceProvider.GetRequiredService<IBackgroundJobCoordinator>();

                // 1. Webhook deliveries & Outbox
                await coordinator.RunJobByNameAsync("WebhookDeliveryJob", cancellationToken: stoppingToken);

                // 2. Report exports
                await coordinator.RunJobByNameAsync("ExportJob", cancellationToken: stoppingToken);

                // 3. Email notifications
                await coordinator.RunJobByNameAsync("EmailNotificationJob", cancellationToken: stoppingToken);

                // 4. PDF pre-generation (every 5 minutes)
                if (now - _lastPdfGenerationCheckUtc > TimeSpan.FromMinutes(5))
                {
                    _lastPdfGenerationCheckUtc = now;
                    await coordinator.RunJobByNameAsync("PdfGenerationJob", cancellationToken: stoppingToken);
                }

                // 5. Overdue invoice processing (every hour)
                if (now - _lastOverdueCheckUtc > TimeSpan.FromHours(1))
                {
                    _lastOverdueCheckUtc = now;
                    await coordinator.RunJobByNameAsync("OverdueInvoiceJob", cancellationToken: stoppingToken);
                }

                // 6. Payment reminders (every hour)
                if (now - _lastReminderCheckUtc > TimeSpan.FromHours(1))
                {
                    _lastReminderCheckUtc = now;
                    await coordinator.RunJobByNameAsync("ReminderJob", cancellationToken: stoppingToken);
                }

                // 7. Operational cleanup (every 6 hours)
                if (now - _lastCleanupCheckUtc > TimeSpan.FromHours(6))
                {
                    _lastCleanupCheckUtc = now;
                    await coordinator.RunJobByNameAsync("OperationalCleanupJob", cancellationToken: stoppingToken);
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
}
