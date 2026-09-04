using Billing.Application.Common;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Domain.Entities;
using System.Security.Cryptography;
using System.Text.RegularExpressions;

namespace Billing.Application;

public class AuthService
{
    private readonly IUserRepository _userRepository;
    private readonly IUserSessionRepository _userSessionRepository;
    private readonly IJwtTokenService _jwtTokenService;
    private readonly JwtSettings _jwtSettings;

    // Temporary OTP storage
    private static readonly Dictionary<string, (string Otp, DateTime Expiry)>
        _otpStore = new();

    // Stores emails whose OTP was successfully verified
    private static readonly HashSet<string> _verifiedEmails = new();

    public AuthService(
        IUserRepository userRepository,
        IUserSessionRepository userSessionRepository,
        IJwtTokenService jwtTokenService,
        JwtSettings jwtSettings)
    {
        _userRepository = userRepository;
        _userSessionRepository = userSessionRepository;
        _jwtTokenService = jwtTokenService;
        _jwtSettings = jwtSettings;
    }

    // REGISTER
    public async Task<LoginResponse> Register(RegisterRequest request)
    {
        var errors = new List<string>();

        // Collect Name validation errors
        errors.AddRange(ValidateName(request.Name));

        // Collect Email validation errors
        errors.AddRange(ValidateEmail(request.Email));

        // Check passwords match
        if (request.Password != request.ConfirmPassword)
        {
            errors.Add("Passwords do not match");
        }

        // Collect Password validation errors
        errors.AddRange(ValidatePassword(request.Password));

        // Return all validation errors together
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
            Username = email,
            Email = email,
            PasswordHash =
                BCrypt.Net.BCrypt.HashPassword(request.Password),
            TenantId = "tenant-default",
            ApplicationId = _jwtSettings.ApplicationId,
            Roles = new List<string> { "User" },
            Permissions = new List<string> { "billing.view", "billing.create" },
            IsActive = true,
            CreatedAtUtc = DateTime.UtcNow
        };

        await _userRepository.AddAsync(user);

