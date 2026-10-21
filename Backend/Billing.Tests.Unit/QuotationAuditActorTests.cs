using System.Security.Claims;
using Billing.API.Controllers;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Quotation;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Billing.Tests.Unit;

public class QuotationAuditActorTests
{
    [Theory]
    [InlineData("Acme Admin", "admin@example.com", "Acme Admin")]
    [InlineData(null, "admin@example.com", "admin@example.com")]
    [InlineData(null, null, "42")]
    public async Task QuotationChanges_PassActorNameSeparatelyFromTenantId(string? name, string? email, string expectedActor)
    {
        var quotations = new Mock<IQuotationService>();
        var actions = new Mock<IQuotationActionService>();
        var controller = CreateController(quotations, actions, name, email, includeTenant: true);
        var detail = ApiResponse<QuotationDetailResponse>.Ok(new QuotationDetailResponse { Id = 7 });
        quotations.Setup(s => s.CreateDraftAsync(It.IsAny<CreateQuotationRequest>(), 2, expectedActor)).ReturnsAsync(detail);
        quotations.Setup(s => s.UpdateDraftAsync(7, It.IsAny<UpdateQuotationRequest>(), 2, expectedActor)).ReturnsAsync(detail);
        actions.Setup(s => s.SendQuotationAsync(7, 2, expectedActor)).ReturnsAsync(ApiResponse<bool>.Ok(true));
        actions.Setup(s => s.ApproveQuotationAsync(7, 2, expectedActor, null)).ReturnsAsync(ApiResponse<bool>.Ok(true));
        actions.Setup(s => s.CancelQuotationAsync(7, 2, "Reason", expectedActor)).ReturnsAsync(ApiResponse<bool>.Ok(true));
        actions.Setup(s => s.ConvertToInvoiceAsync(7, 2, expectedActor)).ReturnsAsync(ApiResponse<int>.Ok(9));

        Assert.IsType<CreatedAtActionResult>(await controller.CreateDraftQuotation(new CreateQuotationRequest()));
        Assert.IsType<OkObjectResult>(await controller.UpdateDraftQuotation(7, new UpdateQuotationRequest()));
        Assert.IsType<OkObjectResult>(await controller.SendQuotation(7));
        Assert.IsType<OkObjectResult>(await controller.ApproveQuotation(7));
        Assert.IsType<OkObjectResult>(await controller.CancelQuotation(7, new CancelQuotationRequest { Reason = "Reason" }));
        Assert.IsType<OkObjectResult>(await controller.ConvertQuotation(7));

        quotations.Verify(s => s.CreateDraftAsync(It.IsAny<CreateQuotationRequest>(), 2, expectedActor), Times.Once);
        quotations.Verify(s => s.UpdateDraftAsync(7, It.IsAny<UpdateQuotationRequest>(), 2, expectedActor), Times.Once);
        actions.Verify(s => s.SendQuotationAsync(7, 2, expectedActor), Times.Once);
        actions.Verify(s => s.ApproveQuotationAsync(7, 2, expectedActor, null), Times.Once);
        actions.Verify(s => s.CancelQuotationAsync(7, 2, "Reason", expectedActor), Times.Once);
        actions.Verify(s => s.ConvertToInvoiceAsync(7, 2, expectedActor), Times.Once);
    }

    [Fact]
    public async Task MissingTenantClaim_StillForbidsStatusChange()
    {
        var quotations = new Mock<IQuotationService>();
        var actions = new Mock<IQuotationActionService>();
        var controller = CreateController(quotations, actions, "Acme Admin", null, includeTenant: false);
        Assert.IsType<ForbidResult>(await controller.SendQuotation(7));
        actions.VerifyNoOtherCalls();
    }

    private static QuotationsController CreateController(Mock<IQuotationService> quotations,
        Mock<IQuotationActionService> actions, string? name, string? email, bool includeTenant)
    {
        var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, "42"), new(ClaimTypes.Role, "TenantAdmin") };
        if (includeTenant) claims.Add(new Claim("TenantId", "2"));
        if (name != null) claims.Add(new Claim(ClaimTypes.Name, name));
        if (email != null) claims.Add(new Claim(ClaimTypes.Email, email));
        return new QuotationsController(quotations.Object, actions.Object, NullLogger<QuotationsController>.Instance)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Test")) }
            }
        };
    }
}
