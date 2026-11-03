using System.Text.RegularExpressions;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Notification;
using Billing.Domain.Entities;
using Microsoft.Extensions.Logging;

namespace Billing.Application.Services;

public class InAppNotificationService : IInAppNotificationService
{
    private static readonly Regex HtmlTagRegex = new("<.*?>", RegexOptions.Compiled);
    private readonly IInAppNotificationRepository _repository;
    private readonly ILogger<InAppNotificationService> _logger;

    public InAppNotificationService(
        IInAppNotificationRepository repository,
        ILogger<InAppNotificationService> logger)
    {
        _repository = repository;
        _logger = logger;
    }

    public async Task<ApiResponse<NotificationInboxPageDto>> GetInboxAsync(
        int tenantId,
        int recipientUserId,
        NotificationInboxQueryParameters parameters,
        CancellationToken cancellationToken = default)
    {
        if (tenantId <= 0 || recipientUserId <= 0)
        {
            return ApiResponse<NotificationInboxPageDto>.Fail(
                "Invalid user or tenant context.",
                errorCode: "INVALID_CONTEXT");
        }

        if (parameters.PageNumber < 1)
        {
            return ApiResponse<NotificationInboxPageDto>.Fail(
                "Page number must be greater than or equal to 1.",
                errorCode: "INVALID_PAGINATION");
        }

        if (parameters.PageSize < 1)
        {
            parameters.PageSize = 20;
        }
        else if (parameters.PageSize > 50)
        {
            parameters.PageSize = 50;
        }

        var snapshotAtUtc = DateTime.UtcNow;

        var page = await _repository.GetInboxPageAsync(
            tenantId,
            recipientUserId,
            parameters,
            snapshotAtUtc,
            cancellationToken);

        return ApiResponse<NotificationInboxPageDto>.Ok(page);
    }

    public async Task<ApiResponse<NotificationUnreadCountDto>> GetUnreadCountAsync(
        int tenantId,
        int recipientUserId,
        CancellationToken cancellationToken = default)
    {
        if (tenantId <= 0 || recipientUserId <= 0)
        {
            return ApiResponse<NotificationUnreadCountDto>.Fail(
                "Invalid user or tenant context.",
                errorCode: "INVALID_CONTEXT");
        }

        var count = await _repository.GetUnreadCountAsync(tenantId, recipientUserId, cancellationToken);
        return ApiResponse<NotificationUnreadCountDto>.Ok(new NotificationUnreadCountDto { UnreadCount = count });
    }

    public async Task<ApiResponse<bool>> MarkAsReadAsync(
        int tenantId,
        int recipientUserId,
        long notificationId,
        CancellationToken cancellationToken = default)
    {
        if (tenantId <= 0 || recipientUserId <= 0 || notificationId <= 0)
        {
            return ApiResponse<bool>.Fail("Notification not found.", errorCode: "NOT_FOUND");
        }

        var updated = await _repository.MarkAsReadAsync(
            tenantId,
            recipientUserId,
            notificationId,
            DateTime.UtcNow,
            cancellationToken);

        if (!updated)
        {
            return ApiResponse<bool>.Fail("Notification not found.", errorCode: "NOT_FOUND");
        }

        return ApiResponse<bool>.Ok(true, "Notification marked as read.");
    }

    public async Task<ApiResponse<bool>> MarkAllAsReadAsync(
        int tenantId,
        int recipientUserId,
        DateTime throughCreatedAtUtc,
        CancellationToken cancellationToken = default)
    {
        if (tenantId <= 0 || recipientUserId <= 0)
        {
            return ApiResponse<bool>.Fail("Invalid user or tenant context.", errorCode: "INVALID_CONTEXT");
        }

        if (throughCreatedAtUtc == default)
        {
            return ApiResponse<bool>.Fail("Cutoff timestamp 'throughCreatedAtUtc' is required.", errorCode: "INVALID_CUTOFF");
        }

        var maxAllowedFuture = DateTime.UtcNow.AddMinutes(1);
        if (throughCreatedAtUtc > maxAllowedFuture)
        {
            return ApiResponse<bool>.Fail("Cutoff timestamp cannot be in the future.", errorCode: "INVALID_CUTOFF");
        }

        var updated = await _repository.MarkAllAsReadAsync(
            tenantId,
            recipientUserId,
            throughCreatedAtUtc,
            DateTime.UtcNow,
            cancellationToken);

        return ApiResponse<bool>.Ok(updated, "Notifications marked as read.");
    }

    public async Task<ApiResponse<bool>> CreateInAppNotificationAsync(
        CreateInAppNotificationCommand command,
        CancellationToken cancellationToken = default)
    {
        if (command.TenantId <= 0 || command.RecipientUserId <= 0)
        {
            return ApiResponse<bool>.Fail("Invalid tenant or recipient user ID.", errorCode: "INVALID_TARGET");
        }

        if (string.IsNullOrWhiteSpace(command.Title))
        {
            return ApiResponse<bool>.Fail("Notification title is required.", errorCode: "INVALID_TITLE");
        }

        var plainTitle = StripHtmlAndTrim(command.Title, 200);
        var plainMessage = StripHtmlAndTrim(command.Message ?? string.Empty, 2000);

        var deduplicationId = string.IsNullOrWhiteSpace(command.EventDeduplicationId)
            ? $"{command.EventType}_{Guid.NewGuid():N}"
            : command.EventDeduplicationId.Trim();

        var notification = new InAppNotification
        {
            TenantId = command.TenantId,
            RecipientUserId = command.RecipientUserId,
            EventType = command.EventType?.Trim() ?? "General",
            EventDeduplicationId = deduplicationId,
            Title = plainTitle,
            Message = plainMessage,
            ActionModule = command.ActionModule?.Trim(),
            ActionEntityId = command.ActionEntityId?.Trim(),
            IsRead = false,
            CreatedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = command.ExpiresAtUtc ?? DateTime.UtcNow.AddDays(90)
        };

        var created = await _repository.CreateNotificationAsync(notification, cancellationToken);
        if (created == null)
        {
            _logger.LogInformation(
                "Duplicate in-app notification skipped for Tenant {TenantId}, User {UserId}, DedupId {DedupId}",
                command.TenantId, command.RecipientUserId, deduplicationId);
            return ApiResponse<bool>.Ok(true, "Notification already exists.");
        }

        return ApiResponse<bool>.Ok(true, "Notification created successfully.");
    }

    private static string StripHtmlAndTrim(string input, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(input)) return string.Empty;
        var stripped = HtmlTagRegex.Replace(input, string.Empty).Trim();
        return stripped.Length <= maxLength ? stripped : stripped[..maxLength];
    }
}
