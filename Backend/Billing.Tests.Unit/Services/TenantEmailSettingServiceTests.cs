using System;
using System.Threading;
using System.Threading.Tasks;
using Billing.Application.Interfaces;
using Billing.Application.Services;
using Billing.Contracts.Settings;
using Billing.Domain.Entities;
using Billing.Infrastructure.Security;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Billing.Tests.Unit.Services;

public class TenantEmailSettingServiceTests
{
    private readonly Mock<ITenantEmailSettingRepository> _settingRepoMock = new();
    private readonly Mock<ISecretEncryptionService> _encryptionServiceMock = new();
    private readonly ISmtpSecurityValidator _securityValidator = new SmtpSecurityValidator();
    private readonly Mock<IEmailService> _emailServiceMock = new();
    private readonly Mock<IAuditLogRepository> _auditLogRepoMock = new();
    private readonly Mock<ITenantRepository> _tenantRepoMock = new();

    private TenantEmailSettingService CreateService()
    {
        return new TenantEmailSettingService(
            _settingRepoMock.Object,
            _encryptionServiceMock.Object,
            _securityValidator,
            _emailServiceMock.Object,
            _auditLogRepoMock.Object,
            _tenantRepoMock.Object,
            NullLogger<TenantEmailSettingService>.Instance
        );
    }

