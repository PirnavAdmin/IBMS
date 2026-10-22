using Billing.Application.Interfaces;
using Billing.Contracts.Administration;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class RolesController : ControllerBase
{
    private readonly IRoleAdministrationService _roleService;

    public RolesController(IRoleAdministrationService roleService)
    {
        _roleService = roleService;
    }

    // 1. GET ALL ROLES
    [HttpGet]
    public async Task<IActionResult> GetRoles([FromQuery] int? tenantId = null)
    {
        var roles = await _roleService.GetRolesAsync(tenantId);
        return Ok(new { success = true, data = roles });
    }

    // 2. GET ROLE BY ID
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetRoleById(int id)
    {
        var role = await _roleService.GetRoleByIdAsync(id);
        if (role == null)
        {
            return NotFound(new { success = false, message = "Role not found." });
        }

        return Ok(new { success = true, data = role });
    }

    // 3. CREATE ROLE
    [HttpPost]
    public async Task<IActionResult> CreateRole([FromBody] CreateRoleRequest request)
    {
        var (success, message, role) = await _roleService.CreateRoleAsync(request);
        if (!success)
        {
            return BadRequest(new { success = false, message });
        }

        return CreatedAtAction(nameof(GetRoleById), new { id = role!.Id }, new { success = true, message, data = role });
    }

    // 4. UPDATE ROLE
    [HttpPut("{id:int}")]
    public async Task<IActionResult> UpdateRole(int id, [FromBody] UpdateRoleRequest request)
    {
        var (success, message, role) = await _roleService.UpdateRoleAsync(id, request);
        if (!success)
        {
            return BadRequest(new { success = false, message });
        }

        return Ok(new { success = true, message, data = role });
    }

    // 5. DELETE CUSTOM ROLE
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> DeleteRole(int id)
    {
        var (success, message) = await _roleService.DeleteRoleAsync(id);
        if (!success)
        {
            return BadRequest(new { success = false, message });
        }

        return Ok(new { success = true, message });
    }

    // 6. GET ALL AVAILABLE SYSTEM PERMISSIONS
    [HttpGet("permissions")]
    public async Task<IActionResult> GetPermissions()
    {
        var permissions = await _roleService.GetAllPermissionsAsync();
        return Ok(new { success = true, data = permissions });
    }

    // 7. ASSIGN PERMISSIONS TO ROLE
    [HttpPost("{id:int}/permissions")]
    public async Task<IActionResult> AssignPermissions(int id, [FromBody] AssignRolePermissionsRequest request)
    {
        var (success, message, role) = await _roleService.AssignPermissionsToRoleAsync(id, request.Permissions);
        if (!success)
        {
            return BadRequest(new { success = false, message });
        }

        return Ok(new { success = true, message, data = role });
    }
}
