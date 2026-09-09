using Billing.Infrastructure.Services;
using Billing.Application;
using Billing.Contracts;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly AuthService _authService;
    private readonly EmailService _emailService;

    public AuthController(
        AuthService authService,
        EmailService emailService)
    {
        _authService = authService;
        _emailService = emailService;
    }

    // LOGIN
    [HttpPost("login")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
        var userAgent = Request.Headers.UserAgent.ToString();

        var response = await _authService.Login(request, ipAddress, userAgent);

        if (!response.Success)
        {
            return Unauthorized(response);
        }

        return Ok(response);
    }

    // REFRESH TOKEN (Rotation & Reuse Detection)
    [HttpPost("refresh-token")]
    public async Task<IActionResult> RefreshToken([FromBody] RefreshTokenRequest request)
    {
        var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
        var userAgent = Request.Headers.UserAgent.ToString();

        var response = await _authService.RefreshTokenAsync(request.RefreshToken, ipAddress, userAgent);

        if (!response.Success)
        {
            return Unauthorized(response);
        }

        return Ok(response);
    }

    // LOGOUT (Current Session)
    [HttpPost("logout")]
    public async Task<IActionResult> Logout(
        [FromBody(EmptyBodyBehavior = Microsoft.AspNetCore.Mvc.ModelBinding.EmptyBodyBehavior.Allow)] LogoutRequest? request = null)
    {
        Guid? sessionId = null;
        var sidClaim = User.FindFirst("sessionId") ??
                       User.FindFirst(System.Security.Claims.ClaimTypes.Sid) ??
                       User.FindFirst("sid");

        if (sidClaim != null && Guid.TryParse(sidClaim.Value, out var guid))
        {
            sessionId = guid;
        }

        var refreshToken = string.Equals(request?.RefreshToken?.Trim(), "string", StringComparison.OrdinalIgnoreCase)
            ? null
            : request?.RefreshToken;

        var response = await _authService.LogoutAsync(refreshToken, sessionId);
        if (!response.Success && sessionId == null && string.IsNullOrWhiteSpace(refreshToken))
        {
            return BadRequest(new { success = false, message = "Please provide an active Bearer token or a valid RefreshToken to logout." });
        }

        return Ok(response);
    }

    // LOGOUT ALL (All active devices/sessions)
    [Microsoft.AspNetCore.Authorization.Authorize]
    [HttpPost("logout-all")]
    public async Task<IActionResult> LogoutAll()
    {
        var userIdClaim = User.FindFirst("UserId") ??
                          User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier) ??
                          User.FindFirst("sub");

        if (userIdClaim == null || !int.TryParse(userIdClaim.Value, out var userId))
        {
            return Unauthorized(new { message = "User identifier claim not found in token" });
        }

        var response = await _authService.LogoutAllAsync(userId);
        return Ok(response);
    }

    // GET CURRENT USER PROFILE & CLAIMS
    [Microsoft.AspNetCore.Authorization.Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> GetProfile()
    {
        var userIdClaim = User.FindFirst("UserId") ??
                          User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier) ??
                          User.FindFirst("sub");

        if (userIdClaim == null || !int.TryParse(userIdClaim.Value, out var userId))
        {
            return Unauthorized(new { message = "User identifier claim not found in token" });
        }

        Guid? sessionId = null;
        var sidClaim = User.FindFirst("sessionId") ??
                       User.FindFirst(System.Security.Claims.ClaimTypes.Sid) ??
                       User.FindFirst("sid");

        if (sidClaim != null && Guid.TryParse(sidClaim.Value, out var guid))
        {
            sessionId = guid;
        }

        var profile = await _authService.GetUserProfileAsync(userId, sessionId);
        if (profile == null)
        {
            return NotFound(new { message = "User not found" });
        }

        return Ok(profile);
    }

    // GET USER ACTIVE & HISTORICAL SESSIONS
    [Microsoft.AspNetCore.Authorization.Authorize]
    [HttpGet("sessions")]
    public async Task<IActionResult> GetSessions()
    {
        var userIdClaim = User.FindFirst("UserId") ??
                          User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier) ??
                          User.FindFirst("sub");

        if (userIdClaim == null || !int.TryParse(userIdClaim.Value, out var userId))
        {
            return Unauthorized(new { message = "User identifier claim not found in token" });
        }

        var sessions = await _authService.GetUserSessionsAsync(userId);
        return Ok(sessions);
    }

    // FORGOT PASSWORD
    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword(
        [FromBody] ForgotPasswordRequest request)
    {
        var otp = await _authService.ForgotPassword(request);

        if (otp == null)
        {
            return BadRequest(new
            {
                message = "Email not registered"
            });
        }

        await _emailService.SendEmailAsync(
            request.Email,
            "Password Reset OTP",
            $"Your OTP for resetting your password is: {otp}"
        );

        return Ok(new
        {
            message = "OTP sent to your email"
        });
    }

    // VERIFY OTP
    [HttpPost("verify-otp")]
    public IActionResult VerifyOtp([FromBody] VerifyOtpRequest request)
    {
        var isValid = _authService.VerifyOtp(
            request.Email,
            request.Otp
        );

        if (!isValid)
        {
            return BadRequest(new
            {
                message = "Invalid or expired OTP"
            });
        }

        return Ok(new
        {
            message = "OTP verified successfully"
        });
    }

    // RESET PASSWORD
    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword(
        [FromBody] ResetPasswordRequest request)
    {
        var response = await _authService.ResetPassword(request);

        if (!response.Success)
        {
            return BadRequest(response);
        }

        return Ok(response);
    }

    // REGISTER
    [HttpPost("register")]
    public async Task<IActionResult> Register(
        [FromBody] RegisterRequest request)
    {
        var response = await _authService.Register(request);

        if (!response.Success)
        {
            return BadRequest(response);
        }

        return Ok(response);
    }

    // REGISTER COMPANY (Onboard new Tenant and Company Owner)
    [HttpPost("register-company")]
    public async Task<IActionResult> RegisterCompany([FromBody] RegisterCompanyRequest request)
    {
        var response = await _authService.RegisterCompanyAsync(request);

        if (!response.Success)
        {
            return BadRequest(response);
        }

        return Ok(response);
    }

    // ROLE-PROTECTED TEST ENDPOINTS
    [Microsoft.AspNetCore.Authorization.Authorize(Roles = "TenantAdmin")]
    [HttpGet("company-dashboard")]
    public IActionResult GetCompanyDashboard()
    {
        var tenantName = User.FindFirst("tenant_name")?.Value ?? "Company";
        var tenantCode = User.FindFirst("tenant_code")?.Value ?? "";
        return Ok(new
        {
            message = $"Welcome to {tenantName} Owner Dashboard",
            tenantCode,
            role = "TenantAdmin"
        });
    }

    [Microsoft.AspNetCore.Authorization.Authorize(Roles = "Customer")]
    [HttpGet("customer-dashboard")]
    public IActionResult GetCustomerDashboard()
    {
        var email = User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value ?? "";
        return Ok(new
        {
            message = $"Welcome Customer ({email})",
            role = "Customer"
        });
    }

    [Microsoft.AspNetCore.Authorization.Authorize(Roles = "SuperAdmin")]
    [HttpGet("platform-dashboard")]
    public IActionResult GetPlatformDashboard()
    {
        return Ok(new
        {
            message = "Welcome Platform SuperAdmin",
            role = "SuperAdmin"
        });
    }
}