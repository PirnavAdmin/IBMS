using System.Security.Claims;
using Billing.Application.Interfaces;

namespace Billing.API.Services;

public class CurrentUserService : ICurrentUserService
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public CurrentUserService(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public string? UserId => _httpContextAccessor.HttpContext?.User?.FindFirstValue(ClaimTypes.NameIdentifier);

    public string? UserName => _httpContextAccessor.HttpContext?.User?.FindFirstValue(ClaimTypes.Name) ?? _httpContextAccessor.HttpContext?.User?.FindFirstValue("name");

    public int? TenantId
    {
        get
        {
            var tenantClaim = _httpContextAccessor.HttpContext?.User?.FindFirstValue("tenantId");
            if (int.TryParse(tenantClaim, out int tenantId))
            {
                return tenantId;
            }
            return null;
        }
    }
}
