namespace Billing.Domain.Enums;

public enum WebhookDeliveryStatus
{
    Success,
    Failed,
    Retrying,
    DeadLetter
}
