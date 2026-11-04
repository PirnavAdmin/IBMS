using Billing.Application.Interfaces;
using Billing.Contracts.Administration;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers;

[Authorize(Roles = "TenantAdmin,SuperAdmin,Admin")]
[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
    private readonly IUserAdministrationService _userService;

    public UsersController(IUserAdministrationService userService)
    {
        _userService = userService;
    }

    // 1. GET ALL USERS (with pagination, search, status, role, and tenant filtering)
    [HttpGet]
    public async Task<IActionResult> GetUsers([FromQuery] UserQueryParameters query)
    {
        if (!User.IsInRole("SuperAdmin"))
        {
            var callerTenantId = GetCallerTenantId();
            if (!callerTenantId.HasValue) return Forbid();
            query.TenantId = callerTenantId.Value;
        }

        var (users, totalCount) = await _userService.GetUsersAsync(query);
        return Ok(new
        {
            success = true,
            totalCount,
            pageNumber = query.PageNumber,
            pageSize = query.PageSize,
            data = users
        });
    }

    // 2. GET USER BY ID
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetUserById(int id)
    {
        var user = await _userService.GetUserByIdAsync(id);
        if (user == null)
        {
            return NotFound(new { success = false, message = "User not found." });
        }

        if (!User.IsInRole("SuperAdmin"))
        {
            var callerTenantId = GetCallerTenantId();
            if (user.TenantId != callerTenantId)
            {
                return Forbid();
            }
        }

        return Ok(new { success = true, data = user });
    }

    // 3. CREATE USER (Platform or Host-owned identity)
    [HttpPost]
    public async Task<IActionResult> CreateUser([FromBody] CreateUserRequest request)
    {
        if (!User.IsInRole("SuperAdmin"))
        {
            var callerTenantId = GetCallerTenantId();
            if (!callerTenantId.HasValue) return Forbid();

            // TenantAdmin cannot create users in other tenants
            request.TenantId = callerTenantId.Value;

            // TenantAdmin cannot assign SuperAdmin role
            if (request.Roles != null && request.Roles.Any(r => r.Equals("SuperAdmin", StringComparison.OrdinalIgnoreCase)))
            {
                return BadRequest(new { success = false, message = "Tenant administrators cannot create or assign SuperAdmin accounts." });
            }
        }

        var (success, message, user) = await _userService.CreateUserAsync(request);
        if (!success)
        {
            return BadRequest(new { success = false, message });
        }

        return CreatedAtAction(nameof(GetUserById), new { id = user!.Id }, new { success = true, message, data = user });
    }

    // 4. UPDATE USER PROFILE
    [HttpPut("{id:int}")]
    public async Task<IActionResult> UpdateUser(int id, [FromBody] UpdateUserRequest request)
    {
        if (!User.IsInRole("SuperAdmin"))
        {
            var callerTenantId = GetCallerTenantId();
            var existing = await _userService.GetUserByIdAsync(id);
            if (existing == null)
            {
                return NotFound(new { success = false, message = "User not found." });
            }

            if (existing.TenantId != callerTenantId)
            {
                return Forbid();
            }

            request.TenantId = callerTenantId.Value;

            if (request.Roles != null && request.Roles.Any(r => r.Equals("SuperAdmin", StringComparison.OrdinalIgnoreCase)))
            {
                return BadRequest(new { success = false, message = "Tenant administrators cannot assign SuperAdmin role." });
            }
        }

        var (success, message, user) = await _userService.UpdateUserAsync(id, request);
        if (!success)
        {
            return BadRequest(new { success = false, message });
        }

        return Ok(new { success = true, message, data = user });
    }

    // 5. TOGGLE ACTIVE/INACTIVE STATUS
    [HttpPatch("{id:int}/status")]
    public async Task<IActionResult> UpdateStatus(int id, [FromBody] UpdateUserStatusRequest request)
    {
        if (!User.IsInRole("SuperAdmin"))
        {
            var callerTenantId = GetCallerTenantId();
            var existing = await _userService.GetUserByIdAsync(id);
            if (existing == null)
            {
                return NotFound(new { success = false, message = "User not found." });
            }

            if (existing.TenantId != callerTenantId)
            {
                return Forbid();
            }
        }

        var (success, message) = await _userService.UpdateUserStatusAsync(id, request.Status);
        if (!success)
        {
            return BadRequest(new { success = false, message });
        }

        return Ok(new { success = true, message });
    }

    // 6. ASSIGN ROLES TO USER (Automatically syncs permissions)
    [HttpPost("{id:int}/roles")]
    public async Task<IActionResult> AssignRoles(int id, [FromBody] AssignUserRolesRequest request)
    {
        if (!User.IsInRole("SuperAdmin"))
        {
            var callerTenantId = GetCallerTenantId();
            var existing = await _userService.GetUserByIdAsync(id);
            if (existing == null)
            {
                return NotFound(new { success = false, message = "User not found." });
            }

            if (existing.TenantId != callerTenantId)
            {
                return Forbid();
            }

            if (request.Roles != null && request.Roles.Any(r => r.Equals("SuperAdmin", StringComparison.OrdinalIgnoreCase)))
            {
                return BadRequest(new { success = false, message = "Tenant administrators cannot assign SuperAdmin role." });
            }
        }

        var (success, message, user) = await _userService.AssignUserRolesAsync(id, request.Roles);
        if (!success)
        {
            return BadRequest(new { success = false, message });
        }

        return Ok(new { success = true, message, data = user });
    }

    // 7. ASSIGN TENANT AND APPLICATION
    [HttpPut("{id:int}/assignment")]
    public async Task<IActionResult> AssignTenantAndApp(int id, [FromBody] AssignTenantAppRequest request)
    {
        if (!User.IsInRole("SuperAdmin"))
        {
            return Forbid();
        }

        var (success, message, user) = await _userService.AssignTenantAndAppAsync(id, request.TenantId, request.ApplicationId);
        if (!success)
        {
            return BadRequest(new { success = false, message });
        }

        return Ok(new { success = true, message, data = user });
    }

    // 8. MAP HOST-OWNED IDENTITY (External SSO / Host scopes)
    [HttpPost("host-identity")]
    public async Task<IActionResult> MapHostIdentity([FromBody] HostIdentityMappingRequest request)
    {
        if (!User.IsInRole("SuperAdmin"))
        {
            var callerTenantId = GetCallerTenantId();
            if (!callerTenantId.HasValue) return Forbid();
            request.TenantId = callerTenantId.Value;

            if (request.Roles != null && request.Roles.Any(r => r.Equals("SuperAdmin", StringComparison.OrdinalIgnoreCase)))
            {
                return BadRequest(new { success = false, message = "Tenant administrators cannot map SuperAdmin accounts." });
            }
        }

        var (success, message, user) = await _userService.MapHostIdentityAsync(request);
        if (!success)
        {
            return BadRequest(new { success = false, message });
        }

        return Ok(new { success = true, message, data = user });
    }

    // 9. DELETE USER
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> DeleteUser(int id)
    {
        if (!User.IsInRole("SuperAdmin"))
        {
            var callerTenantId = GetCallerTenantId();
            var existing = await _userService.GetUserByIdAsync(id);
            if (existing == null)
            {
                return NotFound(new { success = false, message = "User not found." });
            }

            if (existing.TenantId != callerTenantId)
            {
                return Forbid();
            }
        }

        var (success, message) = await _userService.DeleteUserAsync(id);
        if (!success)
        {
            return BadRequest(new { success = false, message });
        }

        return Ok(new { success = true, message });
    }

    private int? GetCallerTenantId()
    {
        var tenantClaim = User.FindFirst("TenantId")?.Value ?? User.FindFirst("tenant_id")?.Value;
        if (int.TryParse(tenantClaim, out var tenantId) && tenantId > 0)
        {
            return tenantId;
        }
        return null;
    }
}
