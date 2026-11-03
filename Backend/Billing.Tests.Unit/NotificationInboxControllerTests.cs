using System.Security.Claims;
using Billing.API.Controllers;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Notification;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace Billing.Tests.Unit;

public class NotificationInboxControllerTests
{
    private readonly Mock<IInAppNotificationService> _serviceMock;
    private readonly Mock<ILogger<NotificationInboxController>> _loggerMock;

    public NotificationInboxControllerTests()
    {
        _serviceMock = new Mock<IInAppNotificationService>();
        _loggerMock = new Mock<ILogger<NotificationInboxController>>();
    }

    private NotificationInboxController CreateController(int? userId = 10, int? tenantId = 2, string role = "User", string? headerTenantId = null)
    {
        var controller = new NotificationInboxController(_serviceMock.Object, _loggerMock.Object);
        var claims = new List<Claim>();

        if (userId.HasValue)
        {
            claims.Add(new Claim(ClaimTypes.NameIdentifier, userId.Value.ToString()));
            claims.Add(new Claim("UserId", userId.Value.ToString()));
        }

        if (tenantId.HasValue)
        {
            claims.Add(new Claim("TenantId", tenantId.Value.ToString()));
        }

        if (!string.IsNullOrEmpty(role))
        {
            claims.Add(new Claim(ClaimTypes.Role, role));
        }

        var identity = new ClaimsIdentity(claims, "TestAuth");
        var principal = new ClaimsPrincipal(identity);

        var httpContext = new DefaultHttpContext { User = principal };
        if (!string.IsNullOrEmpty(headerTenantId))
        {
            httpContext.Request.Headers["X-Tenant-Id"] = headerTenantId;
        }

        controller.ControllerContext = new ControllerContext
        {
            HttpContext = httpContext
        };

        return controller;
    }

    [Fact]
    public async Task GetInbox_AuthenticatedUser_ReturnsOk()
    {
        var controller = CreateController(userId: 10, tenantId: 2);
        var queryParams = new NotificationInboxQueryParameters();

        var expectedDto = new NotificationInboxPageDto
        {
            Items = new List<NotificationInboxItemDto>
            {
                new() { Id = "1", Title = "Overdue", Message = "Invoice INV-1 overdue", CreatedAtUtc = DateTime.UtcNow }
            },
            TotalCount = 1,
            PageNumber = 1,
            PageSize = 20,
            SnapshotAtUtc = DateTime.UtcNow
        };

        _serviceMock.Setup(s => s.GetInboxAsync(2, 10, queryParams, It.IsAny<CancellationToken>()))
            .ReturnsAsync(ApiResponse<NotificationInboxPageDto>.Ok(expectedDto));

        var result = await controller.GetInbox(queryParams, CancellationToken.None);

        var okResult = Assert.IsType<OkObjectResult>(result);
        var apiResponse = Assert.IsType<ApiResponse<NotificationInboxPageDto>>(okResult.Value);
        Assert.True(apiResponse.Success);
        Assert.Equal(1, apiResponse.Data?.TotalCount);
    }

    [Fact]
    public async Task GetInbox_MissingTenantOrUserId_ReturnsForbidden()
    {
        var controller = CreateController(userId: null, tenantId: null);
        var queryParams = new NotificationInboxQueryParameters();

        var result = await controller.GetInbox(queryParams, CancellationToken.None);

        var objResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, objResult.StatusCode);
    }

    [Fact]
    public async Task GetUnreadCount_AuthenticatedUser_ReturnsOk()
    {
        var controller = CreateController(userId: 10, tenantId: 2);

        _serviceMock.Setup(s => s.GetUnreadCountAsync(2, 10, It.IsAny<CancellationToken>()))
            .ReturnsAsync(ApiResponse<NotificationUnreadCountDto>.Ok(new NotificationUnreadCountDto { UnreadCount = 4 }));

        var result = await controller.GetUnreadCount(CancellationToken.None);

        var okResult = Assert.IsType<OkObjectResult>(result);
        var apiResponse = Assert.IsType<ApiResponse<NotificationUnreadCountDto>>(okResult.Value);
        Assert.True(apiResponse.Success);
        Assert.Equal(4, apiResponse.Data?.UnreadCount);
    }

    [Fact]
    public async Task MarkRead_ExistingNotification_ReturnsOk()
    {
        var controller = CreateController(userId: 10, tenantId: 2);

        _serviceMock.Setup(s => s.MarkAsReadAsync(2, 10, 101, It.IsAny<CancellationToken>()))
            .ReturnsAsync(ApiResponse<bool>.Ok(true));

        var result = await controller.MarkRead("101", CancellationToken.None);

        var okResult = Assert.IsType<OkObjectResult>(result);
        var apiResponse = Assert.IsType<ApiResponse<bool>>(okResult.Value);
        Assert.True(apiResponse.Success);
        Assert.True(apiResponse.Data);
    }

    [Fact]
    public async Task MarkRead_NotFoundOrNotOwned_ReturnsNotFound()
    {
        var controller = CreateController(userId: 10, tenantId: 2);

        _serviceMock.Setup(s => s.MarkAsReadAsync(2, 10, 999, It.IsAny<CancellationToken>()))
            .ReturnsAsync(ApiResponse<bool>.Fail("Notification not found.", errorCode: "NOT_FOUND"));

        var result = await controller.MarkRead("999", CancellationToken.None);

        var notFoundResult = Assert.IsType<NotFoundObjectResult>(result);
        var apiResponse = Assert.IsType<ApiResponse<bool>>(notFoundResult.Value);
        Assert.False(apiResponse.Success);
        Assert.Equal("NOT_FOUND", apiResponse.ErrorCode);
    }

    [Fact]
    public async Task MarkAllRead_ValidCutoff_ReturnsOk()
    {
        var controller = CreateController(userId: 10, tenantId: 2);
        var cutoff = DateTime.UtcNow;
        var request = new MarkAllNotificationsReadRequest { ThroughCreatedAtUtc = cutoff };

        _serviceMock.Setup(s => s.MarkAllAsReadAsync(2, 10, cutoff, It.IsAny<CancellationToken>()))
            .ReturnsAsync(ApiResponse<bool>.Ok(true));

        var result = await controller.MarkAllRead(request, CancellationToken.None);

        var okResult = Assert.IsType<OkObjectResult>(result);
        var apiResponse = Assert.IsType<ApiResponse<bool>>(okResult.Value);
        Assert.True(apiResponse.Success);
        Assert.True(apiResponse.Data);
    }

    [Fact]
    public async Task MarkAllRead_EmptyRequest_ReturnsBadRequest()
    {
        var controller = CreateController(userId: 10, tenantId: 2);
        var request = new MarkAllNotificationsReadRequest { ThroughCreatedAtUtc = default };

        var result = await controller.MarkAllRead(request, CancellationToken.None);

        var badRequestResult = Assert.IsType<BadRequestObjectResult>(result);
        var apiResponse = Assert.IsType<ApiResponse<bool>>(badRequestResult.Value);
        Assert.False(apiResponse.Success);
        Assert.Equal("INVALID_CUTOFF", apiResponse.ErrorCode);
    }
}
