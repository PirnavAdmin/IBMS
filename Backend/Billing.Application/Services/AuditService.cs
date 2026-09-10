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
        string userName,
        object customerData,
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
                UserName = string.IsNullOrWhiteSpace(userName) ? "System User" : userName.Trim(),
                Timestamp = DateTime.UtcNow,
                Changes = "Customer created"
            };

            await _auditLogRepository.AddAsync(log, cancellationToken);
            _logger.LogInformation("Audit log recorded: CREATE Customer {CustomerId} by user {UserName}", customerId, log.UserName);
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
        string userName,
        object changes,
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
                UserName = string.IsNullOrWhiteSpace(userName) ? "System User" : userName.Trim(),
                Timestamp = DateTime.UtcNow,
                Changes = FormatUpdateChanges(changes)
            };

            await _auditLogRepository.AddAsync(log, cancellationToken);
            _logger.LogInformation("Audit log recorded: UPDATE Customer {CustomerId} by user {UserName}", customerId, log.UserName);
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
        string userName,
        string? reason = null,
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
                Action = "DEACTIVATE",
                UserName = string.IsNullOrWhiteSpace(userName) ? "System User" : userName.Trim(),
                Timestamp = DateTime.UtcNow,
                Changes = string.IsNullOrWhiteSpace(reason) ? "Customer deactivated" : $"Customer deactivated: {reason}"
            };

            await _auditLogRepository.AddAsync(log, cancellationToken);
            _logger.LogInformation("Audit log recorded: DEACTIVATE Customer {CustomerId} by user {UserName}", customerId, log.UserName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to record DEACTIVATE audit log for Customer {CustomerId}", customerId);
        }
    }

    private static string FormatUpdateChanges(object changes)
    {
        if (changes == null) return "Customer updated";
        if (changes is string str) return str;

        var modifiedFields = new List<string>();

        if (changes is Billing.Contracts.UpdateCustomerRequest req)
        {
            if (!string.IsNullOrWhiteSpace(req.Name)) modifiedFields.Add("Name");
            if (!string.IsNullOrWhiteSpace(req.Email)) modifiedFields.Add("Email");
            if (!string.IsNullOrWhiteSpace(req.Phone)) modifiedFields.Add("Phone");
            if (!string.IsNullOrWhiteSpace(req.CompanyName)) modifiedFields.Add("Company Name");
            if (!string.IsNullOrWhiteSpace(req.TaxId)) modifiedFields.Add("Tax ID");
            if (!string.IsNullOrWhiteSpace(req.Address)) modifiedFields.Add("Address");
            if (!string.IsNullOrWhiteSpace(req.City)) modifiedFields.Add("City");
            if (!string.IsNullOrWhiteSpace(req.State)) modifiedFields.Add("State");
            if (!string.IsNullOrWhiteSpace(req.PostalCode)) modifiedFields.Add("Postal Code");
            if (!string.IsNullOrWhiteSpace(req.Country)) modifiedFields.Add("Country");
            if (!string.IsNullOrWhiteSpace(req.Website)) modifiedFields.Add("Website");
            if (!string.IsNullOrWhiteSpace(req.Notes)) modifiedFields.Add("Notes");
            if (!string.IsNullOrWhiteSpace(req.Currency)) modifiedFields.Add("Currency");
            if (!string.IsNullOrWhiteSpace(req.PaymentTerms)) modifiedFields.Add("Payment Terms");
            if (!string.IsNullOrWhiteSpace(req.Status)) modifiedFields.Add("Status");
            if (req.Addresses != null && req.Addresses.Any()) modifiedFields.Add("Addresses");
        }
        else
        {
            var props = changes.GetType().GetProperties();
            foreach (var prop in props)
            {
                var val = prop.GetValue(changes);
                if (val != null) modifiedFields.Add(prop.Name);
            }
        }

        if (!modifiedFields.Any()) return "Customer updated";
        return $"{string.Join(", ", modifiedFields)} updated";
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
