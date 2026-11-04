using Billing.Application.Interfaces;
using Billing.Application.Services;
using Billing.Contracts.Notification;
using Billing.Domain.Entities;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace Billing.Tests.Unit;

public class InAppNotificationServiceTests
{
    private readonly Mock<IInAppNotificationRepository> _repositoryMock;
    private readonly Mock<ILogger<InAppNotificationService>> _loggerMock;
    private readonly InAppNotificationService _service;

    public InAppNotificationServiceTests()
    {
        _repositoryMock = new Mock<IInAppNotificationRepository>();
        _loggerMock = new Mock<ILogger<InAppNotificationService>>();
        _service = new InAppNotificationService(_repositoryMock.Object, _loggerMock.Object);
    }

    [Fact]
    public async Task GetInboxAsync_WithValidParameters_ReturnsPageWithSnapshotAtUtc()
    {
        var tenantId = 2;
        var userId = 10;
        var queryParams = new NotificationInboxQueryParameters
        {
            PageNumber = 1,
            PageSize = 20,
            UnreadOnly = false
        };

        var expectedPage = new NotificationInboxPageDto
        {
            Items = new List<NotificationInboxItemDto>
            {
                new()
                {
                    Id = "101",
                    Title = "Invoice Overdue",
                    Message = "Invoice INV-001 is past due.",
                    CreatedAtUtc = DateTime.UtcNow,
                    IsRead = false,
                    Action = new NotificationActionDto { Module = "invoices", EntityId = "1" }
                }
            },
            TotalCount = 1,
            PageNumber = 1,
            PageSize = 20,
            SnapshotAtUtc = DateTime.UtcNow
        };

        _repositoryMock.Setup(r => r.GetInboxPageAsync(
            tenantId,
            userId,
            queryParams,
            It.IsAny<DateTime>(),
            It.IsAny<CancellationToken>()))
            .ReturnsAsync(expectedPage);

        var result = await _service.GetInboxAsync(tenantId, userId, queryParams);

        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.Single(result.Data.Items);
        Assert.Equal("101", result.Data.Items[0].Id);
        Assert.Equal("invoices", result.Data.Items[0].Action?.Module);
    }

    [Fact]
    public async Task GetInboxAsync_WithInvalidPagination_ReturnsBadRequestFailure()
    {
        var queryParams = new NotificationInboxQueryParameters { PageNumber = 0 };

        var result = await _service.GetInboxAsync(2, 10, queryParams);

        Assert.False(result.Success);
        Assert.Equal("INVALID_PAGINATION", result.ErrorCode);
    }

    [Fact]
    public async Task GetUnreadCountAsync_ReturnsAuthoritativeCount()
    {
        _repositoryMock.Setup(r => r.GetUnreadCountAsync(2, 10, It.IsAny<CancellationToken>()))
            .ReturnsAsync(5);

        var result = await _service.GetUnreadCountAsync(2, 10);

        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.Equal(5, result.Data.UnreadCount);
    }

    [Fact]
    public async Task MarkAsReadAsync_ExistingNotification_ReturnsSuccess()
    {
        _repositoryMock.Setup(r => r.MarkAsReadAsync(2, 10, 101, It.IsAny<DateTime>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var result = await _service.MarkAsReadAsync(2, 10, 101);

        Assert.True(result.Success);
        Assert.True(result.Data);
    }

    [Fact]
    public async Task MarkAsReadAsync_NonExistentOrUnowned_ReturnsNotFound()
    {
        _repositoryMock.Setup(r => r.MarkAsReadAsync(2, 10, 999, It.IsAny<DateTime>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        var result = await _service.MarkAsReadAsync(2, 10, 999);

        Assert.False(result.Success);
        Assert.Equal("NOT_FOUND", result.ErrorCode);
    }

    [Fact]
    public async Task MarkAllAsReadAsync_ValidCutoff_MarksMatchingUnread()
    {
        var cutoff = DateTime.UtcNow;

        _repositoryMock.Setup(r => r.MarkAllAsReadAsync(2, 10, cutoff, It.IsAny<DateTime>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var result = await _service.MarkAllAsReadAsync(2, 10, cutoff);

        Assert.True(result.Success);
        Assert.True(result.Data);
    }

    [Fact]
    public async Task MarkAllAsReadAsync_FutureCutoff_ReturnsInvalidCutoffError()
    {
        var futureCutoff = DateTime.UtcNow.AddHours(2);

        var result = await _service.MarkAllAsReadAsync(2, 10, futureCutoff);

        Assert.False(result.Success);
        Assert.Equal("INVALID_CUTOFF", result.ErrorCode);
    }

    [Fact]
    public async Task CreateInAppNotificationAsync_SanitizesHtmlAndEnforcesLimits()
    {
        InAppNotification? captured = null;
        _repositoryMock.Setup(r => r.CreateNotificationAsync(It.IsAny<InAppNotification>(), It.IsAny<CancellationToken>()))
            .Callback<InAppNotification, CancellationToken>((n, _) => captured = n)
            .ReturnsAsync((InAppNotification n, CancellationToken _) => n);

        var cmd = new CreateInAppNotificationCommand
        {
            TenantId = 2,
            RecipientUserId = 10,
            EventType = "PaymentReceived",
            EventDeduplicationId = "pay_rec_99",
            Title = "<b>Payment</b> Received",
            Message = "<p>Your payment was recorded.</p>",
            ActionModule = "payments",
            ActionEntityId = "99"
        };

        var result = await _service.CreateInAppNotificationAsync(cmd);

        Assert.True(result.Success);
        Assert.NotNull(captured);
        Assert.Equal("Payment Received", captured.Title);
        Assert.Equal("Your payment was recorded.", captured.Message);
        Assert.NotNull(captured.ExpiresAtUtc);
    }
}
