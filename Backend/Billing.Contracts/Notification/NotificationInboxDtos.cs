using System.ComponentModel.DataAnnotations;

namespace Billing.Contracts.Notification;

public class NotificationActionDto
{
    public string Module { get; set; } = string.Empty;
    public string EntityId { get; set; } = string.Empty;
}

public class NotificationInboxItemDto
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; }
    public bool IsRead { get; set; }
    public NotificationActionDto? Action { get; set; }
}

public class NotificationInboxPageDto
{
    public List<NotificationInboxItemDto> Items { get; set; } = new();
    public int TotalCount { get; set; }
    public int PageNumber { get; set; }
    public int PageSize { get; set; }
    public DateTime SnapshotAtUtc { get; set; }
}

public class NotificationUnreadCountDto
{
    public int UnreadCount { get; set; }
}

public class NotificationInboxQueryParameters
{
    public bool UnreadOnly { get; set; } = false;
    public int PageNumber { get; set; } = 1;
    public int PageSize { get; set; } = 20;
}

public class MarkAllNotificationsReadRequest
{
    [Required]
    public DateTime ThroughCreatedAtUtc { get; set; }
}

public class CreateInAppNotificationCommand
{
    public int TenantId { get; set; }
    public int RecipientUserId { get; set; }
    public string EventType { get; set; } = string.Empty;
    public string EventDeduplicationId { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? ActionModule { get; set; }
    public string? ActionEntityId { get; set; }
    public DateTime? ExpiresAtUtc { get; set; }
}
public class PublishTenantNotificationCommand
{
    public int TenantId { get; set; }
    public string EventType { get; set; } = string.Empty;
    public string EventDeduplicationId { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? ActionModule { get; set; }
    public string? ActionEntityId { get; set; }
    public DateTime? ExpiresAtUtc { get; set; }
    public List<string>? TargetRoles { get; set; }
}

