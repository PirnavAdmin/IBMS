namespace Billing.Application.Common;

public sealed class WebhookSecurityOptions
{
    public bool AllowLocalhostTargets { get; init; } = false;
}
