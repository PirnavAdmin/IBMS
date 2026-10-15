using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface IWebhookDispatcher
{
    Task<WebhookDelivery> DispatchDeliveryAsync(WebhookDelivery delivery, Webhook webhook);
}
