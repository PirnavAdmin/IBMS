using System.Text.Json;
using Billing.Application.Interfaces;
using Billing.Domain.Entities;
using Microsoft.Extensions.Logging;

namespace Billing.Application.Services;

public class AuditService : IAuditService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = false,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly IAuditLogRepository _auditLogRepository;
    private readonly ILogger<AuditService> _logger;

    public AuditService(
        IAuditLogRepository auditLogRepository,
        ILogger<AuditService> logger)
    {
        _auditLogRepository = auditLogRepository;
        _logger = logger;
    }

    public async Task RecordCustomerCreatedAsync(
        int tenantId,
        int customerId,
        string customerName,
        string userId,
        string userName,
        object customerData,
        string? ipAddress = null,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var log = new AuditLog
            {
                TenantId = tenantId <= 0 ? 1 : tenantId,
                CustomerId = customerId,
                EntityName = "Customer",
                EntityId = customerId.ToString(),
                Action = "CREATE",
                UserId = string.IsNullOrWhiteSpace(userId) ? "System" : userId.Trim(),
                UserName = string.IsNullOrWhiteSpace(userName) ? "System User" : userName.Trim(),
                Timestamp = DateTime.UtcNow,
                Changes = SerializeData(customerData),
                IpAddress = ipAddress
            };

            await _auditLogRepository.AddAsync(log, cancellationToken);
            _logger.LogInformation("Audit log recorded: CREATE Customer {CustomerId} by user {UserId}", customerId, userId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to record CREATE audit log for Customer {CustomerId}", customerId);
        }
    }

    public async Task RecordCustomerUpdatedAsync(
        int tenantId,
        int customerId,
        string customerName,
        string userId,
        string userName,
        object changes,
        string? ipAddress = null,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var log = new AuditLog
            {
                TenantId = tenantId <= 0 ? 1 : tenantId,
                CustomerId = customerId,
                EntityName = "Customer",
                EntityId = customerId.ToString(),
                Action = "UPDATE",
                UserId = string.IsNullOrWhiteSpace(userId) ? "System" : userId.Trim(),
                UserName = string.IsNullOrWhiteSpace(userName) ? "System User" : userName.Trim(),
                Timestamp = DateTime.UtcNow,
                Changes = SerializeData(changes),
                IpAddress = ipAddress
            };

            await _auditLogRepository.AddAsync(log, cancellationToken);
            _logger.LogInformation("Audit log recorded: UPDATE Customer {CustomerId} by user {UserId}", customerId, userId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to record UPDATE audit log for Customer {CustomerId}", customerId);
        }
    }

    public async Task RecordCustomerDeactivatedAsync(
        int tenantId,
        int customerId,
        string customerName,
        string userId,
        string userName,
        string? reason = null,
        string? ipAddress = null,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var details = new
            {
                Status = "Inactive",
                IsActive = false,
                Reason = reason ?? "Customer deactivated via customer management",
                TimestampUtc = DateTime.UtcNow
            };

            var log = new AuditLog
            {
                TenantId = tenantId <= 0 ? 1 : tenantId,
                CustomerId = customerId,
                EntityName = "Customer",
                EntityId = customerId.ToString(),
                Action = "DEACTIVATE",
                UserId = string.IsNullOrWhiteSpace(userId) ? "System" : userId.Trim(),
                UserName = string.IsNullOrWhiteSpace(userName) ? "System User" : userName.Trim(),
                Timestamp = DateTime.UtcNow,
                Changes = SerializeData(details),
                IpAddress = ipAddress
            };

            await _auditLogRepository.AddAsync(log, cancellationToken);
            _logger.LogInformation("Audit log recorded: DEACTIVATE Customer {CustomerId} by user {UserId}", customerId, userId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to record DEACTIVATE audit log for Customer {CustomerId}", customerId);
        }
    }

    public async Task<List<AuditLog>> GetCustomerAuditHistoryAsync(
        int tenantId,
        int customerId,
        CancellationToken cancellationToken = default)
    {
        var resolvedTenantId = tenantId <= 0 ? 1 : tenantId;
        return await _auditLogRepository.GetByCustomerIdAsync(resolvedTenantId, customerId, cancellationToken);
    }

    private static string SerializeData(object? data)
    {
        if (data == null)
        {
            return "{}";
        }

        if (data is string str)
        {
            return str;
        }

        try
        {
            return JsonSerializer.Serialize(data, JsonOptions);
        }
        catch
        {
            return data.ToString() ?? "{}";
        }
    }
}
