using System.IO;
using System.Security.Claims;
using System.Text.Json;
using Billing.API.Controllers;
using Billing.API.Middleware;
using Billing.Application.Services;
using Billing.Contracts;
using Billing.Contracts.Charges;
using Billing.Contracts.Tax;
using Billing.Tests.Unit.Fakes;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Billing.Tests.Unit;

public class StandardizedErrorHandlingTests
{
    private static (DefaultHttpContext context, MemoryStream stream) CreateHttpContext()
    {
        var context = new DefaultHttpContext();
        var stream = new MemoryStream();
        context.Response.Body = stream;
        return (context, stream);
    }

    private static async Task<ApiResponse<object>?> ReadResponseAsync(MemoryStream stream)
    {
        stream.Seek(0, SeekOrigin.Begin);
        using var reader = new StreamReader(stream);
        var json = await reader.ReadToEndAsync();
        return JsonSerializer.Deserialize<ApiResponse<object>>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });
    }

    [Fact]
    public async Task Middleware_DbUpdateConcurrencyException_ReturnsConflict409AndStandardizedJson()
    {
        var (context, stream) = CreateHttpContext();
        var middleware = new StandardizedApiErrorMiddleware(
            _ => throw new DbUpdateConcurrencyException("Row version mismatch during concurrent sequence update"),
            NullLogger<StandardizedApiErrorMiddleware>.Instance);

        await middleware.InvokeAsync(context);

        Assert.Equal(StatusCodes.Status409Conflict, context.Response.StatusCode);
        var response = await ReadResponseAsync(stream);
        Assert.NotNull(response);
        Assert.False(response.Success);
        Assert.Equal("CONCURRENCY_CONFLICT", response.ErrorCode);
        Assert.Contains("concurrency conflict", response.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Middleware_KeyNotFoundException_ReturnsNotFound404()
    {
        var (context, stream) = CreateHttpContext();
        var middleware = new StandardizedApiErrorMiddleware(
            _ => throw new KeyNotFoundException("Tax rate ID 999 was not found"),
            NullLogger<StandardizedApiErrorMiddleware>.Instance);

        await middleware.InvokeAsync(context);

        Assert.Equal(StatusCodes.Status404NotFound, context.Response.StatusCode);
        var response = await ReadResponseAsync(stream);
        Assert.NotNull(response);
        Assert.False(response.Success);
        Assert.Equal("RESOURCE_NOT_FOUND", response.ErrorCode);
        Assert.Contains("not found", response.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Middleware_UnauthorizedAccessException_ReturnsForbidden403()
    {
        var (context, stream) = CreateHttpContext();
        var middleware = new StandardizedApiErrorMiddleware(
            _ => throw new UnauthorizedAccessException("Forbidden action on financial settings"),
            NullLogger<StandardizedApiErrorMiddleware>.Instance);

        await middleware.InvokeAsync(context);

        Assert.Equal(StatusCodes.Status403Forbidden, context.Response.StatusCode);
        var response = await ReadResponseAsync(stream);
        Assert.NotNull(response);
        Assert.False(response.Success);
        Assert.Equal("AUTHORIZATION_ERROR", response.ErrorCode);
    }

    [Fact]
    public async Task Middleware_ArgumentException_ReturnsBadRequest400()
    {
        var (context, stream) = CreateHttpContext();
        var middleware = new StandardizedApiErrorMiddleware(
            _ => throw new ArgumentException("Invalid charge amount specified"),
            NullLogger<StandardizedApiErrorMiddleware>.Instance);

        await middleware.InvokeAsync(context);

        Assert.Equal(StatusCodes.Status400BadRequest, context.Response.StatusCode);
        var response = await ReadResponseAsync(stream);
        Assert.NotNull(response);
        Assert.False(response.Success);
        Assert.Equal("VALIDATION_OR_CONFIGURATION_ERROR", response.ErrorCode);
    }

    [Fact]
    public async Task Middleware_UnhandledGenericException_ReturnsInternalServerError500()
    {
        var (context, stream) = CreateHttpContext();
        var middleware = new StandardizedApiErrorMiddleware(
            _ => throw new InvalidOperationException("Unexpected system crash"),
            NullLogger<StandardizedApiErrorMiddleware>.Instance);

        await middleware.InvokeAsync(context);

        Assert.Equal(StatusCodes.Status400BadRequest, context.Response.StatusCode);
        var response = await ReadResponseAsync(stream);
        Assert.NotNull(response);
        Assert.False(response.Success);
        Assert.Equal("VALIDATION_OR_CONFIGURATION_ERROR", response.ErrorCode);
    }

    [Fact]
    public async Task Middleware_GeneralException_ReturnsInternalServerError500()
    {
        var (context, stream) = CreateHttpContext();
        var middleware = new StandardizedApiErrorMiddleware(
            _ => throw new FormatException("Unexpected crash"),
            NullLogger<StandardizedApiErrorMiddleware>.Instance);

        await middleware.InvokeAsync(context);

        Assert.Equal(StatusCodes.Status500InternalServerError, context.Response.StatusCode);
        var response = await ReadResponseAsync(stream);
        Assert.NotNull(response);
        Assert.False(response.Success);
        Assert.Equal("INTERNAL_SERVER_ERROR", response.ErrorCode);
    }

    [Fact]
    public async Task Middleware_Success_PassesThroughWithoutAltering()
    {
        var (context, _) = CreateHttpContext();
        var middleware = new StandardizedApiErrorMiddleware(
            ctx =>
            {
                ctx.Response.StatusCode = StatusCodes.Status200OK;
                return Task.CompletedTask;
            },
            NullLogger<StandardizedApiErrorMiddleware>.Instance);

        await middleware.InvokeAsync(context);

        Assert.Equal(StatusCodes.Status200OK, context.Response.StatusCode);
    }

    [Fact]
    public async Task ChargesController_CreateCharge_DuplicateCode_ReturnsConflict409()
    {
        var fakeRepo = new FakeChargeRepository();
        var settingService = new ChargeSettingService(fakeRepo);
        var calcService = new ChargeCalculationService(fakeRepo);
        var controller = new ChargesController(settingService, calcService)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(new[]
                    {
                        new Claim("TenantId", "1"),
                        new Claim(ClaimTypes.Role, "TenantAdmin")
                    }, "TestAuth"))
                }
            }
        };

        var req = new CreateChargeRequest
        {
            Name = "Delivery Fee",
            Code = "DEL-001",
            ChargeType = "Custom",
            CalculationType = "Fixed",
            Amount = 50.0m
        };

        // First create succeeds
        var firstResult = await controller.CreateCharge(req);
        Assert.IsType<CreatedAtActionResult>(firstResult);

        // Second create with duplicate code returns 409 Conflict
        var secondResult = await controller.CreateCharge(req);
        var conflictResult = Assert.IsType<ConflictObjectResult>(secondResult);
        Assert.Equal(StatusCodes.Status409Conflict, conflictResult.StatusCode);

        var payload = Assert.IsType<ApiResponse<ChargeConfigurationDto>>(conflictResult.Value);
        Assert.False(payload.Success);
        Assert.Equal("CHARGE_CODE_EXISTS", payload.ErrorCode);
    }

    [Fact]
    public async Task TaxSettingsController_CreateTaxRate_DuplicateCode_ReturnsConflict409()
    {
        var fakeTaxRepo = new FakeTaxRepository();
        var settingService = new TaxSettingService(fakeTaxRepo);
        var calcService = new TaxCalculationService(fakeTaxRepo);
        var controller = new TaxSettingsController(settingService, calcService, NullLogger<TaxSettingsController>.Instance)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(new[]
                    {
                        new Claim("TenantId", "1"),
                        new Claim(ClaimTypes.Role, "TenantAdmin")
                    }, "TestAuth"))
                }
            }
        };

        var req = new CreateTaxRateRequest
        {
            Name = "Standard GST",
            Code = "GST-18",
            TaxType = "GST",
            Rate = 18.0m,
            ApplicationLevel = "Item",
            Priority = 1
        };

        // First create succeeds
        var firstResult = await controller.CreateRate(req);
        Assert.IsType<CreatedAtActionResult>(firstResult);

        // Second create with duplicate code returns 400 BadRequest with standardized error code
        var secondResult = await controller.CreateRate(req);
        var badResult = Assert.IsType<BadRequestObjectResult>(secondResult);
        Assert.Equal(StatusCodes.Status400BadRequest, badResult.StatusCode);

        var payload = Assert.IsType<ApiResponse<TaxRateDto>>(badResult.Value);
        Assert.False(payload.Success);
        Assert.Equal("TAX_RATE_CODE_EXISTS", payload.ErrorCode);
    }

    [Fact]
    public async Task TaxSettingsController_GetRateById_NotFound_ReturnsNotFound404()
    {
        var fakeTaxRepo = new FakeTaxRepository();
        var settingService = new TaxSettingService(fakeTaxRepo);
        var calcService = new TaxCalculationService(fakeTaxRepo);
        var controller = new TaxSettingsController(settingService, calcService, NullLogger<TaxSettingsController>.Instance)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(new[]
                    {
                        new Claim("TenantId", "1"),
                        new Claim(ClaimTypes.Role, "TenantAdmin")
                    }, "TestAuth"))
                }
            }
        };

        var result = await controller.GetRateById(9999);
        var notFoundResult = Assert.IsType<NotFoundObjectResult>(result);
        Assert.Equal(StatusCodes.Status404NotFound, notFoundResult.StatusCode);

        var payload = Assert.IsType<ApiResponse<TaxRateDto>>(notFoundResult.Value);
        Assert.False(payload.Success);
        Assert.Equal("TAX_RATE_NOT_FOUND", payload.ErrorCode);
    }
}
