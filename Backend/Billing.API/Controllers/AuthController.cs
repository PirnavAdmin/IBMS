using Billing.Application.Services;
using Billing.Contracts;
using Billing.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
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
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var response = await _authService.Login(request);

        if (!response.Success)
        {
            return Unauthorized(response);
        }

        return Ok(response);
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

    // REFRESH TOKEN
    [HttpPost("refresh-token")]
    public async Task<IActionResult> RefreshToken([FromBody] RefreshTokenRequest request)
    {
        var response = await _authService.RefreshToken(request);

        if (!response.Success)
        {
            return Unauthorized(response);
        }

        return Ok(response);
    }

    // LOGOUT
    [HttpPost("logout")]
    public async Task<IActionResult> Logout([FromBody] LogoutRequest? request)
    {
        await _authService.Logout(request?.RefreshToken);
        return Ok(new { success = true, message = "Logged out successfully" });
    }

    // LOGOUT ALL SESSIONS
    [Authorize]
    [HttpPost("logout-all")]
    public async Task<IActionResult> LogoutAll()
    {
        var userIdClaim = User.FindFirst("UserId")?.Value
            ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;

        if (int.TryParse(userIdClaim, out var userId))
        {
            await _authService.LogoutAll(userId);
            return Ok(new { success = true, message = "All sessions logged out successfully" });
        }

        return Unauthorized(new { success = false, message = "Invalid user identity" });
    }

    // CURRENT USER INFO (PROTECTED ENDPOINT)
    [Authorize]
    [HttpGet("me")]
    public IActionResult GetCurrentUser()
    {
        var userIdClaim = User.FindFirst("UserId")?.Value
            ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var tenantIdClaim = User.FindFirst("TenantId")?.Value;
        var applicationIdClaim = User.FindFirst("ApplicationId")?.Value;
        var email = User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value;
        var name = User.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value;
        var role = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value
            ?? User.FindFirst("Role")?.Value;
        var permissions = User.FindAll("Permission").Select(p => p.Value).ToList();
        if (!permissions.Any())
        {
            var rawPermissions = User.FindFirst("Permissions")?.Value;
            if (!string.IsNullOrWhiteSpace(rawPermissions))
            {
                permissions = rawPermissions.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
            }
        }

        return Ok(new
        {
            userId = int.TryParse(userIdClaim, out var uid) ? uid : 0,
            email,
            name,
            tenantId = int.TryParse(tenantIdClaim, out var tid) ? tid : 0,
            applicationId = int.TryParse(applicationIdClaim, out var aid) ? aid : 0,
            role,
            permissions
        });
    }
}
