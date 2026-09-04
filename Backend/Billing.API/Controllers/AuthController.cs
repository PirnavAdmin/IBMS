using Billing.API.Services;
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
}