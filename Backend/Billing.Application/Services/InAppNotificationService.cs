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
    private readonly IUserRepository? _userRepository;

    public InAppNotificationService(
        IInAppNotificationRepository repository,
        ILogger<InAppNotificationService> logger,
        IUserRepository? userRepository = null)
    {
        _repository = repository;
        _logger = logger;
        _userRepository = userRepository;
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


    public async Task<ApiResponse<int>> PublishTenantNotificationAsync(
        PublishTenantNotificationCommand command,
        CancellationToken cancellationToken = default)
    {
        if (command.TenantId <= 0)
        {
            return ApiResponse<int>.Fail("Tenant ID must be greater than zero.", errorCode: "INVALID_TENANT");
        }

        if (string.IsNullOrWhiteSpace(command.Title))
        {
            return ApiResponse<int>.Fail("Notification title is required.", errorCode: "INVALID_TITLE");
        }

        if (_userRepository == null)
        {
            _logger.LogWarning("IUserRepository is not available to resolve tenant recipients.");
            return ApiResponse<int>.Fail("User repository is not configured for tenant recipient resolution.", errorCode: "SERVICE_UNAVAILABLE");
        }

        var activeUsers = await _userRepository.GetActiveUsersByTenantAsync(command.TenantId);
        if (activeUsers == null || activeUsers.Count == 0)
        {
            _logger.LogInformation("No active users found for Tenant {TenantId} to receive notification {EventType}", command.TenantId, command.EventType);
            return ApiResponse<int>.Ok(0, "No active recipients found for tenant.");
        }

        // Intended recipients: TenantAdmin, Admin, BillingManager, Accountant, or users with module/billing permissions
        var defaultAdminRoles = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "TenantAdmin", "Admin", "BillingManager", "Accountant"
        };

        var targetRoles = command.TargetRoles != null && command.TargetRoles.Count > 0
            ? new HashSet<string>(command.TargetRoles, StringComparer.OrdinalIgnoreCase)
            : defaultAdminRoles;

        var actionModule = command.ActionModule?.Trim().ToLowerInvariant();

        var eligibleUsers = activeUsers.Where(u =>
        {
            if (u.TenantId != command.TenantId) return false;

            // Administrative roles always eligible
            if (u.Roles != null && u.Roles.Any(r => targetRoles.Contains(r))) return true;

            // Broad billing or administrative permissions
            if (u.Permissions != null && u.Permissions.Any(p =>
                p.StartsWith("billing.", StringComparison.OrdinalIgnoreCase) ||
                p.StartsWith("admin.", StringComparison.OrdinalIgnoreCase)))
                return true;

            // Module-specific permissions (e.g. quotations, invoices, payments, creditnotes, exports, jobs)
            if (!string.IsNullOrWhiteSpace(actionModule) && u.Permissions != null)
            {
                var singular = actionModule.EndsWith("s") ? actionModule.Substring(0, actionModule.Length - 1) : actionModule;
                var singularAlt = actionModule.Replace("-", "");
                var singularAlt2 = singularAlt.EndsWith("s") ? singularAlt.Substring(0, singularAlt.Length - 1) : singularAlt;

                if (u.Permissions.Any(p =>
                    p.StartsWith(actionModule, StringComparison.OrdinalIgnoreCase) ||
                    p.StartsWith(singular, StringComparison.OrdinalIgnoreCase) ||
                    p.StartsWith(singularAlt, StringComparison.OrdinalIgnoreCase) ||
                    p.StartsWith(singularAlt2, StringComparison.OrdinalIgnoreCase)))
                {
                    return true;
                }
            }

            return false;
        }).ToList();

        // Fallback: If no users matched administrative/billing roles, notify all active tenant users
        if (eligibleUsers.Count == 0)
        {
            eligibleUsers = activeUsers.Where(u => u.TenantId == command.TenantId).ToList();
        }

        int createdCount = 0;
        foreach (var user in eligibleUsers)
        {
            var userDedupId = string.IsNullOrWhiteSpace(command.EventDeduplicationId)
                ? $"{command.EventType}_{Guid.NewGuid():N}"
                : $"{command.EventDeduplicationId}-u{user.Id}";

            var res = await CreateInAppNotificationAsync(new CreateInAppNotificationCommand
            {
                TenantId = command.TenantId,
                RecipientUserId = user.Id,
                EventType = command.EventType,
                EventDeduplicationId = userDedupId,
                Title = command.Title,
                Message = command.Message,
                ActionModule = command.ActionModule,
                ActionEntityId = command.ActionEntityId,
                ExpiresAtUtc = command.ExpiresAtUtc
            }, cancellationToken);

            if (res.Success) createdCount++;
        }

        return ApiResponse<int>.Ok(createdCount, $"Notification published to {createdCount} tenant recipients.");
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
