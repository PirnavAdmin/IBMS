using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Billing.Application;
using Billing.Application.Common;
using Billing.Application.Services;
using Billing.Contracts;
using Billing.Domain.Entities;
using Billing.Tests.Unit.Fakes;

namespace Billing.Tests.Unit;

public class AuthServiceTests
{
    private readonly FakeUserRepository _userRepository;
    private readonly FakeUserSessionRepository _sessionRepository;
    private readonly FakeTenantRepository _tenantRepository;
    private readonly JwtSettings _jwtSettings;
    private readonly JwtTokenService _tokenService;
    private readonly AuthService _authService;

    public AuthServiceTests()
    {
        _userRepository = new FakeUserRepository();
        _sessionRepository = new FakeUserSessionRepository();
        _tenantRepository = new FakeTenantRepository();
        _jwtSettings = new JwtSettings
        {
            SecretKey = "TestSecretKeyForUnitTestingWithAtLeast256BitsRequiredLength!",
            Issuer = "TestIssuer.IBMS",
            Audience = "TestAudience.IBMS",
            AccessTokenExpirationMinutes = 15,
            RefreshTokenExpirationDays = 7,
            InactivityTimeoutMinutes = 60,
            SessionTimeoutMinutes = 1440,
            ApplicationId = "IBMS-TestApp"
        };
        _tokenService = new JwtTokenService(_jwtSettings);
        _authService = new AuthService(_userRepository, _sessionRepository, _tokenService, _jwtSettings, _tenantRepository);

        var tenant = new Tenant
        {
            Id = 1,
            Name = "Acme Corp",
            TenantCode = "tenant-test-123",
            IsActive = true
        };
        _tenantRepository.CreateAsync(tenant).GetAwaiter().GetResult();

        // Seed a test user
        var user = new User
        {
            Id = 1,
            Name = "John Doe",
            Username = "johndoe",
            Email = "john@example.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("Password@123"),
            TenantId = 1,
            Tenant = tenant,
            ApplicationId = "IBMS-TestApp",
            Roles = new List<string> { "Admin", "BillingManager" },
            Permissions = new List<string> { "billing.read", "billing.write", "invoices.create" },
            IsActive = true
        };
        _userRepository.AddAsync(user).GetAwaiter().GetResult();
    }

    [Fact]
    public async Task Login_ValidEmailAndPassword_GeneratesTokensWithRequiredClaims()
    {
        // Arrange
        var request = new LoginRequest
        {
            Email = "john@example.com",
            Password = "Password@123"
        };

        // Act
        var response = await _authService.Login(request, ipAddress: "192.168.1.100", userAgent: "Mozilla/5.0 (Windows NT 10.0)");

        // Assert
        Assert.True(response.Success);
        Assert.NotNull(response.AccessToken);
        Assert.NotNull(response.RefreshToken);
        Assert.NotNull(response.User);

        // Verify User claims in DTO
        Assert.Equal(1, response.User.UserId);
        Assert.Equal("1", response.User.TenantId);
        Assert.Equal("tenant-test-123", response.User.TenantCode);
        Assert.Equal("Acme Corp", response.User.TenantName);
        Assert.Equal("Admin", response.User.Role);
        Assert.Equal("IBMS-TestApp", response.User.ApplicationId);
        Assert.Contains("Admin", response.User.Roles);
        Assert.Contains("BillingManager", response.User.Roles);
        Assert.Contains("billing.read", response.User.Permissions);
        Assert.Contains("billing.write", response.User.Permissions);

        // Verify Claims in JWT access token
        var handler = new JwtSecurityTokenHandler();
        var jwtToken = handler.ReadJwtToken(response.AccessToken);

        Assert.Equal("1", jwtToken.Claims.First(c => c.Type == "UserId").Value);
        Assert.Equal("1", jwtToken.Claims.First(c => c.Type == "TenantId").Value);
        Assert.Equal("tenant-test-123", jwtToken.Claims.First(c => c.Type == "tenant_code").Value);
        Assert.Equal("Acme Corp", jwtToken.Claims.First(c => c.Type == "tenant_name").Value);
        Assert.Equal("IBMS-TestApp", jwtToken.Claims.First(c => c.Type == "ApplicationId").Value);

        var rolesInJwt = jwtToken.Claims.Where(c => c.Type == ClaimTypes.Role || c.Type == "Roles").Select(c => c.Value).ToList();
        Assert.Contains("Admin", rolesInJwt);
        Assert.Contains("BillingManager", rolesInJwt);

        var permissionsInJwt = jwtToken.Claims.Where(c => c.Type == "Permissions" || c.Type == "permission").Select(c => c.Value).ToList();
        Assert.Contains("billing.read", permissionsInJwt);
        Assert.Contains("billing.write", permissionsInJwt);

        // Verify Session tracking in DB
        Assert.Single(_sessionRepository.Sessions);
        var session = _sessionRepository.Sessions.First();
        Assert.Equal(1, session.UserId);
        Assert.False(session.IsRevoked);
        Assert.Equal("192.168.1.100", session.IpAddress);
        Assert.Equal("Windows Desktop", session.DeviceInfo);
    }

