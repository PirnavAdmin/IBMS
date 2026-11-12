using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Common;

public static class ControllerTenantExtensions
{
    /// <summary>
    /// Resolves the effective TenantId following platform security policy:
    /// 1. SuperAdmin users can explicitly select target tenants via X-Tenant-Id header or ?tenantId query param.
    /// 2. If no header/query is provided, SuperAdmin defaults to their assigned tenant claim (dual-role support), or fallback 1.
    /// 3. Non-SuperAdmin users (TenantAdmin, BillingManager, Accountant, Customer) are strictly bound to their token's tenant claim.
    ///    Any client-supplied X-Tenant-Id header is completely ignored to prevent privilege escalation.
    /// </summary>
    public static int? ResolveTenantId(this ControllerBase controller)
        => ResolveTenantId(controller.User, controller.Request);

    public static int? ResolveTenantId(ClaimsPrincipal? user, HttpRequest? request)
    {
        if (user == null) return null;

        var isSuperAdmin = user.IsInRole("SuperAdmin");

        if (isSuperAdmin)
        {
            var headers = request?.Headers;
            if (headers != null && headers.TryGetValue("X-Tenant-Id", out var h) && int.TryParse(h, out var hId) && hId > 0)
            {
                return hId;
            }

            var query = request?.Query;
            if (query != null && query.TryGetValue("tenantId", out var q) && int.TryParse(q, out var qId) && qId > 0)
            {
                return qId;
            }
        }

        var tenantClaim = user.FindFirst("TenantId")?.Value
                          ?? user.FindFirst("tenant_id")?.Value
                          ?? user.FindFirst("tenantId")?.Value;

        if (int.TryParse(tenantClaim, out var tid) && tid > 0)
        {
            return tid;
        }

        if (isSuperAdmin)
        {
            return 1;
        }

        return null;
    }
}