    [Fact]
    public async Task SaveSettingAsync_NewSetting_EncryptsPasswordAndPersists()
    {
        var service = CreateService();
        _settingRepoMock.Setup(r => r.GetByTenantIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync((TenantEmailSetting?)null);

        _encryptionServiceMock.Setup(e => e.Protect("SecretPass123!"))
            .Returns("enc:v2:k1:encrypted_blob_data");

        var request = new SaveTenantEmailSettingRequest
        {
            Provider = "Custom",
            SmtpHost = "smtp.mailprovider.com",
            SmtpPort = 587,
            Username = "billing@tenant1.com",
            Password = "SecretPass123!",
            FromEmail = "billing@tenant1.com",
            FromName = "Tenant 1 Billing",
            EncryptionMode = "StartTls",
            IsEnabled = true
        };

        var result = await service.SaveSettingAsync(1, request, "AdminUser");

        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.Equal("smtp.mailprovider.com", result.Data.SmtpHost);
        Assert.Equal(587, result.Data.SmtpPort);
        Assert.Equal("billing@tenant1.com", result.Data.Username);
        Assert.Equal("billing@tenant1.com", result.Data.FromEmail);
        Assert.True(result.Data.HasPasswordConfigured);
        Assert.False(result.Data.IsVerified);

        _settingRepoMock.Verify(r => r.AddAsync(It.Is<TenantEmailSetting>(s =>
            s.TenantId == 1 &&
            s.PasswordProtected == "enc:v2:k1:encrypted_blob_data" &&
            s.FromEmail == "billing@tenant1.com"
        ), It.IsAny<CancellationToken>()), Times.Once);

        _auditLogRepoMock.Verify(a => a.AddAsync(It.Is<AuditLog>(l =>
            l.TenantId == 1 &&
            l.Action == "CreateSmtpConfig"
        ), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task SaveSettingAsync_ExistingSetting_PreservesPasswordWhenOmitted()
    {
        var service = CreateService();
        var existing = new TenantEmailSetting
        {
            Id = 42,
            TenantId = 2,
            Provider = "Gmail",
            SmtpHost = "smtp.gmail.com",
            SmtpPort = 587,
            Username = "user@gmail.com",
            PasswordProtected = "enc:v2:k1:previously_saved_password",
            FromEmail = "user@gmail.com",
            FromName = "User Gmail",
            EncryptionMode = "StartTls",
            IsEnabled = true,
            IsVerified = true
        };

        _settingRepoMock.Setup(r => r.GetByTenantIdAsync(2, It.IsAny<CancellationToken>()))
            .ReturnsAsync(existing);

        var request = new SaveTenantEmailSettingRequest
        {
            Provider = "Gmail",
            SmtpHost = "smtp.gmail.com",
            SmtpPort = 587,
            Username = "user@gmail.com",
            Password = null, // Intentionally left blank to preserve password
            FromEmail = "user@gmail.com",
            FromName = "Updated Display Name",
            EncryptionMode = "StartTls",
            IsEnabled = true
        };

        var result = await service.SaveSettingAsync(2, request, "AdminUser");

        Assert.True(result.Success);
        Assert.Equal("enc:v2:k1:previously_saved_password", existing.PasswordProtected);
        Assert.Equal("Updated Display Name", existing.FromName);

        _settingRepoMock.Verify(r => r.UpdateAsync(existing, It.IsAny<CancellationToken>()), Times.Once);
        _encryptionServiceMock.Verify(e => e.Protect(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task SaveSettingAsync_HostOrCredentialsChanged_ResetsIsVerified()
    {
        var service = CreateService();
        var existing = new TenantEmailSetting
        {
            Id = 10,
            TenantId = 1,
            Provider = "Custom",
            SmtpHost = "smtp.oldhost.com",
            SmtpPort = 587,
            Username = "olduser@test.com",
            PasswordProtected = "enc:v2:k1:oldpassword",
            FromEmail = "olduser@test.com",
            FromName = "Old Name",
            IsVerified = true
        };

        _settingRepoMock.Setup(r => r.GetByTenantIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(existing);

        var request = new SaveTenantEmailSettingRequest
        {
            Provider = "Custom",
            SmtpHost = "smtp.newhost.com", // Host changed
            SmtpPort = 587,
            Username = "olduser@test.com",
            Password = null,
            FromEmail = "olduser@test.com",
            FromName = "Old Name",
            EncryptionMode = "StartTls"
        };

        var result = await service.SaveSettingAsync(1, request);

        Assert.True(result.Success);
        Assert.False(existing.IsVerified);
    }

    [Theory]
    [InlineData("localhost")]
    [InlineData("127.0.0.1")]
    [InlineData("::1")]
    [InlineData("10.0.0.5")]
    [InlineData("192.168.1.100")]
    [InlineData("172.20.0.1")]
    [InlineData("169.254.169.254")]
    [InlineData("metadata.google.internal")]
    [InlineData("server.local")]
    [InlineData("corp-mail.internal")]
    public async Task SaveSettingAsync_RejectsRestrictedHost_SSRFPrevention(string restrictedHost)
    {
        var service = CreateService();

        var request = new SaveTenantEmailSettingRequest
        {
            SmtpHost = restrictedHost,
            SmtpPort = 587,
            Username = "test@internal.com",
            Password = "Password123!",
            FromEmail = "test@internal.com",
            FromName = "Test Internal"
        };

        var result = await service.SaveSettingAsync(1, request);

        Assert.False(result.Success);
        Assert.True(
            result.Message.Contains("internal", StringComparison.OrdinalIgnoreCase) ||
            result.Message.Contains("private", StringComparison.OrdinalIgnoreCase) ||
            result.Message.Contains("loopback", StringComparison.OrdinalIgnoreCase) ||
            result.Message.Contains("restricted", StringComparison.OrdinalIgnoreCase));
        _settingRepoMock.Verify(r => r.AddAsync(It.IsAny<TenantEmailSetting>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Theory]
    [InlineData(22)]    // SSH
    [InlineData(80)]    // HTTP
    [InlineData(443)]   // HTTPS
    [InlineData(3306)]  // MySQL
    [InlineData(5432)]  // PostgreSQL
    [InlineData(6379)]  // Redis
    [InlineData(0)]     // Invalid
    [InlineData(70000)] // Out of range
    public async Task SaveSettingAsync_RejectsRestrictedOrInvalidPorts(int restrictedPort)
    {
        var service = CreateService();

        var request = new SaveTenantEmailSettingRequest
        {
            SmtpHost = "smtp.legitimate-host.com",
            SmtpPort = restrictedPort,
            Username = "test@domain.com",
            Password = "Password123!",
            FromEmail = "test@domain.com",
            FromName = "Test"
        };

        var result = await service.SaveSettingAsync(1, request);

        Assert.False(result.Success);
        _settingRepoMock.Verify(r => r.AddAsync(It.IsAny<TenantEmailSetting>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task SaveSettingAsync_RejectsInvalidFromEmail()
    {
        var service = CreateService();

        var request = new SaveTenantEmailSettingRequest
        {
            SmtpHost = "smtp.legitimate-host.com",
            SmtpPort = 587,
            Username = "test@domain.com",
            Password = "Password123!",
            FromEmail = "not-a-valid-email-address",
            FromName = "Test"
        };

        var result = await service.SaveSettingAsync(1, request);

        Assert.False(result.Success);
        Assert.Contains("sender email", result.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task GetSettingAsync_NeverExposesPasswordOrProtectedSecret()
    {
        var service = CreateService();
        var existing = new TenantEmailSetting
        {
            Id = 5,
            TenantId = 3,
            Provider = "Hostinger",
            SmtpHost = "smtp.hostinger.com",
            SmtpPort = 465,
            Username = "billing@hostingeruser.com",
            PasswordProtected = "enc:v2:k1:SECRET_CIPHERTEXT_MUST_NEVER_LEAK",
            FromEmail = "billing@hostingeruser.com",
            FromName = "Hostinger Billing",
            EncryptionMode = "SslTls",
            IsEnabled = true,
            IsVerified = true
        };

        _settingRepoMock.Setup(r => r.GetByTenantIdAsync(3, It.IsAny<CancellationToken>()))
            .ReturnsAsync(existing);

        var result = await service.GetSettingAsync(3);

        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.Equal("smtp.hostinger.com", result.Data.SmtpHost);
        Assert.Equal(465, result.Data.SmtpPort);
        Assert.True(result.Data.HasPasswordConfigured);
        // Assert that DTO type has NO Password or PasswordProtected properties at all
        Assert.Null(typeof(TenantEmailSettingDto).GetProperty("Password"));
        Assert.Null(typeof(TenantEmailSettingDto).GetProperty("PasswordProtected"));
        Assert.Null(typeof(TenantEmailSettingDto).GetProperty("EncryptedPassword"));
    }

    [Fact]
    public async Task SetStatusAsync_TogglesEnabledState_AndAudits()
    {
        var service = CreateService();
        var existing = new TenantEmailSetting
        {
            Id = 12,
            TenantId = 4,
            IsEnabled = true
        };

        _settingRepoMock.Setup(r => r.GetByTenantIdAsync(4, It.IsAny<CancellationToken>()))
            .ReturnsAsync(existing);

        var result = await service.SetStatusAsync(4, isEnabled: false, "ManagerUser");

        Assert.True(result.Success);
        Assert.False(existing.IsEnabled);
        _settingRepoMock.Verify(r => r.UpdateAsync(existing, It.IsAny<CancellationToken>()), Times.Once);
        _auditLogRepoMock.Verify(a => a.AddAsync(It.Is<AuditLog>(l =>
            l.TenantId == 4 &&
            l.Action == "DisableSmtp"
        ), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task TestSmtpConnectionAsync_DispatchesEmailAndUpdatesVerifiedOnSuccess()
    {
        var service = CreateService();
        var existing = new TenantEmailSetting
        {
            Id = 15,
            TenantId = 5,
            Provider = "Gmail",
            SmtpHost = "smtp.gmail.com",
            SmtpPort = 587,
            Username = "user@gmail.com",
            PasswordProtected = "enc:v2:k1:pass",
            FromEmail = "user@gmail.com",
            FromName = "Test User",
            EncryptionMode = "StartTls",
            IsVerified = false
        };

        _settingRepoMock.Setup(r => r.GetByTenantIdAsync(5, It.IsAny<CancellationToken>()))
            .ReturnsAsync(existing);

        _encryptionServiceMock.Setup(e => e.Unprotect("enc:v2:k1:pass"))
            .Returns("decrypted_plain_pass");

        _tenantRepoMock.Setup(t => t.GetByIdAsync(5))
            .ReturnsAsync(new Tenant { Id = 5, Name = "Tenant 5 Corp" });

        _emailServiceMock.Setup(e => e.SendEmailWithConfigAsync(
            It.IsAny<TenantEmailSetting>(),
            "recipient@example.com",
            It.IsAny<string>(),
            It.IsAny<string>(),
            null,
            null,
            It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var request = new TestEmailSettingRequest
        {
            RecipientEmail = "recipient@example.com"
        };

        var result = await service.TestSmtpConnectionAsync(5, request, "AdminUser");

        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.True(result.Data.Success);
        Assert.True(existing.IsVerified);
        Assert.Equal("Success", existing.LastTestStatus);
        Assert.Null(existing.LastTestError);

        _settingRepoMock.Verify(r => r.UpdateAsync(existing, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task TestSmtpConnectionAsync_SanitizesErrorsOnFailure()
    {
        var service = CreateService();
        var existing = new TenantEmailSetting
        {
            Id = 18,
            TenantId = 6,
            SmtpHost = "smtp.hostinger.com",
            SmtpPort = 465,
            Username = "user@hostinger.com",
            PasswordProtected = "enc:v2:k1:pass",
            FromEmail = "user@hostinger.com",
            FromName = "Test",
            EncryptionMode = "SslTls"
        };

        _settingRepoMock.Setup(r => r.GetByTenantIdAsync(6, It.IsAny<CancellationToken>()))
            .ReturnsAsync(existing);

        _encryptionServiceMock.Setup(e => e.Unprotect("enc:v2:k1:pass"))
            .Returns("decrypted_pass");

        _emailServiceMock.Setup(e => e.SendEmailWithConfigAsync(
            It.IsAny<TenantEmailSetting>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            null,
            null,
            It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("5.7.8 Authentication failed at C:\\inetpub\\IBMS\\Mail.cs"));

        var request = new TestEmailSettingRequest
        {
            RecipientEmail = "recipient@example.com"
        };

        var result = await service.TestSmtpConnectionAsync(6, request, "AdminUser");

        Assert.False(result.Success);
        Assert.Equal("Failed", existing.LastTestStatus);
        Assert.DoesNotContain("C:\\inetpub", existing.LastTestError);
        Assert.Contains("Authentication failed", existing.LastTestError, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task TenantIsolation_SeparateTenantsHaveIndependentConfigurations()
    {
        var service = CreateService();

        var tenant1Setting = new TenantEmailSetting
        {
            Id = 1,
            TenantId = 1,
            SmtpHost = "smtp.tenant1.com",
            FromEmail = "billing@tenant1.com"
        };

        var tenant2Setting = new TenantEmailSetting
        {
            Id = 2,
            TenantId = 2,
            SmtpHost = "smtp.tenant2.com",
            FromEmail = "billing@tenant2.com"
        };

        _settingRepoMock.Setup(r => r.GetByTenantIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(tenant1Setting);

        _settingRepoMock.Setup(r => r.GetByTenantIdAsync(2, It.IsAny<CancellationToken>()))
            .ReturnsAsync(tenant2Setting);

        var result1 = await service.GetSettingAsync(1);
        var result2 = await service.GetSettingAsync(2);

        Assert.Equal("smtp.tenant1.com", result1.Data!.SmtpHost);
        Assert.Equal("smtp.tenant2.com", result2.Data!.SmtpHost);
        Assert.NotEqual(result1.Data.FromEmail, result2.Data.FromEmail);
    }
}
