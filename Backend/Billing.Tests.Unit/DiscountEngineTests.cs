using System.Security.Claims;
using Billing.API.Controllers;
using Billing.Application.Interfaces;
using Billing.Application.Services;
using Billing.Contracts;
using Billing.Contracts.Discount;
using Billing.Domain.Entities;
using Billing.Domain.Enums;
using Billing.Tests.Unit.Fakes;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Billing.Tests.Unit;

public class DiscountEngineTests
{
    private readonly FakeDiscountRuleRepository _ruleRepository;
    private readonly FakeAuditLogRepo _auditLogRepository;
    private readonly DiscountService _discountService;
    private readonly DiscountsController _controller;

    public DiscountEngineTests()
    {
        _ruleRepository = new FakeDiscountRuleRepository();
        _auditLogRepository = new FakeAuditLogRepo();
        _discountService = new DiscountService(
            _ruleRepository,
            _auditLogRepository,
            NullLogger<DiscountService>.Instance
        );
        _controller = new DiscountsController(_discountService);
        SetUserContext(_controller, tenantId: 1, role: "TenantAdmin", email: "admin@ibms.com", userName: "AdminUser");
    }

    private static void SetUserContext(ControllerBase controller, int tenantId, string role, string email, string userName = "TestUser")
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, "1"),
            new(ClaimTypes.Email, email),
            new(ClaimTypes.Name, userName),
            new(ClaimTypes.Role, role),
            new("TenantId", tenantId.ToString()),
            new("tenant_id", tenantId.ToString())
        };

        var identity = new ClaimsIdentity(claims, "TestAuth");
        var principal = new ClaimsPrincipal(identity);

        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = principal }
        };
    }

    private static string GetFirstError<T>(ApiResponse<T> response)
    {
        return response.Errors?.FirstOrDefault() ?? response.Message ?? string.Empty;
    }

    private class FakeAuditLogRepo : IAuditLogRepository
    {
        public List<AuditLog> Logs { get; } = new();

        public Task AddAsync(AuditLog log, CancellationToken cancellationToken = default)
        {
            log.Id = Logs.Count + 1;
            Logs.Add(log);
            return Task.CompletedTask;
        }

        public Task<List<AuditLog>> GetByCustomerIdAsync(int tenantId, int customerId, CancellationToken cancellationToken = default)
        {
            return Task.FromResult(Logs.Where(l => l.TenantId == tenantId && l.CustomerId == customerId).ToList());
        }

        public Task<List<AuditLog>> GetByEntityAsync(int tenantId, string entityName, string entityId, CancellationToken cancellationToken = default)
        {
            return Task.FromResult(Logs.Where(l => l.TenantId == tenantId && l.EntityName == entityName && l.EntityId == entityId).ToList());
        }

        public Task<(List<AuditLog> Items, int TotalCount)> GetPagedAsync(int tenantId, int page, int pageSize, CancellationToken cancellationToken = default)
        {
            var filtered = Logs.Where(l => l.TenantId == tenantId).ToList();
            return Task.FromResult((filtered.Skip((page - 1) * pageSize).Take(pageSize).ToList(), filtered.Count));
        }

        public Task<(List<AuditLog> Items, int TotalCount)> GetFilteredPagedAsync(int tenantId, Billing.Contracts.AuditLogFilterRequest filter, CancellationToken cancellationToken = default)
        {
            var filtered = Logs.Where(l => l.TenantId == tenantId).ToList();
            var page = filter.Page <= 0 ? 1 : filter.Page;
            var pageSize = filter.PageSize <= 0 ? 10 : filter.PageSize;
            return Task.FromResult((filtered.Skip((page - 1) * pageSize).Take(pageSize).ToList(), filtered.Count));
        }

        public Task<Billing.Contracts.AuditFilterOptionsResponse> GetFilterOptionsAsync(int tenantId, CancellationToken cancellationToken = default)
        {
            var tenantLogs = Logs.Where(l => l.TenantId == tenantId).ToList();
            var entityNames = tenantLogs.Where(l => !string.IsNullOrWhiteSpace(l.EntityName)).Select(l => l.EntityName.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(x => x).ToList();
            var actions = tenantLogs.Where(l => !string.IsNullOrWhiteSpace(l.Action)).Select(l => l.Action.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(x => x).ToList();
            var userNames = tenantLogs.Where(l => !string.IsNullOrWhiteSpace(l.UserName)).Select(l => l.UserName.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(x => x).ToList();

            return Task.FromResult(new Billing.Contracts.AuditFilterOptionsResponse
            {
                EntityNames = entityNames,
                Actions = actions,
                UserNames = userNames
            });
        }
    }

    #region IBMSBE-006: Discount Models and DTOs

    [Fact]
    public void IBMSBE_006_Enum_Values_Match_Specification()
    {
        Assert.Equal(1, (int)DiscountType.Percentage);
        Assert.Equal(2, (int)DiscountType.FixedAmount);

        Assert.Equal(1, (int)DiscountScope.LineItem);
        Assert.Equal(2, (int)DiscountScope.Invoice);
    }

    [Fact]
    public void IBMSBE_006_DiscountRule_Entity_Initializes_Correctly()
    {
        var rule = new DiscountRule
        {
            TenantId = 1,
            Code = "SUMMER20",
            Description = "Summer 20% discount",
            Type = DiscountType.Percentage,
            Scope = DiscountScope.Invoice,
            Value = 20.00m,
            MinInvoiceAmount = 500.00m,
            MaxDiscountAmount = 200.00m,
            IsActive = true,
            ApplicableRole = "Manager"
        };

        Assert.Equal("SUMMER20", rule.Code);
        Assert.Equal(20.00m, rule.Value);
        Assert.True(rule.IsActive);
        Assert.Equal(DiscountScope.Invoice, rule.Scope);
    }

    #endregion

    #region IBMSBE-007: Discount Calculation Service

    [Fact]
    public void IBMSBE_007_CalculateLineDiscount_Percentage_CalculatesAccurately()
    {
        var request = new CalculateLineDiscountRequest
        {
            ProductId = 10,
            ProductName = "Test Item",
            UnitPrice = 150.00m,
            Quantity = 2,
            DiscountType = "Percentage",
            DiscountValue = 10.00m
        };

        var result = _discountService.CalculateLineDiscount(request);

        Assert.Equal(300.00m, result.OriginalLineTotal);
        Assert.Equal(30.00m, result.DiscountAmount);
        Assert.Equal(270.00m, result.DiscountedLineTotal);
    }

    [Fact]
    public void IBMSBE_007_CalculateLineDiscount_FixedAmount_CalculatesAccurately()
    {
        var request = new CalculateLineDiscountRequest
        {
            ProductId = 11,
            ProductName = "Hardware Tool",
            UnitPrice = 100.00m,
            Quantity = 3,
            DiscountType = "FixedAmount",
            DiscountValue = 50.00m
        };

        var result = _discountService.CalculateLineDiscount(request);

        Assert.Equal(300.00m, result.OriginalLineTotal);
        Assert.Equal(50.00m, result.DiscountAmount);
        Assert.Equal(250.00m, result.DiscountedLineTotal);
    }

    [Fact]
    public void IBMSBE_007_CalculateLineDiscount_FixedExceedingTotal_IsCappedAtLineTotal()
    {
        var request = new CalculateLineDiscountRequest
        {
            ProductId = 12,
            ProductName = "Small Item",
            UnitPrice = 50.00m,
            Quantity = 1,
            DiscountType = "FixedAmount",
            DiscountValue = 100.00m
        };

        var result = _discountService.CalculateLineDiscount(request);

        Assert.Equal(50.00m, result.OriginalLineTotal);
        Assert.Equal(50.00m, result.DiscountAmount);
        Assert.Equal(0.00m, result.DiscountedLineTotal);
    }

    [Fact]
    public async Task IBMSBE_007_CalculateInvoiceDiscount_MultipleLines_CalculatesNetSubtotal()
    {
        var request = new CalculateInvoiceDiscountRequest
        {
            LineItems = new List<CalculateLineDiscountRequest>
            {
                new() { ProductId = 1, ProductName = "A", UnitPrice = 100.00m, Quantity = 2, DiscountType = "Percentage", DiscountValue = 10m },
                new() { ProductId = 2, ProductName = "B", UnitPrice = 50.00m, Quantity = 4, DiscountType = "FixedAmount", DiscountValue = 20m }
            },
            InvoiceDiscountType = "Percentage",
            InvoiceDiscountValue = 5.00m,
            UserRole = "Cashier"
        };

        var response = await _discountService.CalculateInvoiceDiscountAsync(request, tenantId: 1);

        Assert.True(response.Success);
        Assert.NotNull(response.Data);
        Assert.Equal(400.00m, response.Data.GrossSubtotal);
        Assert.Equal(40.00m, response.Data.TotalLineDiscounts);
        Assert.Equal(360.00m, response.Data.NetSubtotal);
        // 5% on 360 = 18
        Assert.Equal(18.00m, response.Data.InvoiceDiscountAmount);
        Assert.Equal(58.00m, response.Data.TotalDiscountAmount);
        Assert.Equal(342.00m, response.Data.FinalTotal);
    }

    [Fact]
    public async Task IBMSBE_007_CalculateInvoiceDiscount_WithDiscountRuleCode_AppliesRuleSuccessfully()
    {
        _ruleRepository.Rules.Add(new DiscountRule
        {
            Id = 1,
            TenantId = 1,
            Code = "WELCOME10",
            Type = DiscountType.Percentage,
            Scope = DiscountScope.Invoice,
            Value = 10.00m,
            IsActive = true
        });

        var request = new CalculateInvoiceDiscountRequest
        {
            InvoiceSubtotal = 1000.00m,
            DiscountCode = "WELCOME10",
            UserRole = "Cashier"
        };

        var response = await _discountService.CalculateInvoiceDiscountAsync(request, tenantId: 1);

        Assert.True(response.Success);
        Assert.NotNull(response.Data);
        Assert.Equal(100.00m, response.Data.InvoiceDiscountAmount);
        Assert.Equal(900.00m, response.Data.FinalTotal);
    }

    [Fact]
    public async Task IBMSBE_007_CalculateInvoiceDiscount_MinSubtotalNotMet_FailsValidation()
    {
        _ruleRepository.Rules.Add(new DiscountRule
        {
            Id = 2,
            TenantId = 1,
            Code = "BIGBUY",
            Type = DiscountType.Percentage,
            Scope = DiscountScope.Invoice,
            Value = 10.00m,
            MinInvoiceAmount = 5000.00m,
            IsActive = true
        });

        var request = new CalculateInvoiceDiscountRequest
        {
            InvoiceSubtotal = 2000.00m,
            DiscountCode = "BIGBUY",
            UserRole = "Admin"
        };

        var response = await _discountService.CalculateInvoiceDiscountAsync(request, tenantId: 1);

        Assert.False(response.Success);
        Assert.Contains("requires a minimum subtotal", GetFirstError(response));
    }

    #endregion

    #region IBMSBE-008: Maximum Discount Validation

    [Fact]
    public async Task IBMSBE_008_ExceedingDefaultMaxPercentageLimit_WithoutOverride_FailsValidation()
    {
        var request = new CalculateInvoiceDiscountRequest
        {
            InvoiceSubtotal = 1000.00m,
            InvoiceDiscountType = "Percentage",
            InvoiceDiscountValue = 55.00m, // Exceeds default max 50%
            IsManualOverride = false,
            UserRole = "Admin"
        };

        var response = await _discountService.CalculateInvoiceDiscountAsync(request, tenantId: 1);

        Assert.False(response.Success);
        Assert.Contains("exceeds the tenant maximum allowed limit of 50.00%", GetFirstError(response));
    }

    [Fact]
    public async Task IBMSBE_008_ExceedingDefaultMaxFixedAmount_WithoutOverride_FailsValidation()
    {
        var request = new CalculateInvoiceDiscountRequest
        {
            InvoiceSubtotal = 25000.00m,
            InvoiceDiscountType = "FixedAmount",
            InvoiceDiscountValue = 12000.00m, // Exceeds default max 10000
            IsManualOverride = false,
            UserRole = "Admin"
        };

        var response = await _discountService.CalculateInvoiceDiscountAsync(request, tenantId: 1);

        Assert.False(response.Success);
        Assert.Contains("exceeds tenant maximum limit of INR 10000.00", GetFirstError(response));
    }

    #endregion

    #region IBMSBE-009: Role-Based Discount Permissions

    [Fact]
    public async Task IBMSBE_009_Cashier_AllowedUpTo10Percent_Succeeds()
    {
        var request = new CalculateInvoiceDiscountRequest
        {
            InvoiceSubtotal = 500.00m,
            InvoiceDiscountType = "Percentage",
            InvoiceDiscountValue = 10.00m,
            UserRole = "Cashier"
        };

        var response = await _discountService.CalculateInvoiceDiscountAsync(request, tenantId: 1);

        Assert.True(response.Success);
        Assert.NotNull(response.Data);
        Assert.Equal(50.00m, response.Data.InvoiceDiscountAmount);
    }

    [Fact]
    public async Task IBMSBE_009_Cashier_Exceeding10Percent_FailsValidation()
    {
        var request = new CalculateInvoiceDiscountRequest
        {
            InvoiceSubtotal = 500.00m,
            InvoiceDiscountType = "Percentage",
            InvoiceDiscountValue = 15.00m, // Cashier is capped at 10%
            UserRole = "Cashier"
        };

        var response = await _discountService.CalculateInvoiceDiscountAsync(request, tenantId: 1);

        Assert.False(response.Success);
        Assert.Contains("not authorized to apply discounts exceeding 10.00%", GetFirstError(response));
    }

    [Fact]
    public async Task IBMSBE_009_Manager_AllowedUpTo30Percent_Succeeds()
    {
        var request = new CalculateInvoiceDiscountRequest
        {
            InvoiceSubtotal = 1000.00m,
            InvoiceDiscountType = "Percentage",
            InvoiceDiscountValue = 25.00m,
            UserRole = "Manager"
        };

        var response = await _discountService.CalculateInvoiceDiscountAsync(request, tenantId: 1);

        Assert.True(response.Success);
        Assert.NotNull(response.Data);
        Assert.Equal(250.00m, response.Data.InvoiceDiscountAmount);
    }

    [Fact]
    public async Task IBMSBE_009_Manager_Exceeding30Percent_WithoutOverride_FailsValidation()
    {
        var request = new CalculateInvoiceDiscountRequest
        {
            InvoiceSubtotal = 1000.00m,
            InvoiceDiscountType = "Percentage",
            InvoiceDiscountValue = 35.00m,
            IsManualOverride = false,
            UserRole = "Manager"
        };

        var response = await _discountService.CalculateInvoiceDiscountAsync(request, tenantId: 1);

        Assert.False(response.Success);
        Assert.Contains("not authorized to apply discounts exceeding 30.00%", GetFirstError(response));
    }

    [Fact]
    public async Task IBMSBE_009_Admin_AllowsUpToTenantLimit_WithoutOverride()
    {
        var request = new CalculateInvoiceDiscountRequest
        {
            InvoiceSubtotal = 1000.00m,
            InvoiceDiscountType = "Percentage",
            InvoiceDiscountValue = 45.00m,
            UserRole = "Admin"
        };

        var response = await _discountService.CalculateInvoiceDiscountAsync(request, tenantId: 1);

        Assert.True(response.Success);
        Assert.NotNull(response.Data);
        Assert.Equal(450.00m, response.Data.InvoiceDiscountAmount);
    }

    [Fact]
    public async Task IBMSBE_009_CreateRule_Cashier_IsForbidden()
    {
        var request = new CreateDiscountRuleRequest
        {
            Code = "CASHIER_FAIL",
            Name = "Fail rule",
            Type = "Percentage",
            Scope = "Invoice",
            Value = 5.00m
        };

        var response = await _discountService.CreateRuleAsync(request, tenantId: 1, userRole: "Cashier");

        Assert.False(response.Success);
        Assert.Contains("not authorized to create discount rules", GetFirstError(response));
    }

    [Fact]
    public async Task IBMSBE_009_CreateRule_Manager_Succeeds()
    {
        var request = new CreateDiscountRuleRequest
        {
            Code = "MGR15",
            Name = "Manager Rule",
            Description = "Manager special",
            Type = "Percentage",
            Scope = "Invoice",
            Value = 15.00m
        };

        var response = await _discountService.CreateRuleAsync(request, tenantId: 1, userRole: "Manager");

        Assert.True(response.Success);
        Assert.NotNull(response.Data);
        Assert.Equal("MGR15", response.Data.Code);
    }

    #endregion

    #region IBMSBE-010: Manual Override Reason and Audit

    [Fact]
    public async Task IBMSBE_010_Cashier_ManualOverride_IsRejected()
    {
        var request = new CalculateInvoiceDiscountRequest
        {
            InvoiceSubtotal = 1000.00m,
            InvoiceDiscountType = "Percentage",
            InvoiceDiscountValue = 25.00m,
            IsManualOverride = true,
            OverrideReason = "Special customer loyalty request",
            UserRole = "Cashier"
        };

        var response = await _discountService.CalculateInvoiceDiscountAsync(request, tenantId: 1);

        Assert.False(response.Success);
        Assert.Contains("not authorized to perform manual discount overrides", GetFirstError(response));
    }

    [Fact]
    public async Task IBMSBE_010_ManualOverride_MissingOrShortReason_IsRejected()
    {
        var request = new CalculateInvoiceDiscountRequest
        {
            InvoiceSubtotal = 1000.00m,
            InvoiceDiscountType = "Percentage",
            InvoiceDiscountValue = 35.00m,
            IsManualOverride = true,
            OverrideReason = "bad", // Less than 5 characters
            UserRole = "Manager"
        };

        var response = await _discountService.CalculateInvoiceDiscountAsync(request, tenantId: 1);

        Assert.False(response.Success);
        Assert.Contains("requires a mandatory 'OverrideReason' (minimum 5 characters)", GetFirstError(response));
    }

    [Fact]
    public async Task IBMSBE_010_Manager_ManualOverride_WithValidReason_Succeeds_And_LogsAudit()
    {
        var request = new CalculateInvoiceDiscountRequest
        {
            InvoiceId = "INV-2026-001",
            InvoiceSubtotal = 2000.00m,
            InvoiceDiscountType = "Percentage",
            InvoiceDiscountValue = 35.00m, // Exceeds normal manager limit 30%
            IsManualOverride = true,
            OverrideReason = "Customer damaged package compensation approved by Store Manager",
            UserRole = "Manager"
        };

        var response = await _discountService.CalculateInvoiceDiscountAsync(request, tenantId: 1, userRole: "Manager", userName: "ManagerBob");

        Assert.True(response.Success);
        Assert.NotNull(response.Data);
        Assert.True(response.Data.IsOverrideApplied);
        Assert.Equal(request.OverrideReason, response.Data.OverrideReason);
        Assert.Equal(700.00m, response.Data.InvoiceDiscountAmount);
        Assert.Equal(1300.00m, response.Data.FinalTotal);

        // Verify AuditLog creation
        Assert.Single(_auditLogRepository.Logs);
        var log = _auditLogRepository.Logs[0];
        Assert.Equal("MANUAL_OVERRIDE", log.Action);
        Assert.Equal("Discount", log.EntityName);
        Assert.Equal("INV-2026-001", log.EntityId);
        Assert.Equal("ManagerBob", log.UserName);
        Assert.Equal(1, log.TenantId);
        Assert.Contains(request.OverrideReason, log.Changes);
    }

    #endregion

    #region Controller API Verification

    [Fact]
    public async Task Controller_CalculateInvoiceDiscount_ValidRequest_ReturnsOk()
    {
        var request = new CalculateInvoiceDiscountRequest
        {
            InvoiceSubtotal = 1000.00m,
            InvoiceDiscountType = "Percentage",
            InvoiceDiscountValue = 10.00m
        };

        var actionResult = await _controller.CalculateInvoiceDiscount(request);
        var okResult = Assert.IsType<OkObjectResult>(actionResult);
        var apiResponse = Assert.IsType<ApiResponse<InvoiceDiscountResultDto>>(okResult.Value);

        Assert.True(apiResponse.Success);
        Assert.NotNull(apiResponse.Data);
        Assert.Equal(900.00m, apiResponse.Data.FinalTotal);
    }

    [Fact]
    public async Task Controller_CalculateInvoiceDiscount_CashierExceedingLimit_ReturnsBadRequest()
    {
        // Set user as Cashier
        SetUserContext(_controller, tenantId: 1, role: "Cashier", email: "cashier@ibms.com", userName: "CashierUser");

        var request = new CalculateInvoiceDiscountRequest
        {
            InvoiceSubtotal = 1000.00m,
            InvoiceDiscountType = "Percentage",
            InvoiceDiscountValue = 25.00m
        };

        var actionResult = await _controller.CalculateInvoiceDiscount(request);
        var badResult = Assert.IsType<BadRequestObjectResult>(actionResult);
        var apiResponse = Assert.IsType<ApiResponse<InvoiceDiscountResultDto>>(badResult.Value);

        Assert.False(apiResponse.Success);
    }

    #endregion
}