using System;
using System.Threading;
using System.Threading.Tasks;
using Billing.Application.Interfaces;
using Billing.Domain.Entities;
using Billing.Infrastructure.Security;
using Billing.Infrastructure.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Billing.Tests.Unit.Services;

public class EmailServiceTests
{
    private readonly Mock<ITenantEmailSettingRepository> _settingRepoMock = new();
    private readonly Mock<ISecretEncryptionService> _encryptionServiceMock = new();
    private readonly ISmtpSecurityValidator _securityValidator = new SmtpSecurityValidator();
    private readonly Mock<ICurrentUserService> _currentUserServiceMock = new();
    private readonly Mock<IConfiguration> _configMock = new();

    private EmailService CreateEmailService()
    {
        return new EmailService(
            _settingRepoMock.Object,
            _encryptionServiceMock.Object,
            _securityValidator,
            NullLogger<EmailService>.Instance,
            _configMock.Object,
            _currentUserServiceMock.Object
        );
    }

    [Fact]
    public async Task SendEmailForTenantAsync_ThrowsWhenTenantNotConfigured()
    {
        var service = CreateEmailService();
        _settingRepoMock.Setup(r => r.GetByTenantIdAsync(99, It.IsAny<CancellationToken>()))
            .ReturnsAsync((TenantEmailSetting?)null);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.SendEmailForTenantAsync(99, "customer@domain.com", "Invoice INV-001", "Body"));

        Assert.Contains("No SMTP configuration found for workspace #99", ex.Message);
        Assert.Contains("Settings -> Email Configuration", ex.Message);
    }

    [Fact]
    public async Task SendEmailForTenantAsync_ThrowsWhenTenantConfigurationDisabled()
    {
        var service = CreateEmailService();
        var disabledSetting = new TenantEmailSetting
        {
            Id = 5,
            TenantId = 12,
            IsEnabled = false
        };

        _settingRepoMock.Setup(r => r.GetByTenantIdAsync(12, It.IsAny<CancellationToken>()))
            .ReturnsAsync(disabledSetting);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.SendEmailForTenantAsync(12, "customer@domain.com", "Invoice INV-001", "Body"));

        Assert.Contains("SMTP email sending is currently disabled for workspace #12", ex.Message);
    }

    [Fact]
    public async Task SendEmailForTenantAsync_ThrowsWhenTenantHostInvalidSSRF()
    {
        var service = CreateEmailService();
        var ssrfSetting = new TenantEmailSetting
        {
            Id = 6,
            TenantId = 15,
            SmtpHost = "127.0.0.1",
            SmtpPort = 587,
            IsEnabled = true
        };

        _settingRepoMock.Setup(r => r.GetByTenantIdAsync(15, It.IsAny<CancellationToken>()))
            .ReturnsAsync(ssrfSetting);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.SendEmailForTenantAsync(15, "customer@domain.com", "Invoice", "Body"));

        Assert.Contains("Invalid SMTP configuration", ex.Message);
    }

    [Fact]
    public async Task SendEmailAsync_ThrowsWhenNoAmbientTenantResolved()
    {
        var service = CreateEmailService();
        _currentUserServiceMock.Setup(c => c.TenantId).Returns((int?)null);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.SendEmailAsync("customer@domain.com", "Invoice", "Body"));

        Assert.Contains("No tenant context could be resolved", ex.Message);
    }

    [Fact]
    public async Task SendEmailForTenantAsync_ThrowsForInvalidTenantId()
    {
        var service = CreateEmailService();

        await Assert.ThrowsAsync<ArgumentOutOfRangeException>(() =>
            service.SendEmailForTenantAsync(0, "customer@domain.com", "Invoice", "Body"));

        await Assert.ThrowsAsync<ArgumentOutOfRangeException>(() =>
            service.SendEmailForTenantAsync(-5, "customer@domain.com", "Invoice", "Body"));
    }
}
