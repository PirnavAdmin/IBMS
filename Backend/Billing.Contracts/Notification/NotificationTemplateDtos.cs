namespace Billing.Contracts.Notification;

public class NotificationTemplateDto
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public string EventType { get; set; } = string.Empty;
    public string Channel { get; set; } = "Email";
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string SubjectTemplate { get; set; } = string.Empty;
    public string BodyTemplate { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
    public string? CreatedBy { get; set; }
    public string? UpdatedBy { get; set; }
}

public class CreateNotificationTemplateRequest
{
    public string EventType { get; set; } = string.Empty;
    public string Channel { get; set; } = "Email";
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string SubjectTemplate { get; set; } = string.Empty;
    public string BodyTemplate { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
}

public class UpdateNotificationTemplateRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string SubjectTemplate { get; set; } = string.Empty;
    public string BodyTemplate { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
}

public class NotificationPreviewRequest
{
    public string EventType { get; set; } = string.Empty;
    public string SubjectTemplate { get; set; } = string.Empty;
    public string BodyTemplate { get; set; } = string.Empty;
    public Dictionary<string, string>? CustomVariables { get; set; }
}

public class NotificationPreviewResponse
{
    public string EventType { get; set; } = string.Empty;
    public string RenderedSubject { get; set; } = string.Empty;
    public string RenderedBody { get; set; } = string.Empty;
    public Dictionary<string, string> UsedVariables { get; set; } = new();
}

public class NotificationVariableDefinitionDto
{
    public string Name { get; set; } = string.Empty;
    public string Token { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string ExampleValue { get; set; } = string.Empty;
}