    [Fact]
    public async Task Login_ValidUsernameAndPassword_SuccessfullyLogsIn()
    {
        // Arrange
        var request = new LoginRequest
        {
            Email = "johndoe", // Passed via Email field
            Password = "Password@123"
        };

        // Act
        var response = await _authService.Login(request);

        // Assert
        Assert.True(response.Success);
        Assert.NotNull(response.AccessToken);
    }

    [Fact]
    public async Task Login_InvalidPassword_ReturnsFailure()
    {
        // Arrange
        var request = new LoginRequest
        {
            Email = "john@example.com",
            Password = "WrongPassword"
        };

        // Act
        var response = await _authService.Login(request);

        // Assert
        Assert.False(response.Success);
        Assert.Equal("Invalid credentials", response.Message);
        Assert.Null(response.AccessToken);
    }

    [Fact]
    public async Task TokenValidation_ValidToken_SuccessfullyValidates()
    {
        // Arrange
        var request = new LoginRequest { Email = "john@example.com", Password = "Password@123" };
        var loginResponse = await _authService.Login(request);

        // Act
        var isValid = _tokenService.ValidateToken(loginResponse.AccessToken!, out var principal, out var failureReason);

        // Assert
        Assert.True(isValid);
        Assert.NotNull(principal);
        Assert.Null(failureReason);
        Assert.Equal("1", principal.FindFirst("UserId")?.Value);
        Assert.Equal("1", principal.FindFirst("TenantId")?.Value);
        Assert.Equal("tenant-test-123", principal.FindFirst("tenant_code")?.Value);
        Assert.Equal("IBMS-TestApp", principal.FindFirst("ApplicationId")?.Value);
    }

    [Fact]
    public async Task TokenValidation_TamperedToken_FailsValidation()
    {
        // Arrange
        var request = new LoginRequest { Email = "john@example.com", Password = "Password@123" };
        var loginResponse = await _authService.Login(request);

        // Tamper with the token string
        var tamperedToken = loginResponse.AccessToken! + "tampered";

        // Act
        var isValid = _tokenService.ValidateToken(tamperedToken, out var principal, out var failureReason);

        // Assert
        Assert.False(isValid);
        Assert.Null(principal);
        Assert.NotNull(failureReason);
    }

