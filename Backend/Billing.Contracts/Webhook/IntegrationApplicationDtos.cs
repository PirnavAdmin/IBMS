namespace Billing.Contracts.Webhook;

public class IntegrationApplicationDto
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string ClientId { get; set; } = string.Empty;
    public Dictionary<string, bool> FeatureFlags { get; set; } = new();
    public string Status { get; set; } = "Active";
    public int WebhooksCount { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
}

public class RegisterIntegrationApplicationRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Dictionary<string, bool>? FeatureFlags { get; set; }
}

public class RegisterIntegrationApplicationResponse
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string ClientId { get; set; } = string.Empty;
    public string ClientSecret { get; set; } = string.Empty;
    public Dictionary<string, bool> FeatureFlags { get; set; } = new();
    public string Status { get; set; } = "Active";
    public string Message { get; set; } = "Please copy and store the Client Secret safely. It will not be displayed again.";
}

public class UpdateIntegrationApplicationRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Dictionary<string, bool>? FeatureFlags { get; set; }
    public string Status { get; set; } = "Active";
}

public class UpdateFeatureFlagsRequest
{
    public Dictionary<string, bool> FeatureFlags { get; set; } = new();
}

public class IntegrationQueryParameters
{
    public string? Status { get; set; }
    public string? SearchTerm { get; set; }
    public int PageNumber { get; set; } = 1;
    public int PageSize { get; set; } = 20;
}
