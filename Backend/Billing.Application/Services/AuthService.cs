using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Domain.Entities;
using Microsoft.Extensions.Configuration;
using System.Security.Cryptography;
using System.Text.RegularExpressions;

namespace Billing.Application.Services;

public class AuthService
{
    private readonly IUserRepository _userRepository;
    private readonly IUserSessionRepository _userSessionRepository;
    private readonly ITokenService _tokenService;
    private readonly IConfiguration _configuration;

    // Temporary OTP storage
    private static readonly Dictionary<string, (string Otp, DateTime Expiry)>
        _otpStore = new();

    // Stores emails whose OTP was successfully verified
    private static readonly HashSet<string> _verifiedEmails = new();

    public AuthService(
        IUserRepository userRepository,
        IUserSessionRepository userSessionRepository,
        ITokenService tokenService,
        IConfiguration configuration)
    {
        _userRepository = userRepository;
        _userSessionRepository = userSessionRepository;
        _tokenService = tokenService;
        _configuration = configuration;
    }

    // ============================================================
    // REGISTER
    // ============================================================

    public async Task<LoginResponse> Register(RegisterRequest request)
    {
        var errors = new List<string>();

        errors.AddRange(ValidateName(request.Name));
        errors.AddRange(ValidateEmail(request.Email));

        if (request.Password != request.ConfirmPassword)
        {
            errors.Add("Passwords do not match");
        }

        errors.AddRange(ValidatePassword(request.Password));

        if (errors.Any())
        {
            return new LoginResponse
            {
                Success = false,
                Message = "Validation failed",
                Errors = errors
            };
        }

        var email = request.Email.Trim().ToLower();

        var existingUser =
            await _userRepository.GetByEmailAsync(email);

        if (existingUser != null)
        {
            return new LoginResponse
            {
                Success = false,
                Message = "Email already registered",
                Errors = new List<string>
                {
                    "This email is already registered"
                }
            };
        }

        var user = new User
        {
            Name = request.Name.Trim(),
            Email = email,

            PasswordHash =
                BCrypt.Net.BCrypt.HashPassword(request.Password),

            TenantId = 1,
            ApplicationId = 1,
            Role = "User",
            Permissions = "LOGIN"
        };

        await _userRepository.AddAsync(user);

        return new LoginResponse
        {
            Success = true,
            Message = "Registration successful",
            AccessToken = null,
            RefreshToken = null,
            ExpiresIn = 0,
            Errors = null
        };
    }

    // ============================================================
    // LOGIN
    // ============================================================