    [Fact]
    public async Task RefreshToken_ValidToken_RotatesRefreshTokenAndIssuesNewAccessToken()
    {
        // Arrange
        var loginResponse = await _authService.Login(new LoginRequest { Email = "john@example.com", Password = "Password@123" });
        var originalRefreshToken = loginResponse.RefreshToken!;
        var originalAccessToken = loginResponse.AccessToken!;

        // Act
        var refreshResponse = await _authService.RefreshTokenAsync(originalRefreshToken);

        // Assert
        Assert.True(refreshResponse.Success);
        Assert.NotNull(refreshResponse.AccessToken);
        Assert.NotNull(refreshResponse.RefreshToken);
        Assert.NotEqual(originalRefreshToken, refreshResponse.RefreshToken); // Token rotated!
        Assert.NotEqual(originalAccessToken, refreshResponse.AccessToken);

        // Old token session should be marked as revoked
        var oldSessionHash = _tokenService.HashRefreshToken(originalRefreshToken);
        var oldSession = _sessionRepository.Sessions.First(s => s.RefreshTokenHash == oldSessionHash);
        Assert.True(oldSession.IsRevoked);
        Assert.Equal("Rotated via refresh token", oldSession.RevocationReason);

        // New session must be active
        var newSessionHash = _tokenService.HashRefreshToken(refreshResponse.RefreshToken);
        var newSession = _sessionRepository.Sessions.First(s => s.RefreshTokenHash == newSessionHash);
        Assert.False(newSession.IsRevoked);
    }

    [Fact]
    public async Task RefreshToken_RevokedTokenReused_DetectsReuseAndRevokesAllSessions()
    {
        // Arrange
        var loginResponse = await _authService.Login(new LoginRequest { Email = "john@example.com", Password = "Password@123" });
        var originalRefreshToken = loginResponse.RefreshToken!;

        // First refresh: rotates token normally
        var refreshResponse1 = await _authService.RefreshTokenAsync(originalRefreshToken);
        Assert.True(refreshResponse1.Success);

        // Act: Attacker attempts to reuse original (already revoked) refresh token
        var reuseResponse = await _authService.RefreshTokenAsync(originalRefreshToken);

        // Assert
        Assert.False(reuseResponse.Success);
        Assert.Contains("reuse detected", reuseResponse.Message, StringComparison.OrdinalIgnoreCase);

        // ALL sessions for the user should now be revoked!
        var userSessions = await _sessionRepository.GetActiveSessionsByUserIdAsync(1);
        Assert.Empty(userSessions);
    }

