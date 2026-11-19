using System.Threading;
using System.Threading.Tasks;
using Billing.API.Common;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Settings;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers;

[Authorize]
[ApiController]
[Route("api/v1/settings/email")]
[Consumes("application/json")]
[Produces("application/json")]
public class EmailSettingsController : ControllerBase
{
    private readonly ITenantEmailSettingService _emailSettingService;

    public EmailSettingsController(ITenantEmailSettingService emailSettingService)
    {
        _emailSettingService = emailSettingService;
    }

    /// <summary>
    /// Retrieves the authenticated tenant's SMTP email configuration.
    /// Secrets and passwords are encrypted at rest and strictly omitted from all responses.
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<TenantEmailSettingDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetEmailSetting(CancellationToken cancellationToken)
    {
        var tenantId = this.ResolveTenantId();
        if (!tenantId.HasValue || tenantId.Value <= 0) return Forbid();

        var result = await _emailSettingService.GetSettingAsync(tenantId.Value, cancellationToken);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Saves or updates the tenant's SMTP credentials and outgoing email identity.
    /// Accessible only to authorized tenant administrators.
    /// </summary>
    [HttpPut]
    [HttpPost]
    [Authorize(Roles = "TenantAdmin,SuperAdmin,Admin,BillingManager")]
    [ProducesResponseType(typeof(ApiResponse<TenantEmailSettingDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> SaveEmailSetting(
        [FromBody] SaveTenantEmailSettingRequest request,
        CancellationToken cancellationToken)
    {
        var tenantId = this.ResolveTenantId();
        if (!tenantId.HasValue || tenantId.Value <= 0) return Forbid();

        if (request == null)
            return BadRequest(ApiResponse<TenantEmailSettingDto>.Fail("Request body cannot be null."));

        if (!ModelState.IsValid)
            return BadRequest(ApiResponse<TenantEmailSettingDto>.Fail("Validation failed. Please review the supplied fields."));

        var result = await _emailSettingService.SaveSettingAsync(
            tenantId.Value,
            request,
            User?.Identity?.Name,
            cancellationToken);

        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Tests the SMTP connection by authenticating and dispatching a test email to the specified recipient.
    /// </summary>
    [HttpPost("test")]
    [Authorize(Roles = "TenantAdmin,SuperAdmin,Admin,BillingManager")]
    [ProducesResponseType(typeof(ApiResponse<TestEmailResultDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> TestEmailSetting(
        [FromBody] TestEmailSettingRequest request,
        CancellationToken cancellationToken)
    {
        var tenantId = this.ResolveTenantId();
        if (!tenantId.HasValue || tenantId.Value <= 0) return Forbid();

        if (request == null || string.IsNullOrWhiteSpace(request.RecipientEmail))
            return BadRequest(ApiResponse<TestEmailResultDto>.Fail("Recipient email is required for the test."));

        var result = await _emailSettingService.TestSmtpConnectionAsync(
            tenantId.Value,
            request,
            User?.Identity?.Name,
            cancellationToken);

        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Enables or disables outgoing email sending for the authenticated tenant.
    /// </summary>
    [HttpPatch("status")]
    [HttpPut("status")]
    [Authorize(Roles = "TenantAdmin,SuperAdmin,Admin,BillingManager")]
    [ProducesResponseType(typeof(ApiResponse<TenantEmailSettingDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> UpdateEmailSettingStatus(
        [FromBody] UpdateEmailSettingStatusRequest request,
        CancellationToken cancellationToken)
    {
        var tenantId = this.ResolveTenantId();
        if (!tenantId.HasValue || tenantId.Value <= 0) return Forbid();

        if (request == null)
            return BadRequest(ApiResponse<TenantEmailSettingDto>.Fail("Request body cannot be null."));

        var result = await _emailSettingService.SetStatusAsync(
            tenantId.Value,
            request.IsEnabled,
            User?.Identity?.Name,
            cancellationToken);

        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Returns the high-level configuration and verification status of the tenant's email configuration.
    /// </summary>
    [HttpGet("status")]
    [ProducesResponseType(typeof(ApiResponse<EmailSettingStatusDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetEmailSettingStatus(CancellationToken cancellationToken)
    {
        var tenantId = this.ResolveTenantId();
        if (!tenantId.HasValue || tenantId.Value <= 0) return Forbid();

        var result = await _emailSettingService.GetStatusAsync(tenantId.Value, cancellationToken);
        return result.Success ? Ok(result) : BadRequest(result);
    }
}
