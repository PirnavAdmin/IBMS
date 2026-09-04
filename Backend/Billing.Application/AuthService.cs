using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Domain.Entities;
using System.Security.Cryptography;
using System.Text.RegularExpressions;

namespace Billing.Application;

public class AuthService
{
    private readonly IUserRepository _userRepository;

    // Temporary OTP storage
    private static readonly Dictionary<string, (string Otp, DateTime Expiry)>
        _otpStore = new();

    // Stores emails whose OTP was successfully verified
    private static readonly HashSet<string> _verifiedEmails = new();

    public AuthService(IUserRepository userRepository)
    {
        _userRepository = userRepository;
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
            Email = email,
            PasswordHash =
                BCrypt.Net.BCrypt.HashPassword(request.Password)
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
    public async Task<LoginResponse> Login(LoginRequest request)
    {
        var email = request.Email.Trim().ToLower();

        var user = await _userRepository.GetByEmailAsync(email);

        if (user == null)
        {
            return new LoginResponse
            {
                Success = false,
                Message = "Invalid email or password",
                Token = null
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
                Token = null
            };
        }

        return new LoginResponse
        {
            Success = true,
            Message = "Login successful",
            Token = "temporary-token"
        };
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