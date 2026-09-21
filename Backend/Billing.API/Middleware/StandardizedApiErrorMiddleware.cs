using System.Net;
using System.Text.Json;
using Billing.Contracts;
using Microsoft.EntityFrameworkCore;

namespace Billing.API.Middleware;

public class StandardizedApiErrorMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<StandardizedApiErrorMiddleware> _logger;

    public StandardizedApiErrorMiddleware(RequestDelegate next, ILogger<StandardizedApiErrorMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception intercepted by StandardizedApiErrorMiddleware: {Message}", ex.Message);
            await HandleExceptionAsync(context, ex);
        }
    }

    private static Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        context.Response.ContentType = "application/json";

        var (statusCode, message, errorCode) = exception switch
        {
            DbUpdateConcurrencyException => (
                HttpStatusCode.Conflict,
                "A concurrency conflict occurred. The requested resource was updated or locked concurrently. Please retry the operation.",
                "CONCURRENCY_CONFLICT"
            ),
            KeyNotFoundException => (
                HttpStatusCode.NotFound,
                exception.Message,
                "RESOURCE_NOT_FOUND"
            ),
            UnauthorizedAccessException => (
                HttpStatusCode.Forbidden,
                "You are not authorized to access or modify this financial configuration.",
                "AUTHORIZATION_ERROR"
            ),
            ArgumentException or InvalidOperationException => (
                HttpStatusCode.BadRequest,
                exception.Message,
                "VALIDATION_OR_CONFIGURATION_ERROR"
            ),
            _ => (
                HttpStatusCode.InternalServerError,
                "An unexpected server error occurred while processing financial configuration.",
                "INTERNAL_SERVER_ERROR"
            )
        };

        context.Response.StatusCode = (int)statusCode;

        var response = ApiResponse<object>.Fail(message, exception.Message, errorCode);
        var json = JsonSerializer.Serialize(response, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = false
        });

        return context.Response.WriteAsync(json);
    }
}
