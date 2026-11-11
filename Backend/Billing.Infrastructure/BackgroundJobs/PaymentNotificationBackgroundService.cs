using System.Threading.Channels;
using Billing.Application.Interfaces;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Billing.Infrastructure.BackgroundJobs;

public sealed record PaymentNotificationWorkItem(
    int PaymentId,
    int TenantId,
    string EventType,
    string? UserName);

/// <summary>
/// Bounded background queue and hosted dispatcher for post-commit payment receipt emails and PDFs.
/// Runs each notification in an isolated DI scope so the HTTP request can complete immediately.
/// </summary>
public sealed class ChannelPaymentNotificationQueue : IPaymentNotificationQueue
{
    private readonly Channel<PaymentNotificationWorkItem> _channel = Channel.CreateBounded<PaymentNotificationWorkItem>(
        new BoundedChannelOptions(1024)
        {
            FullMode = BoundedChannelFullMode.Wait,
            SingleReader = true,
            SingleWriter = false
        });

    public ChannelReader<PaymentNotificationWorkItem> Reader => _channel.Reader;

    public ValueTask EnqueueAsync(
        int paymentId,
        int tenantId,
        string eventType,
        string? userName,
        CancellationToken cancellationToken = default)
    {
        return _channel.Writer.WriteAsync(
            new PaymentNotificationWorkItem(paymentId, tenantId, eventType, userName),
            cancellationToken);
    }
}

public sealed class PaymentNotificationBackgroundService : BackgroundService
{
    private readonly ChannelPaymentNotificationQueue _queue;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<PaymentNotificationBackgroundService> _logger;

    public PaymentNotificationBackgroundService(
        ChannelPaymentNotificationQueue queue,
        IServiceScopeFactory scopeFactory,
        ILogger<PaymentNotificationBackgroundService> logger)
    {
        _queue = queue;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await foreach (var item in _queue.Reader.ReadAllAsync(stoppingToken))
            {
                try
                {
                    using var scope = _scopeFactory.CreateScope();
                    var notificationService = scope.ServiceProvider.GetService<INotificationService>();
                    if (notificationService != null)
                    {
                        await notificationService.SendPaymentNotificationAsync(
                            item.PaymentId,
                            item.TenantId,
                            item.EventType,
                            item.UserName);
                    }
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (ObjectDisposedException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(
                        ex,
                        "Failed to dispatch background payment notification for Payment {PaymentId} (Tenant {TenantId})",
                        item.PaymentId,
                        item.TenantId);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Normal graceful shutdown
        }
    }
}
