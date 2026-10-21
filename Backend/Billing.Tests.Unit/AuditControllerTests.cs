using System.Security.Claims;
using Billing.API.Controllers;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace Billing.Tests.Unit;

public class AuditControllerTests
{
    [Fact]
    public async Task GetFilterOptions_ReturnsSuccessResult_WithDistinctOptionsForTenant()
    {
        var mockService = new Mock<IAuditService>();
        var expectedOptions = new AuditFilterOptionsResponse
        {
            EntityNames = new List<string> { "Customer", "Invoice", "Quotation" },
            Actions = new List<string> { "CREATE", "ISSUE", "UPDATE" },
            UserNames = new List<string> { "Alice", "Bob" }
        };

        mockService.Setup(s => s.GetTenantFilterOptionsAsync(2, It.IsAny<CancellationToken>()))
            .ReturnsAsync(expectedOptions);

        var controller = CreateController(mockService.Object, tenantId: 2);

        var actionResult = await controller.GetFilterOptions(CancellationToken.None);

        var okResult = Assert.IsType<OkObjectResult>(actionResult);
        var response = Assert.IsType<ApiResponse<AuditFilterOptionsResponse>>(okResult.Value);

        Assert.True(response.Success);
        Assert.NotNull(response.Data);
        Assert.Equal(expectedOptions.EntityNames, response.Data.EntityNames);
        Assert.Equal(expectedOptions.Actions, response.Data.Actions);
        Assert.Equal(expectedOptions.UserNames, response.Data.UserNames);
        Assert.Equal(expectedOptions.Modules, response.Data.Modules);
        Assert.Equal(expectedOptions.EventNames, response.Data.EventNames);
        Assert.Equal(expectedOptions.PerformedBy, response.Data.PerformedBy);

        mockService.Verify(s => s.GetTenantFilterOptionsAsync(2, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task GetFilterOptions_ReturnsForbid_WhenTenantClaimIsMissing()
    {
        var mockService = new Mock<IAuditService>();
        var controller = CreateController(mockService.Object, tenantId: null);

        var actionResult = await controller.GetFilterOptions(CancellationToken.None);

        Assert.IsType<ForbidResult>(actionResult);
        mockService.VerifyNoOtherCalls();
    }

    private static AuditController CreateController(IAuditService auditService, int? tenantId)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, "42"),
            new(ClaimTypes.Name, "Test User")
        };

        if (tenantId.HasValue)
        {
            claims.Add(new Claim("TenantId", tenantId.Value.ToString()));
        }

        return new AuditController(auditService)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth"))
                }
            }
        };
    }
}