    public async Task<LoginResponse> Login(LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) ||
            string.IsNullOrWhiteSpace(request.Password))
        {
            return new LoginResponse
            {
                Success = false,
                Message = "Email and password are required",
                AccessToken = null,
                RefreshToken = null,
                ExpiresIn = 0
            };
        }

        var email = request.Email.Trim().ToLower();

        var user =
            await _userRepository.GetByEmailAsync(email);

        if (user == null)
        {
            return new LoginResponse
            {
                Success = false,
                Message = "Invalid email or password",
                AccessToken = null,
                RefreshToken = null,
                ExpiresIn = 0
            };
        }

        var passwordCorrect =
            BCrypt.Net.BCrypt.Verify(
                request.Password,
                user.PasswordHash
            );

        if (!passwordCorrect)
        {
            return new LoginResponse
            {
                Success = false,
                Message = "Invalid email or password",
                AccessToken = null,
                RefreshToken = null,
                ExpiresIn = 0
            };
        }

        // --------------------------------------------------------
        // Generate Access Token
        // --------------------------------------------------------

        var accessToken =
            _tokenService.GenerateAccessToken(user);

        // --------------------------------------------------------
        // Generate Refresh Token
        // --------------------------------------------------------

        var refreshToken =
            _tokenService.GenerateRefreshToken();

        // Never store the raw refresh token in the database.
        // Store only its SHA-256 hash.
        var refreshTokenHash =
            _tokenService.HashToken(refreshToken);

        // --------------------------------------------------------
        // Refresh token expiry
        // --------------------------------------------------------

        var refreshExpiryDays =
            Convert.ToDouble(
                _configuration[
                    "Authentication:RefreshTokenExpiryDays"
                ] ?? "7"
            );

        var now = DateTime.UtcNow;

        // --------------------------------------------------------
        // Create database session
        // --------------------------------------------------------

        var session = new UserSession
        {
            UserId = user.Id,

            RefreshTokenHash = refreshTokenHash,

            CreatedAt = now,

            LastActivityAt = now,

            ExpiresAt = now.AddDays(refreshExpiryDays),

            IsRevoked = false
        };

        await _userSessionRepository.AddAsync(session);

        // --------------------------------------------------------
        // Return tokens to client
        // --------------------------------------------------------

        return new LoginResponse
        {
            Success = true,

            Message = "Login successful",

            AccessToken = accessToken,

            RefreshToken = refreshToken,

            ExpiresIn =
                _tokenService.GetAccessTokenExpirySeconds(),

            Errors = null
        };
    }

    // ============================================================
    // REFRESH TOKEN
    // ============================================================

    public async Task<RefreshTokenResponse> RefreshToken(
        RefreshTokenRequest request)
    {
        if (string.IsNullOrWhiteSpace(request?.RefreshToken))
        {
            return new RefreshTokenResponse
            {
                Success = false,
                Message = "Refresh token is required"
            };
        }

        // Hash the refresh token received from client
        var tokenHash =
            _tokenService.HashToken(
                request.RefreshToken.Trim()
            );

        // Find session using hash
        var session =
            await _userSessionRepository
                .GetByRefreshTokenHashAsync(tokenHash);

        // --------------------------------------------------------
        // Session does not exist
        // --------------------------------------------------------

        if (session == null)
        {
            return new RefreshTokenResponse
            {
                Success = false,
                Message = "Invalid refresh token"
            };
        }

        // --------------------------------------------------------
        // Refresh token already revoked
        // --------------------------------------------------------

        if (session.IsRevoked)
        {
            return new RefreshTokenResponse
            {
                Success = false,
                Message = "Refresh token has been revoked"
            };
        }

        // --------------------------------------------------------
        // Refresh token expired
        // --------------------------------------------------------

        if (DateTime.UtcNow > session.ExpiresAt)
        {
            session.IsRevoked = true;
            session.RevokedAt = DateTime.UtcNow;

            await _userSessionRepository.UpdateAsync(session);

            return new RefreshTokenResponse
            {
                Success = false,
                Message = "Refresh token has expired"
            };
        }

        // --------------------------------------------------------
        // Session inactivity timeout
        // --------------------------------------------------------

        var sessionTimeoutMinutes =
            Convert.ToDouble(
                _configuration[
                    "Authentication:SessionTimeoutMinutes"
                ] ?? "60"
            );

        if (
            sessionTimeoutMinutes > 0 &&
            DateTime.UtcNow >
            session.LastActivityAt
                .AddMinutes(sessionTimeoutMinutes)
        )
        {
            session.IsRevoked = true;
            session.RevokedAt = DateTime.UtcNow;

            await _userSessionRepository.UpdateAsync(session);

            return new RefreshTokenResponse
            {
                Success = false,
                Message = "Session has expired due to inactivity"
            };
        }

        // --------------------------------------------------------
        // Get user
        // --------------------------------------------------------

        var user =
            session.User ??
            await _userRepository.GetByIdAsync(
                session.UserId
            );

        if (user == null)
        {
            return new RefreshTokenResponse
            {
                Success = false,
                Message = "User not found"
            };
        }

        // --------------------------------------------------------
        // TOKEN ROTATION
        //
        // Old refresh token is immediately revoked.
        // --------------------------------------------------------

        session.IsRevoked = true;
        session.RevokedAt = DateTime.UtcNow;

        await _userSessionRepository.UpdateAsync(session);

        // --------------------------------------------------------
        // Generate new Access Token
        // --------------------------------------------------------

        var newAccessToken =
            _tokenService.GenerateAccessToken(user);

        // --------------------------------------------------------
        // Generate new Refresh Token
        // --------------------------------------------------------

        var newRefreshToken =
            _tokenService.GenerateRefreshToken();

        var newRefreshTokenHash =
            _tokenService.HashToken(newRefreshToken);

        var refreshExpiryDays =
            Convert.ToDouble(
                _configuration[
                    "Authentication:RefreshTokenExpiryDays"
                ] ?? "7"
            );

        var now = DateTime.UtcNow;

        // --------------------------------------------------------
        // Create new session
        // --------------------------------------------------------

        var newSession = new UserSession
        {
            UserId = user.Id,

            RefreshTokenHash = newRefreshTokenHash,

            CreatedAt = now,

            LastActivityAt = now,

            ExpiresAt =
                now.AddDays(refreshExpiryDays),

            IsRevoked = false
        };

        await _userSessionRepository.AddAsync(newSession);

        // --------------------------------------------------------
        // Return new tokens
        // --------------------------------------------------------

        return new RefreshTokenResponse
        {
            Success = true,

            Message = "Token refreshed successfully",

            AccessToken = newAccessToken,

            RefreshToken = newRefreshToken,

            ExpiresIn =
                _tokenService.GetAccessTokenExpirySeconds()
        };
    }

    // ============================================================
    // LOGOUT
    // ============================================================

    public async Task<bool> Logout(string? refreshToken)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
        {
            return true;
        }

        var tokenHash =
            _tokenService.HashToken(
                refreshToken.Trim()
            );

        var session =
            await _userSessionRepository
                .GetByRefreshTokenHashAsync(tokenHash);

        if (session != null &&
            !session.IsRevoked)
        {
            session.IsRevoked = true;

            session.RevokedAt =
                DateTime.UtcNow;

            await _userSessionRepository
                .UpdateAsync(session);
        }

        return true;
    }

    // ============================================================
    // LOGOUT ALL SESSIONS
    // ============================================================

    public async Task<bool> LogoutAll(int userId)
    {
        if (userId <= 0)
        {
            return false;
        }

        await _userSessionRepository
            .RevokeAllUserSessionsAsync(userId);

        return true;
    }

    // ============================================================
    // FORGOT PASSWORD
    // ============================================================

    public async Task<string?> ForgotPassword(
        ForgotPasswordRequest request)
    {
        var email =
            request.Email.Trim().ToLower();

        var user =
            await _userRepository.GetByEmailAsync(email);

        if (user == null)
        {
            return null;
        }

        var otp =
            RandomNumberGenerator
                .GetInt32(100000, 1000000)
                .ToString();

        // OTP valid for 10 minutes
        _otpStore[email] =
            (
                otp,
                DateTime.UtcNow.AddMinutes(10)
            );

        // Remove previous verification
        _verifiedEmails.Remove(email);

        return otp;
    }

    // ============================================================
    // VERIFY OTP
    // ============================================================

    public bool VerifyOtp(
        string email,
        string otp)
    {
        email =
            email.Trim().ToLower();

        if (!_otpStore.TryGetValue(
                email,
                out var storedOtp))
        {
            return false;
        }

        // Check OTP expiry
        if (DateTime.UtcNow > storedOtp.Expiry)
        {
            _otpStore.Remove(email);

            return false;
        }

        // Check OTP
        if (storedOtp.Otp != otp)
        {
            return false;
        }

        // OTP verified
        _otpStore.Remove(email);

        _verifiedEmails.Add(email);

        return true;
    }

    // ============================================================
    // RESET PASSWORD
    // ============================================================

    public async Task<LoginResponse> ResetPassword(
        ResetPasswordRequest request)
    {
        var email =
            request.Email.Trim().ToLower();

        // OTP must be verified first
        if (!_verifiedEmails.Contains(email))
        {
            return new LoginResponse
            {
                Success = false,
                Message = "Please verify OTP first"
            };
        }

        var errors = new List<string>();

        // Check passwords match
        if (request.NewPassword !=
            request.ConfirmPassword)
        {
            errors.Add("Passwords do not match");
        }

        // Validate new password
        errors.AddRange(
            ValidatePassword(
                request.NewPassword
            )
        );

        if (errors.Any())
        {
            return new LoginResponse
            {
                Success = false,
                Message = "Validation failed",
                Errors = errors
            };
        }

        var user =
            await _userRepository
                .GetByEmailAsync(email);

        if (user == null)
        {
            return new LoginResponse
            {
                Success = false,
                Message = "User not found"
            };
        }

        // Hash new password
        user.PasswordHash =
            BCrypt.Net.BCrypt.HashPassword(
                request.NewPassword
            );

        await _userRepository.UpdateAsync(user);

        // Remove OTP verification
        _verifiedEmails.Remove(email);

        return new LoginResponse
        {
            Success = true,
            Message = "Password reset successful",
            Errors = null
        };
    }

    // ============================================================
    // NAME VALIDATION
    // ============================================================

    private List<string> ValidateName(string name)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(name))
        {
            errors.Add("Name is required");

            return errors;
        }

        if (name.Trim().Length < 2)
        {
            errors.Add(
                "Name must be at least 2 characters"
            );
        }

        if (!name.All(ch =>
            char.IsLetter(ch) ||
            char.IsWhiteSpace(ch)))
        {
            errors.Add(
                "Name can contain only letters"
            );
        }

        return errors;
    }

    // ============================================================
    // EMAIL VALIDATION
    // ============================================================

    private List<string> ValidateEmail(string email)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(email))
        {
            errors.Add("Email is required");

            return errors;
        }

        var emailPattern =
            @"^[^@\s]+@[^@\s]+\.[^@\s]+$";

        if (!Regex.IsMatch(
                email,
                emailPattern))
        {
            errors.Add(
                "Please enter a valid email address"
            );
        }

        return errors;
    }

    // ============================================================
    // PASSWORD VALIDATION
    // ============================================================

    private List<string> ValidatePassword(
        string password)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(password))
        {
            errors.Add("Password is required");

            return errors;
        }

        if (password.Length < 8)
        {
            errors.Add(
                "Password must be at least 8 characters"
            );
        }

        if (!password.Any(char.IsUpper))
        {
            errors.Add(
                "Password must contain at least one uppercase letter"
            );
        }

        if (!password.Any(char.IsLower))
        {
            errors.Add(
                "Password must contain at least one lowercase letter"
            );
        }

        if (!password.Any(char.IsDigit))
        {
            errors.Add(
                "Password must contain at least one number"
            );
        }

        if (!password.Any(
                ch => !char.IsLetterOrDigit(ch)))
        {
            errors.Add(
                "Password must contain at least one special character"
            );
        }

        return errors;
    }
}