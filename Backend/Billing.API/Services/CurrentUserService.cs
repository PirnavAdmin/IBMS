using System.Security.Claims;
using Billing.Application.Interfaces;
using Microsoft.AspNetCore.Http;

namespace Billing.API.Services;

public class CurrentUserService : ICurrentUserService
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public CurrentUserService(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public string? UserId => _httpContextAccessor.HttpContext?.User?.FindFirstValue(ClaimTypes.NameIdentifier)
                             ?? _httpContextAccessor.HttpContext?.User?.FindFirstValue("sub")
                             ?? _httpContextAccessor.HttpContext?.User?.FindFirstValue("userId");

    public string? UserName => _httpContextAccessor.HttpContext?.User?.FindFirstValue(ClaimTypes.Name)
                               ?? _httpContextAccessor.HttpContext?.User?.FindFirstValue("name")
                               ?? _httpContextAccessor.HttpContext?.User?.FindFirstValue(ClaimTypes.Email);

    public int? TenantId
    {
        get
        {
            var user = _httpContextAccessor.HttpContext?.User;
            if (user != null && user.IsInRole("SuperAdmin"))
            {
                var headers = _httpContextAccessor.HttpContext?.Request?.Headers;
                if (headers != null && headers.TryGetValue("X-Tenant-Id", out var h) && int.TryParse(h, out var hId) && hId > 0)
                {
                    return hId;
                }
            }

            var tenantClaim = user?.FindFirstValue("tenantId")
                              ?? user?.FindFirstValue("tenant_id")
                              ?? user?.FindFirstValue("TenantId");

            if (int.TryParse(tenantClaim, out int tenantId) && tenantId > 0)
            {
                return tenantId;
            }

            return null;
        }
    }

    public string? Role => _httpContextAccessor.HttpContext?.User?.FindFirstValue(ClaimTypes.Role)
                           ?? _httpContextAccessor.HttpContext?.User?.FindFirstValue("role");

    public string? CorrelationId
    {
        get
        {
            var ctx = _httpContextAccessor.HttpContext;
            if (ctx == null) return null;
            if (ctx.Request.Headers.TryGetValue("X-Correlation-Id", out var cid) && !string.IsNullOrWhiteSpace(cid))
                return cid.ToString().Trim();
            if (ctx.Request.Headers.TryGetValue("X-Request-Id", out var rid) && !string.IsNullOrWhiteSpace(rid))
                return rid.ToString().Trim();
            return ctx.TraceIdentifier;
        }
    }
}
