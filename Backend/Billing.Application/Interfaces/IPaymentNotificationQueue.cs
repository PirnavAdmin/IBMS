namespace Billing.Application.Interfaces;

/// <summary>
/// Queues post-commit payment receipt notifications (PDF generation and email delivery)
/// so interactive payment checkout and recording responses do not block on SMTP I/O.
/// </summary>
public interface IPaymentNotificationQueue
{
    ValueTask EnqueueAsync(
        int paymentId,
        int tenantId,
        string eventType,
        string? userName,
        CancellationToken cancellationToken = default);
}
