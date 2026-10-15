namespace Billing.Domain.Enums;

public enum OutboxMessageStatus
{
    Pending,
    Processing,
    Published,
    Failed
}