    [Fact]
    public async Task RefreshToken_InactivityTimeoutExceeded_FailsRefresh()
    {
        // Arrange
        var loginResponse = await _authService.Login(new LoginRequest { Email = "john@example.com", Password = "Password@123" });
        var tokenHash = _tokenService.HashRefreshToken(loginResponse.RefreshToken!);
        var session = _sessionRepository.Sessions.First(s => s.RefreshTokenHash == tokenHash);

        // Simulate inactivity past timeout (e.g. 90 minutes ago, timeout is 60)
        session.LastActivityAtUtc = DateTime.UtcNow.AddMinutes(-90);

        // Act
        var response = await _authService.RefreshTokenAsync(loginResponse.RefreshToken!);

        // Assert
        Assert.False(response.Success);
        Assert.Contains("inactivity", response.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Logout_CurrentSession_RevokesSession()
    {
        // Arrange
        var loginResponse = await _authService.Login(new LoginRequest { Email = "john@example.com", Password = "Password@123" });

        // Act
        var logoutResponse = await _authService.LogoutAsync(loginResponse.RefreshToken);

        // Assert
        Assert.True(logoutResponse.Success);
        var tokenHash = _tokenService.HashRefreshToken(loginResponse.RefreshToken!);
        var session = _sessionRepository.Sessions.First(s => s.RefreshTokenHash == tokenHash);
        Assert.True(session.IsRevoked);
        Assert.NotNull(session.LogoutAtUtc);
    }

    [Fact]
    public async Task LogoutAll_RevokesAllActiveSessionsForUser()
    {
        // Arrange: Create two separate device sessions for John
        await _authService.Login(new LoginRequest { Email = "john@example.com", Password = "Password@123" }, ipAddress: "1.1.1.1", userAgent: "Windows");
        await _authService.Login(new LoginRequest { Email = "john@example.com", Password = "Password@123" }, ipAddress: "2.2.2.2", userAgent: "Mobile");

        var activeBefore = await _sessionRepository.GetActiveSessionsByUserIdAsync(1);
        Assert.Equal(2, activeBefore.Count);

        // Act: Logout from all devices
        var logoutResponse = await _authService.LogoutAllAsync(1);

        // Assert
        Assert.True(logoutResponse.Success);
        var activeAfter = await _sessionRepository.GetActiveSessionsByUserIdAsync(1);
        Assert.Empty(activeAfter);
    }

    [Fact]
    public async Task Logout_BySessionId_RevokesSession()
    {
        // Arrange
        var loginResponse = await _authService.Login(new LoginRequest { Email = "john@example.com", Password = "Password@123" });
        var sessionId = loginResponse.User!.SessionId;

        // Act
        var logoutResponse = await _authService.LogoutAsync(null, sessionId);

        // Assert
        Assert.True(logoutResponse.Success);
        var session = _sessionRepository.Sessions.First(s => s.Id == sessionId);
        Assert.True(session.IsRevoked);
        Assert.NotNull(session.LogoutAtUtc);
    }

    [Fact]
    public async Task RegisterCompanyAsync_CreatesTenantAndAdminUser()
    {
        // Arrange
        var request = new RegisterCompanyRequest
        {
            CompanyName = "Beta Technologies",
            TenantCode = "beta-tech",
            OwnerName = "Jane Beta",
            Email = "admin@betatech.com",
            Password = "Password@123",
            Phone = "+1-555-0100"
        };

        // Act
        var result = await _authService.RegisterCompanyAsync(request);

        // Assert
        Assert.True(result.Success);
        Assert.NotNull(result.User);
        Assert.Equal("TenantAdmin", result.User.Role);
        Assert.Equal("beta-tech", result.User.TenantCode);
        Assert.Equal("Beta Technologies", result.User.TenantName);

        // Verify tenant exists in repo
        var tenant = await _tenantRepository.GetByCodeAsync("beta-tech");
        Assert.NotNull(tenant);
        Assert.Equal("Beta Technologies", tenant.Name);

        // Verify admin can login and receive JWT token with TenantAdmin role
        var loginResult = await _authService.Login(new LoginRequest
        {
            Email = "admin@betatech.com",
            Password = "Password@123"
        });
        Assert.True(loginResult.Success);
        Assert.NotNull(loginResult.AccessToken);
        Assert.Equal("TenantAdmin", loginResult.User?.Role);
        Assert.Equal("beta-tech", loginResult.User?.TenantCode);
    }

    [Fact]
    public async Task RegisterCustomerAsync_CreatesCustomerUserUnderTenant()
    {
        // Arrange
        var request = new RegisterRequest
        {
            Name = "Alice Customer",
            Email = "alice@clientcorp.com",
            Password = "Password@123",
            ConfirmPassword = "Password@123"
        };

        // Act
        var result = await _authService.RegisterCustomerAsync(request, tenantId: 1);

        // Assert
        Assert.True(result.Success);
        Assert.NotNull(result.User);
        Assert.Equal("Customer", result.User.Role);
        Assert.Equal("1", result.User.TenantId);

        // Verify user in repository has tenantId 1
        var user = await _userRepository.GetByEmailAsync("alice@clientcorp.com");
        Assert.NotNull(user);
        Assert.Equal(1, user.TenantId);
        Assert.Contains("Customer", user.Roles);
    }

    [Fact]
    public async Task Login_InactiveCompany_ReturnsError()
    {
        // Arrange: Inactivate the tenant
        var tenant = await _tenantRepository.GetByIdAsync(1);
        tenant!.IsActive = false;

        var request = new LoginRequest
        {
            Email = "john@example.com",
            Password = "Password@123"
        };

        // Act
        var result = await _authService.Login(request);

        // Assert
        Assert.False(result.Success);
        Assert.Equal("Company account is inactive or suspended", result.Message);
        Assert.Null(result.AccessToken);
    }
}

