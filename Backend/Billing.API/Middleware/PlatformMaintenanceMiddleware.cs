using System.Net;
using System.Text.Json;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace Billing.API.Middleware;

/// <summary>
/// Intercepts non-platform API requests during platform maintenance mode and blocks unauthorized access with HTTP 503.
/// SuperAdmin users and critical administration/authentication endpoints remain accessible.
/// </summary>
public class PlatformMaintenanceMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<PlatformMaintenanceMiddleware> _logger;

    public PlatformMaintenanceMiddleware(RequestDelegate next, ILogger<PlatformMaintenanceMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context, IPlatformAdministrationService platformService)
    {
        var path = context.Request.Path.Value ?? string.Empty;

        // Exempt routes: platform administration, auth login, swagger, root redirect, health checks
        if (path.StartsWith("/api/v1/platform", StringComparison.OrdinalIgnoreCase) ||
            path.StartsWith("/api/v1/auth/login", StringComparison.OrdinalIgnoreCase) ||
            path.StartsWith("/swagger", StringComparison.OrdinalIgnoreCase) ||
            path.Equals("/", StringComparison.OrdinalIgnoreCase) ||
            path.StartsWith("/health", StringComparison.OrdinalIgnoreCase))
        {
            await _next(context);
            return;
        }

        try
        {
            var settings = await platformService.GetPlatformSettingsAsync(context.RequestAborted);
            if (settings != null && settings.MaintenanceMode)
            {
                var isSuperAdmin = context.User?.IsInRole("SuperAdmin") == true;
                if (!isSuperAdmin)
                {
                    _logger.LogWarning("Request blocked by platform maintenance mode: {Path}", path);
                    context.Response.StatusCode = (int)HttpStatusCode.ServiceUnavailable;
                    context.Response.ContentType = "application/json";

                    var response = ApiResponse<object>.Fail(
                        "Platform is currently undergoing scheduled maintenance. Please try again later.",
                        errors: null,
                        errorCode: "MAINTENANCE_MODE");

                    var json = JsonSerializer.Serialize(response, new JsonSerializerOptions
                    {
                        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                        WriteIndented = false
                    });

                    await context.Response.WriteAsync(json);
                    return;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to evaluate platform maintenance mode setting for path {Path}", path);
        }

        await _next(context);
    }
}
