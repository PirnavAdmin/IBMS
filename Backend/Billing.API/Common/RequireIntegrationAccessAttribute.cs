using Billing.Contracts;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Billing.API.Common;

/// <summary>
/// Enforces tenant-scoped integration management access on Integrations/Webhooks endpoints.
/// Allows SuperAdmin, TenantAdmin, Admin, or users holding the explicit "integrations.manage" permission claim,
/// and rejects requests lacking a valid tenant context.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class RequireIntegrationAccessAttribute : Attribute, IAuthorizationFilter
{
    public void OnAuthorization(AuthorizationFilterContext context)
    {
        var user = context.HttpContext.User;
        if (user?.Identity?.IsAuthenticated != true)
        {
            return;
        }

        if (!HasIntegrationPermission(user))
        {
            context.Result = new ObjectResult(ApiResponse<object>.Fail(
                "You do not have permission to manage integrations or webhooks."))
            {
                StatusCode = StatusCodes.Status403Forbidden
            };
            return;
        }

        if (ControllerTenantExtensions.ResolveTenantId(user, context.HttpContext.Request) == null)
        {
            context.Result = new UnauthorizedObjectResult(ApiResponse<object>.Fail(
                "Authenticated user does not belong to an active tenant."));
        }
    }

    private static bool HasIntegrationPermission(System.Security.Claims.ClaimsPrincipal user)
    {
        if (user.IsInRole("SuperAdmin") || user.IsInRole("TenantAdmin") || user.IsInRole("Admin"))
        {
            return true;
        }

        if (user.IsInRole("Customer") || user.IsInRole("Viewer"))
        {
            return false;
        }

        var permissions = user.FindAll("permissions")
            .Concat(user.FindAll("permission"))
            .SelectMany(c => (c.Value ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));

        return permissions.Any(p =>
            string.Equals(p, "integrations.manage", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(p, "all", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(p, "*", StringComparison.OrdinalIgnoreCase));
    }
}