        return new LoginResponse
        {
            Success = true,
            Message = "Registration successful",
            Token = null,
            Errors = null
        };
    }

    // LOGIN
    public async Task<LoginResponse> Login(
        LoginRequest request,
        string? ipAddress = null,
        string? userAgent = null,
        string? deviceInfo = null)
    {
        // Support identifier from Email or Username
        var identifier = !string.IsNullOrWhiteSpace(request.Username)
            ? request.Username.Trim().ToLower()
            : request.Email.Trim().ToLower();

        if (string.IsNullOrWhiteSpace(identifier) || string.IsNullOrWhiteSpace(request.Password))
        {
            return new LoginResponse
            {
                Success = false,
                Message = "Email/Username and password are required"
            };
        }

        var user = await _userRepository.GetByEmailOrUsernameAsync(identifier);

        if (user == null)
        {
            return new LoginResponse
            {
                Success = false,
                Message = "Invalid credentials"
            };
        }

        if (!user.IsActive)
        {
            return new LoginResponse
            {
                Success = false,
                Message = "Account is inactive or disabled"
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
                Message = "Invalid credentials"
            };
        }

        // 1. Generate new Session ID
        var sessionId = Guid.NewGuid();

        // 2. Generate Refresh Token & hash it
        var rawRefreshToken = _jwtTokenService.GenerateRefreshToken();
        var refreshTokenHash = _jwtTokenService.HashRefreshToken(rawRefreshToken);
        var refreshExpiresAtUtc = DateTime.UtcNow.AddDays(_jwtSettings.RefreshTokenExpirationDays);
        var sessionExpiresAtUtc = DateTime.UtcNow.AddMinutes(_jwtSettings.SessionTimeoutMinutes);

        // 3. Persist session in DB
        var session = new UserSession
        {
            Id = sessionId,
            UserId = user.Id,
            RefreshTokenHash = refreshTokenHash,
            RefreshTokenExpiresAtUtc = refreshExpiresAtUtc,
            SessionExpiresAtUtc = sessionExpiresAtUtc,
            IsRevoked = false,
            CreatedAtUtc = DateTime.UtcNow,
            LastActivityAtUtc = DateTime.UtcNow,
            IpAddress = ipAddress,
            UserAgent = userAgent,
            DeviceInfo = deviceInfo ?? ParseDeviceInfo(userAgent)
        };

        await _userSessionRepository.CreateSessionAsync(session);

        // 4. Generate JWT Access Token with claims
        var (accessToken, accessExpiresAtUtc) = _jwtTokenService.GenerateAccessToken(user, sessionId);

        var claimsDto = new UserClaimsDto
        {
            UserId = user.Id,
            Name = user.Name,
            Username = user.Username,
            Email = user.Email,
            TenantId = user.TenantId,
            ApplicationId = user.ApplicationId,
            Roles = user.Roles,
            Permissions = user.Permissions,
            SessionId = sessionId
        };

        return new LoginResponse
        {
            Success = true,
            Message = "Login successful",
            AccessToken = accessToken,
            RefreshToken = rawRefreshToken,
            TokenType = "Bearer",
            ExpiresAtUtc = accessExpiresAtUtc,
            RefreshTokenExpiresAtUtc = refreshExpiresAtUtc,
            User = claimsDto
        };
    }

    // REFRESH TOKEN (Rotation & Reuse Detection)
    public async Task<LoginResponse> RefreshTokenAsync(
        string refreshToken,
        string? ipAddress = null,
        string? userAgent = null,
        string? deviceInfo = null)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
        {
            return new LoginResponse
            {
                Success = false,
                Message = "Refresh token is required"
            };
        }

        var tokenHash = _jwtTokenService.HashRefreshToken(refreshToken);
        var session = await _userSessionRepository.GetByTokenHashAsync(tokenHash);

        if (session == null)
        {
            return new LoginResponse
            {
                Success = false,
                Message = "Invalid refresh token"
            };
        }

        // Detect Reuse of Revoked Token -> Revoke all sessions for this user!
        if (session.IsRevoked)
        {
            await _userSessionRepository.RevokeAllUserSessionsAsync(
                session.UserId,
                "Security Alert: Revoked refresh token reuse detected"
            );

            return new LoginResponse
            {
                Success = false,
                Message = "Security alert: Revoked refresh token reuse detected. All active sessions have been terminated."
            };
        }

        // Check if refresh token has expired
        if (session.RefreshTokenExpiresAtUtc <= DateTime.UtcNow)
        {
            await _userSessionRepository.RevokeSessionAsync(session.Id, "Refresh token expired");

            return new LoginResponse
            {
                Success = false,
                Message = "Refresh token has expired. Please login again."
            };
        }

        // Check absolute session expiration
        if (session.SessionExpiresAtUtc <= DateTime.UtcNow)
        {
            await _userSessionRepository.RevokeSessionAsync(session.Id, "Session lifetime expired");

            return new LoginResponse
            {
                Success = false,
                Message = "Session has expired. Please login again."
            };
        }

        // Check inactivity timeout
        var minutesSinceLastActivity = (DateTime.UtcNow - session.LastActivityAtUtc).TotalMinutes;
        if (minutesSinceLastActivity > _jwtSettings.InactivityTimeoutMinutes)
        {
            await _userSessionRepository.RevokeSessionAsync(session.Id, "Inactivity timeout exceeded");

            return new LoginResponse
            {
                Success = false,
                Message = "Session expired due to inactivity. Please login again."
            };
        }

        var user = await _userRepository.GetByIdAsync(session.UserId);
        if (user == null || !user.IsActive)
        {
            await _userSessionRepository.RevokeSessionAsync(session.Id, "User deactivated or not found");

            return new LoginResponse
            {
                Success = false,
                Message = "User is not active"
            };
        }

        // Token Rotation: Generate new Refresh Token and revoke old one
        var newRawRefreshToken = _jwtTokenService.GenerateRefreshToken();
        var newRefreshTokenHash = _jwtTokenService.HashRefreshToken(newRawRefreshToken);

        // Revoke the old token and link to the replacement
        await _userSessionRepository.RevokeSessionAsync(
            session.Id,
            "Rotated via refresh token",
            newRefreshTokenHash
        );

        // Create new session entry for rotation
        var newSessionId = Guid.NewGuid();
        var refreshExpiresAtUtc = DateTime.UtcNow.AddDays(_jwtSettings.RefreshTokenExpirationDays);
        var sessionExpiresAtUtc = DateTime.UtcNow.AddMinutes(_jwtSettings.SessionTimeoutMinutes);

        var newSession = new UserSession
        {
            Id = newSessionId,
            UserId = user.Id,
            RefreshTokenHash = newRefreshTokenHash,
            RefreshTokenExpiresAtUtc = refreshExpiresAtUtc,
            SessionExpiresAtUtc = sessionExpiresAtUtc,
            IsRevoked = false,
            CreatedAtUtc = DateTime.UtcNow,
            LastActivityAtUtc = DateTime.UtcNow,
            IpAddress = ipAddress ?? session.IpAddress,
            UserAgent = userAgent ?? session.UserAgent,
            DeviceInfo = deviceInfo ?? session.DeviceInfo
        };

        await _userSessionRepository.CreateSessionAsync(newSession);

        // Generate new JWT Access Token
        var (newAccessToken, accessExpiresAtUtc) = _jwtTokenService.GenerateAccessToken(user, newSessionId);

        var claimsDto = new UserClaimsDto
        {
            UserId = user.Id,
            Name = user.Name,
            Username = user.Username,
            Email = user.Email,
            TenantId = user.TenantId,
            ApplicationId = user.ApplicationId,
            Roles = user.Roles,
            Permissions = user.Permissions,
            SessionId = newSessionId
        };

        return new LoginResponse
        {
            Success = true,
            Message = "Token refreshed successfully",
            AccessToken = newAccessToken,
            RefreshToken = newRawRefreshToken,
            TokenType = "Bearer",
            ExpiresAtUtc = accessExpiresAtUtc,
            RefreshTokenExpiresAtUtc = refreshExpiresAtUtc,
            User = claimsDto
        };
    }

    // LOGOUT (Current session)
    public async Task<LoginResponse> LogoutAsync(string? refreshToken, Guid? sessionId = null)
    {
        if (!string.IsNullOrWhiteSpace(refreshToken))
        {
            var tokenHash = _jwtTokenService.HashRefreshToken(refreshToken);
            var session = await _userSessionRepository.GetByTokenHashAsync(tokenHash);
            if (session != null)
            {
                await _userSessionRepository.RevokeSessionAsync(session.Id, "User logged out");
                return new LoginResponse
                {
                    Success = true,
                    Message = "Logged out successfully"
                };
            }
        }

        if (sessionId.HasValue)
        {
            await _userSessionRepository.RevokeSessionAsync(sessionId.Value, "User logged out");
            return new LoginResponse
            {
                Success = true,
                Message = "Logged out successfully"
            };
        }

        return new LoginResponse
        {
            Success = true,
            Message = "Session was already closed or not found"
        };
    }

    // LOGOUT ALL (All active devices / sessions)
    public async Task<LoginResponse> LogoutAllAsync(int userId)
    {
        await _userSessionRepository.RevokeAllUserSessionsAsync(
            userId,
            "User logged out from all active sessions/devices"
        );

        return new LoginResponse
        {
            Success = true,
            Message = "Successfully logged out from all active devices and sessions"
        };
    }

    // GET USER SESSIONS
    public async Task<List<UserSessionDto>> GetUserSessionsAsync(int userId)
    {
        var sessions = await _userSessionRepository.GetAllSessionsByUserIdAsync(userId);

        return sessions.Select(s => new UserSessionDto
        {
            SessionId = s.Id,
            UserId = s.UserId,
            LoginTimeUtc = s.CreatedAtUtc,
            LastActivityAtUtc = s.LastActivityAtUtc,
            LogoutAtUtc = s.LogoutAtUtc,
            SessionExpiresAtUtc = s.SessionExpiresAtUtc,
            IsRevoked = s.IsRevoked,
            IsActive = !s.IsRevoked && s.RefreshTokenExpiresAtUtc > DateTime.UtcNow && s.SessionExpiresAtUtc > DateTime.UtcNow,
            RevocationReason = s.RevocationReason,
            IpAddress = s.IpAddress,
            UserAgent = s.UserAgent,
            DeviceInfo = s.DeviceInfo
        }).ToList();
    }

    // GET USER PROFILE / CLAIMS
    public async Task<UserClaimsDto?> GetUserProfileAsync(int userId, Guid? sessionId = null)
    {
        var user = await _userRepository.GetByIdAsync(userId);
        if (user == null)
            return null;

        return new UserClaimsDto
        {
            UserId = user.Id,
            Name = user.Name,
            Username = user.Username,
            Email = user.Email,
            TenantId = user.TenantId,
            ApplicationId = user.ApplicationId,
            Roles = user.Roles,
            Permissions = user.Permissions,
            SessionId = sessionId
        };
    }

    private static string ParseDeviceInfo(string? userAgent)
    {
        if (string.IsNullOrWhiteSpace(userAgent))
            return "Unknown Device";

        if (userAgent.Contains("Mobile", StringComparison.OrdinalIgnoreCase))
            return "Mobile Browser";
        if (userAgent.Contains("Windows", StringComparison.OrdinalIgnoreCase))
            return "Windows Desktop";
        if (userAgent.Contains("Macintosh", StringComparison.OrdinalIgnoreCase))
            return "macOS Desktop";
        if (userAgent.Contains("Linux", StringComparison.OrdinalIgnoreCase))
            return "Linux Client";

        return "Web Client";
    }

    // FORGOT PASSWORD
    public async Task<string?> ForgotPassword(ForgotPasswordRequest request)
    {
        var email = request.Email.Trim().ToLower();

        var user = await _userRepository.GetByEmailAsync(email);

        if (user == null)
        {
            return null;
        }

        var otp = RandomNumberGenerator
            .GetInt32(100000, 1000000)
            .ToString();

        // OTP valid for 10 minutes
        _otpStore[email] =
            (otp, DateTime.UtcNow.AddMinutes(10));

        // Remove previous verification if requesting a new OTP
        _verifiedEmails.Remove(email);

        return otp;
    }

    // VERIFY OTP
    public bool VerifyOtp(string email, string otp)
    {
        email = email.Trim().ToLower();

        if (!_otpStore.TryGetValue(email, out var storedOtp))
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

        // OTP verified successfully
        _otpStore.Remove(email);
        _verifiedEmails.Add(email);

        return true;
    }

    // RESET PASSWORD
    public async Task<LoginResponse> ResetPassword(
        ResetPasswordRequest request)
    {
        var email = request.Email.Trim().ToLower();

        // Check whether OTP was verified
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
        if (request.NewPassword != request.ConfirmPassword)
        {
            errors.Add("Passwords do not match");
        }

        // Collect all password validation errors
        errors.AddRange(
            ValidatePassword(request.NewPassword)
        );

        // Return all validation errors together
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
            await _userRepository.GetByEmailAsync(email);

        if (user == null)
        {
            return new LoginResponse
            {
                Success = false,
                Message = "User not found"
            };
        }

        // Hash and update password
        user.PasswordHash =
            BCrypt.Net.BCrypt.HashPassword(
                request.NewPassword
            );

        await _userRepository.UpdateAsync(user);

        // Remove verification after successful password reset
        _verifiedEmails.Remove(email);

        return new LoginResponse
        {
            Success = true,
            Message = "Password reset successful",
            Errors = null
        };
    }

    // NAME VALIDATION
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
            errors.Add("Name must be at least 2 characters");
        }

        if (!name.All(ch =>
            char.IsLetter(ch) || char.IsWhiteSpace(ch)))
        {
            errors.Add("Name can contain only letters");
        }

        return errors;
    }

    // EMAIL VALIDATION
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

        if (!Regex.IsMatch(email, emailPattern))
        {
            errors.Add(
                "Please enter a valid email address"
            );
        }

        return errors;
    }

    // PASSWORD VALIDATION
    private List<string> ValidatePassword(string password)
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

        if (!password.Any(ch => !char.IsLetterOrDigit(ch)))
        {
            errors.Add(
                "Password must contain at least one special character"
            );
        }

        return errors;
    }
}