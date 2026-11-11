using Billing.Contracts.Platform;
using Billing.Domain.Entities;

namespace Billing.Application.Common;

/// <summary>
/// Outcome of evaluating whether an authenticated session remains valid.
/// </summary>
public enum SessionValidationStatus
{
    Valid,
    NotFound,
    Revoked,
    Expired,
    InactivityExpired
}

/// <summary>
/// Result of session policy evaluation, including any sliding expiration update.
/// </summary>
public readonly record struct SessionEvaluationResult(
    SessionValidationStatus Status,
    string? FailureReason,
    DateTime? SlidingExpiryUtc,
    bool ShouldUpdateActivity);

/// <summary>
/// Centralizes inactivity and sliding session lifetime rules across authentication flows.
/// </summary>
public static class SessionPolicy
{
    public const int DefaultInactivityTimeoutMinutes = 60;
    public const int DefaultSessionTimeoutMinutes = 1440;

    /// <summary>
    /// Resolves the active inactivity timeout in minutes from platform settings or JWT configuration.
    /// </summary>
    public static int ResolveInactivityTimeoutMinutes(PlatformSettingsDto? settings, JwtSettings jwtSettings)
    {
        if (settings?.InactivityTimeoutMinutes > 0)
            return settings.InactivityTimeoutMinutes;

        return jwtSettings.InactivityTimeoutMinutes > 0
            ? jwtSettings.InactivityTimeoutMinutes
            : DefaultInactivityTimeoutMinutes;
    }

    /// <summary>
    /// Resolves the session lifetime in minutes from platform settings or JWT configuration.
    /// </summary>
    public static int ResolveSessionTimeoutMinutes(PlatformSettingsDto? settings, JwtSettings jwtSettings)
    {
        if (settings?.SessionTimeoutMinutes > 0)
            return settings.SessionTimeoutMinutes;

        return jwtSettings.SessionTimeoutMinutes > 0
            ? jwtSettings.SessionTimeoutMinutes
            : DefaultSessionTimeoutMinutes;
    }

    /// <summary>
    /// Computes an updated absolute session expiration that never undercuts the inactivity window.
    /// </summary>
    public static DateTime ComputeSessionExpiryUtc(PlatformSettingsDto? settings, JwtSettings jwtSettings, DateTime utcNow)
    {
        var inactivityMinutes = ResolveInactivityTimeoutMinutes(settings, jwtSettings);
        var sessionMinutes = ResolveSessionTimeoutMinutes(settings, jwtSettings);
        var effectiveMinutes = Math.Max(sessionMinutes, inactivityMinutes);
        return utcNow.AddMinutes(effectiveMinutes);
    }

    /// <summary>
    /// Evaluates whether the session is active and whether this request should extend activity and expiration.
    /// Background polling requests validate without extending LastActivityAtUtc so idle sessions still expire on time.
    /// </summary>
    public static SessionEvaluationResult EvaluateSession(
        UserSession? session,
        PlatformSettingsDto? settings,
        JwtSettings jwtSettings,
        DateTime utcNow,
        bool isBackgroundPoll = false)
    {
        if (session == null)
        {
            return new SessionEvaluationResult(SessionValidationStatus.NotFound, "Session not found.", null, false);
        }

        if (session.IsRevoked)
        {
            return new SessionEvaluationResult(SessionValidationStatus.Revoked, "Session has been revoked.", null, false);
        }

        var inactivityMinutes = ResolveInactivityTimeoutMinutes(settings, jwtSettings);
        if (inactivityMinutes > 0 && (utcNow - session.LastActivityAtUtc).TotalMinutes > inactivityMinutes)
        {
            return new SessionEvaluationResult(
                SessionValidationStatus.InactivityExpired,
                "Session has expired due to inactivity.",
                null,
                false);
        }

        if (session.SessionExpiresAtUtc <= utcNow)
        {
            return new SessionEvaluationResult(SessionValidationStatus.Expired, "Session has expired.", null, false);
        }

        if (isBackgroundPoll)
        {
            return new SessionEvaluationResult(SessionValidationStatus.Valid, null, null, false);
        }

        var candidateExpiry = ComputeSessionExpiryUtc(settings, jwtSettings, utcNow);
        var slidingExpiry = candidateExpiry > session.SessionExpiresAtUtc
            ? candidateExpiry
            : (DateTime?)null;

        return new SessionEvaluationResult(SessionValidationStatus.Valid, null, slidingExpiry, true);
    }
}
