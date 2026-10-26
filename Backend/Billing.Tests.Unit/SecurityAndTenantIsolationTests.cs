using System.Security.Claims;
using Billing.API.Controllers;
using Billing.Application.Interfaces;
using Billing.Application.Services;
using Billing.Contracts;
using Billing.Contracts.CreditNote;
using Billing.Contracts.Numbering;
using Billing.Contracts.Payment;
using Billing.Contracts.Settings;
using Billing.Domain.Entities;
using Billing.Tests.Unit.Fakes;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace Billing.Tests.Unit;

public class SecurityAndTenantIsolationTests
{
    private const int TenantA = 10;
    private const int TenantB = 20;

    #region Fake Repositories & Test Helpers

    private class FakeCountrySettingRepository : ICountrySettingRepository
    {
        private readonly Dictionary<int, CountrySetting> _store = new();

        public Task<CountrySetting?> GetByTenantIdAsync(int tenantId)
        {
            _store.TryGetValue(tenantId, out var setting);
            return Task.FromResult(setting);
        }

        public Task<CountrySetting> SaveAsync(CountrySetting setting)
        {
            _store[setting.TenantId] = setting;
            return Task.FromResult(setting);
        }
    }

    private static ControllerContext CreateContextWithClaims(
        int? tenantId,
        string[]? roles = null,
        string? username = "TestUser",
        string? customerId = null,
        Dictionary<string, string>? headers = null)
    {
        var claims = new List<Claim>();
        if (tenantId.HasValue)
        {
            claims.Add(new Claim("tenant_id", tenantId.Value.ToString()));
        }

        if (!string.IsNullOrEmpty(username))
        {
            claims.Add(new Claim(ClaimTypes.Name, username));
        }

        if (roles != null)
        {
            foreach (var r in roles)
            {
                claims.Add(new Claim(ClaimTypes.Role, r));
            }
        }

        if (!string.IsNullOrEmpty(customerId))
        {
            claims.Add(new Claim("customer_id", customerId));
        }

        var identity = new ClaimsIdentity(claims, "TestAuth");
        var principal = new ClaimsPrincipal(identity);

        var httpContext = new DefaultHttpContext
        {
            User = principal
        };

        if (headers != null)
        {
            foreach (var kvp in headers)
            {
                httpContext.Request.Headers[kvp.Key] = kvp.Value;
            }
        }

        return new ControllerContext
        {
            HttpContext = httpContext
        };
    }

    private sealed class PaymentCreditContext
    {
        public FakeInvoiceRepository InvoiceRepo { get; } = new();
        public FakePaymentRepository PaymentRepo { get; } = new();
        public FakeCreditNoteRepository CreditNoteRepo { get; } = new();
        public FakeCustomerRepository CustomerRepo { get; } = new();
        public FakeNumberingRepository NumberingRepo { get; } = new();
        public SnapshotAuditLogRepository AuditRepo { get; } = new();
        public FakeTransactionalUnitOfWork UnitOfWork { get; }
        public INumberGenerationService NumberGenService { get; }
        public PaymentService PaymentService { get; }
        public CreditNoteService CreditNoteService { get; }

        public PaymentCreditContext()
        {
            UnitOfWork = new FakeTransactionalUnitOfWork(InvoiceRepo, PaymentRepo, AuditRepo);
            NumberGenService = new NumberGenerationService(NumberingRepo);
            PaymentService = new PaymentService(
                PaymentRepo,
                InvoiceRepo,
                CustomerRepo,
                NumberGenService,
                AuditRepo,
                UnitOfWork);
            CreditNoteService = new CreditNoteService(
                CreditNoteRepo,
                InvoiceRepo,
                CustomerRepo,
                NumberGenService,
                AuditRepo,
                UnitOfWork);
        }

        public async Task<Invoice> SeedInvoiceAsync(int tenantId, int id, decimal amount = 1000m)
        {
            var customer = new Customer
            {
                Id = id * 10,
                TenantId = tenantId,
                CustomerCode = $"CUST-{id}",
                Name = $"Customer {id}",
                Currency = "INR",
                Status = "Active"
            };
            await CustomerRepo.AddAsync(customer);

            var invoice = new Invoice
            {
                Id = id,
                TenantId = tenantId,
                InvoiceNumber = $"INV-{id:D5}",
                CustomerId = customer.Id,
                Customer = customer,
                InvoiceDate = DateTime.UtcNow.AddDays(-2),
                DueDate = DateTime.UtcNow.AddDays(15),
                Status = "Issued",
                Currency = "INR",
                Subtotal = amount,
                TotalAmount = amount,
                PaidAmount = 0m,
                CreditedAmount = 0m,
                BalanceAmount = amount,
                CreatedAtUtc = DateTime.UtcNow,
                Items = new List<InvoiceItem>
                {
                    new()
                    {
                        Id = id * 100 + 1,
                        InvoiceId = id,
                        Description = "Test Item",
                        Quantity = 1,
                        UnitPrice = amount,
                        TotalAmount = amount
                    }
                }
            };
            await InvoiceRepo.AddAsync(invoice);
            return invoice;
        }
    }

    #endregion

    #region Requirement 1 & 2: Fail-Closed Tenant Isolation & Missing Claims

    [Fact]
    public async Task PaymentsController_MissingTenantClaim_FailsClosed_ReturnsForbid()
    {
        var ctx = new PaymentCreditContext();
        var controller = new PaymentsController(ctx.PaymentService)
        {
            ControllerContext = CreateContextWithClaims(tenantId: null, roles: new[] { "TenantAdmin" })
        };

        var result = await controller.GetPayments(new PaymentListFilterRequest());
        Assert.IsType<ForbidResult>(result.Result);

        var createResult = await controller.CreatePayment(new CreatePaymentRequest
        {
            InvoiceId = 1,
            Amount = 100m,
            PaymentDate = DateTime.UtcNow,
            Method = "Cash"
        });
        Assert.IsType<ForbidResult>(createResult.Result);
    }

    [Fact]
    public async Task PaymentsController_NonSuperAdmin_SupplyingXTenantIdHeader_CannotBypassMissingTenantClaim()
    {
        var ctx = new PaymentCreditContext();
        var headers = new Dictionary<string, string> { { "X-Tenant-Id", "99" } };
        var controller = new PaymentsController(ctx.PaymentService)
        {
            // Regular TenantAdmin with missing tenant claim cannot use X-Tenant-Id header
            ControllerContext = CreateContextWithClaims(tenantId: null, roles: new[] { "TenantAdmin" }, headers: headers)
        };

        var result = await controller.GetPayments(new PaymentListFilterRequest());
        Assert.IsType<ForbidResult>(result.Result);
    }

    [Fact]
    public async Task CreditNotesController_MissingTenantClaim_FailsClosed_ReturnsForbid()
    {
        var ctx = new PaymentCreditContext();
        var controller = new CreditNotesController(ctx.CreditNoteService)
        {
            ControllerContext = CreateContextWithClaims(tenantId: null, roles: new[] { "TenantAdmin" })
        };

        var listResult = await controller.GetCreditNotes(new CreditNoteFilterRequest());
        Assert.IsType<ForbidResult>(listResult.Result);

        var createResult = await controller.CreateCreditNote(new CreateCreditNoteRequest
        {
            InvoiceId = 1,
            Reason = "Overcharge"
        });
        Assert.IsType<ForbidResult>(createResult.Result);
    }

    [Fact]
    public async Task InvoicesController_MissingTenantClaim_FailsClosed_ReturnsForbid()
    {
        var invoiceRepoMock = new Mock<IInvoiceRepository>();
        var invoiceServiceMock = new Mock<IInvoiceService>();
        var commRepoMock = new Mock<IInvoiceCommunicationRepository>();
        var auditRepoMock = new Mock<IAuditLogRepository>();

        var controller = new InvoicesController(
            invoiceServiceMock.Object,
            invoiceRepoMock.Object,
            commRepoMock.Object,
            auditRepoMock.Object)
        {
            ControllerContext = CreateContextWithClaims(tenantId: null, roles: new[] { "TenantAdmin" })
        };

        var result = await controller.GetInvoices(new InvoiceFilterRequest());
        Assert.IsType<ForbidResult>(result);

        var exportResult = await controller.ExportInvoices(new InvoiceFilterRequest());
        Assert.IsType<ForbidResult>(exportResult);
    }

    [Fact]
    public async Task InvoicesController_NonSuperAdmin_SupplyingXTenantIdHeader_CannotEstablishScope()
    {
        var invoiceRepoMock = new Mock<IInvoiceRepository>();
        var invoiceServiceMock = new Mock<IInvoiceService>();
        var commRepoMock = new Mock<IInvoiceCommunicationRepository>();
        var auditRepoMock = new Mock<IAuditLogRepository>();

        var headers = new Dictionary<string, string> { { "X-Tenant-Id", "42" } };
        var controller = new InvoicesController(
            invoiceServiceMock.Object,
            invoiceRepoMock.Object,
            commRepoMock.Object,
            auditRepoMock.Object)
        {
            // Missing claim with X-Tenant-Id should return Forbid for non-SuperAdmin
            ControllerContext = CreateContextWithClaims(tenantId: null, roles: new[] { "TenantAdmin" }, headers: headers)
        };

        var result = await controller.GetInvoices(new InvoiceFilterRequest());
        Assert.IsType<ForbidResult>(result);
    }

    [Fact]
    public async Task InvoicesController_SuperAdmin_CanExplicitlySelectTenantViaHeader()
    {
        var invoiceRepoMock = new Mock<IInvoiceRepository>();
        invoiceRepoMock
            .Setup(r => r.GetPagedAsync(42, It.IsAny<InvoiceFilterRequest>()))
            .ReturnsAsync(new PagedResult<Invoice> { Items = new List<Invoice>(), TotalCount = 0 });

        var controller = new InvoicesController(
            Mock.Of<IInvoiceService>(),
            invoiceRepoMock.Object,
            Mock.Of<IInvoiceCommunicationRepository>(),
            Mock.Of<IAuditLogRepository>())
        {
            ControllerContext = CreateContextWithClaims(
                tenantId: 1,
                roles: new[] { "SuperAdmin" },
                headers: new Dictionary<string, string> { { "X-Tenant-Id", "42" } })
        };

        var result = await controller.GetInvoices(new InvoiceFilterRequest());
        Assert.IsType<OkObjectResult>(result);
        invoiceRepoMock.Verify(r => r.GetPagedAsync(42, It.IsAny<InvoiceFilterRequest>()), Times.Once);
    }

    #endregion

    #region Requirement 1: Role Fallback & Privilege Escalation Prevention

    [Fact]
    public async Task PaymentsController_MissingRoleClaims_DoesNotElevateToTenantAdmin_ReversalFailsWithForbidden()
    {
        var ctx = new PaymentCreditContext();
        var invoice = await ctx.SeedInvoiceAsync(TenantA, id: 1, amount: 500m);

        // Record a payment first
        var paymentResult = await ctx.PaymentService.CreatePaymentAsync(
            TenantA,
            new CreatePaymentRequest
            {
                InvoiceId = invoice.Id,
                Amount = 500m,
                PaymentDate = DateTime.UtcNow,
                Method = "Cash"
            },
            performedBy: "Admin",
            userRoles: new[] { "TenantAdmin" });
        Assert.True(paymentResult.IsSuccess);
        var paymentId = paymentResult.Data!.Id;

        // Controller invocation with NO role claims
        var controller = new PaymentsController(ctx.PaymentService)
        {
            ControllerContext = CreateContextWithClaims(tenantId: TenantA, roles: null)
        };

        var reverseResult = await controller.ReversePayment(paymentId, new ReversePaymentRequest
        {
            Reason = "Customer requested refund"
        });

        // Must reject without TenantAdmin elevation (403 Forbidden)
        var objResult = Assert.IsType<ObjectResult>(reverseResult.Result);
        Assert.Equal(403, objResult.StatusCode);
    }

    [Fact]
    public async Task PaymentsController_ViewerOrCustomerRole_CannotReversePayment()
    {
        var ctx = new PaymentCreditContext();
        var invoice = await ctx.SeedInvoiceAsync(TenantA, id: 2, amount: 1000m);

        var paymentResult = await ctx.PaymentService.CreatePaymentAsync(
            TenantA,
            new CreatePaymentRequest
            {
                InvoiceId = invoice.Id,
                Amount = 1000m,
                Currency = "INR",
                PaymentDate = DateTime.UtcNow,
                Method = "Cash"
            },
            performedBy: "Admin",
            userRoles: new[] { "TenantAdmin" });
        Assert.True(paymentResult.IsSuccess, paymentResult.ErrorMessage);
        var paymentId = paymentResult.Data!.Id;

        // Controller invocation with Viewer role
        var controller = new PaymentsController(ctx.PaymentService)
        {
            ControllerContext = CreateContextWithClaims(tenantId: TenantA, roles: new[] { "Viewer" })
        };

        var reverseResult = await controller.ReversePayment(paymentId, new ReversePaymentRequest
        {
            Reason = "Reversal attempt by Viewer"
        });

        var objResult = Assert.IsType<ObjectResult>(reverseResult.Result);
        Assert.Equal(403, objResult.StatusCode);
    }

    [Fact]
    public async Task CreditNotesController_MissingRoleClaims_DoesNotElevateToTenantAdmin_CannotApprove()
    {
        var ctx = new PaymentCreditContext();
        var invoice = await ctx.SeedInvoiceAsync(TenantA, id: 3, amount: 800m);

        // Create a draft credit note
        var cnResult = await ctx.CreditNoteService.CreateCreditNoteAsync(
            TenantA,
            new CreateCreditNoteRequest
            {
                InvoiceId = invoice.Id,
                Reason = "Service quality issue"
            },
            userDisplayName: "Creator",
            userRoles: new List<string> { "User" },
            userPermissions: new List<string>());
        Assert.True(cnResult.Success);
        var creditNoteId = cnResult.Data!.Id;

        // Submit for approval
        await ctx.CreditNoteService.SubmitForApprovalAsync(TenantA, creditNoteId, "Creator", new List<string> { "User" }, new List<string>());

        // Try to approve with missing roles
        var controller = new CreditNotesController(ctx.CreditNoteService)
        {
            ControllerContext = CreateContextWithClaims(tenantId: TenantA, roles: null)
        };

        var approveResult = await controller.ApproveCreditNote(creditNoteId);
        var badRequestResult = Assert.IsType<BadRequestObjectResult>(approveResult.Result);
        var envelope = Assert.IsType<ApiResponse<CreditNoteDetailDto>>(badRequestResult.Value);
        Assert.False(envelope.Success);
        Assert.Contains("permission", envelope.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task CreditNotesController_ViewerRole_CannotApproveCreditNote()
    {
        var ctx = new PaymentCreditContext();
        var invoice = await ctx.SeedInvoiceAsync(TenantA, id: 4, amount: 600m);

        var cnResult = await ctx.CreditNoteService.CreateCreditNoteAsync(
            TenantA,
            new CreateCreditNoteRequest
            {
                InvoiceId = invoice.Id,
                Reason = "Pricing adjustment"
            },
            userDisplayName: "Creator",
            userRoles: new List<string> { "User" },
            userPermissions: new List<string>());
        var creditNoteId = cnResult.Data!.Id;
        await ctx.CreditNoteService.SubmitForApprovalAsync(TenantA, creditNoteId, "Creator", new List<string> { "User" }, new List<string>());

        var controller = new CreditNotesController(ctx.CreditNoteService)
        {
            ControllerContext = CreateContextWithClaims(tenantId: TenantA, roles: new[] { "Viewer" })
        };

        var approveResult = await controller.ApproveCreditNote(creditNoteId);
        var badRequestResult = Assert.IsType<BadRequestObjectResult>(approveResult.Result);
        var envelope = Assert.IsType<ApiResponse<CreditNoteDetailDto>>(badRequestResult.Value);
        Assert.False(envelope.Success);
        Assert.Contains("permission", envelope.Message, StringComparison.OrdinalIgnoreCase);
    }

    #endregion

    #region Requirement 1: Tenant A vs Tenant B Strict Cross-Tenant Isolation

    [Fact]
    public async Task CrossTenant_Payments_TenantACannotPayOrReadTenantBInvoice()
    {
        var ctx = new PaymentCreditContext();
        // Seed invoice in Tenant B
        var invoiceTenantB = await ctx.SeedInvoiceAsync(TenantB, id: 101, amount: 1500m);

        var controllerTenantA = new PaymentsController(ctx.PaymentService)
        {
            ControllerContext = CreateContextWithClaims(tenantId: TenantA, roles: new[] { "TenantAdmin" })
        };

        // Tenant A tries to create payment against Tenant B's invoice
        var createResult = await controllerTenantA.CreatePayment(new CreatePaymentRequest
        {
            InvoiceId = invoiceTenantB.Id,
            Amount = 500m,
            PaymentDate = DateTime.UtcNow,
            Method = "Cash"
        });

        // Service returns 404/NotFound because invoice does not belong to Tenant A
        var notFoundCreate = Assert.IsType<NotFoundObjectResult>(createResult.Result);
        Assert.NotNull(notFoundCreate);

        // Tenant A checks invoice balance for Tenant B's invoice
        var balanceResult = await controllerTenantA.GetInvoiceBalance(invoiceTenantB.Id);
        var notFoundResult = Assert.IsType<NotFoundObjectResult>(balanceResult.Result);
        Assert.NotNull(notFoundResult);
    }

    [Fact]
    public async Task CrossTenant_Payments_TenantACannotReverseTenantBPayment()
    {
        var ctx = new PaymentCreditContext();
        var invoiceTenantB = await ctx.SeedInvoiceAsync(TenantB, id: 102, amount: 2000m);

        // Legitimate payment recorded in Tenant B
        var payResult = await ctx.PaymentService.CreatePaymentAsync(
            TenantB,
            new CreatePaymentRequest
            {
                InvoiceId = invoiceTenantB.Id,
                Amount = 1000m,
                Currency = "INR",
                PaymentDate = DateTime.UtcNow,
                Method = "Cash"
            },
            performedBy: "TenantBAdmin",
            userRoles: new[] { "TenantAdmin" });
        Assert.True(payResult.IsSuccess);
        var paymentId = payResult.Data!.Id;

        // Tenant A tries to reverse Tenant B's payment
        var controllerTenantA = new PaymentsController(ctx.PaymentService)
        {
            ControllerContext = CreateContextWithClaims(tenantId: TenantA, roles: new[] { "TenantAdmin" })
        };

        var reverseResult = await controllerTenantA.ReversePayment(paymentId, new ReversePaymentRequest
        {
            Reason = "Malicious cross-tenant reversal attempt"
        });

        var notFoundRev = Assert.IsType<NotFoundObjectResult>(reverseResult.Result);
        Assert.NotNull(notFoundRev);
    }

    [Fact]
    public async Task CrossTenant_CreditNotes_TenantACannotAccessOrModifyTenantBCreditNote()
    {
        var ctx = new PaymentCreditContext();
        var invoiceTenantB = await ctx.SeedInvoiceAsync(TenantB, id: 103, amount: 900m);

        var cnResult = await ctx.CreditNoteService.CreateCreditNoteAsync(
            TenantB,
            new CreateCreditNoteRequest
            {
                InvoiceId = invoiceTenantB.Id,
                Reason = "Tenant B Discount"
            },
            userDisplayName: "TenantBAdmin",
            userRoles: new List<string> { "TenantAdmin" },
            userPermissions: new List<string>());
        Assert.True(cnResult.Success);
        var creditNoteId = cnResult.Data!.Id;

        // Tenant A attempts to read Tenant B credit note
        var controllerTenantA = new CreditNotesController(ctx.CreditNoteService)
        {
            ControllerContext = CreateContextWithClaims(tenantId: TenantA, roles: new[] { "TenantAdmin" })
        };

        var getResult = await controllerTenantA.GetCreditNoteById(creditNoteId);
        Assert.IsType<NotFoundObjectResult>(getResult.Result);

        // Tenant A attempts to approve Tenant B credit note
        var approveResult = await controllerTenantA.ApproveCreditNote(creditNoteId);
        Assert.IsType<BadRequestObjectResult>(approveResult.Result);
    }

    #endregion

    #region Requirement 3: Country Configuration API & Persistence

    [Fact]
    public async Task CountrySettings_GET_And_PUT_TenantIsolation_And_Persistence()
    {
        var repo = new FakeCountrySettingRepository();
        var service = new CountrySettingService(repo);

        // Initially Tenant A has empty countries
        var initialA = await service.GetSettingsAsync(TenantA);
        Assert.True(initialA.Success);
        Assert.Empty(initialA.Data!.Countries);

        // Update Tenant A with selected countries
        var updateA = await service.UpdateSettingsAsync(TenantA, new UpdateCountrySettingsRequest
        {
            Countries = new List<CountryItemDto>
            {
                new() { CountryCode = "IN", Country = "India", Currency = "INR", PhoneCode = "+91" },
                new() { CountryCode = "US", Country = "United States", Currency = "USD", PhoneCode = "+1" }
            }
        });
        Assert.True(updateA.Success);
        Assert.Equal(2, updateA.Data!.Countries.Count);

        // Verify Tenant B remains isolated (empty)
        var getB = await service.GetSettingsAsync(TenantB);
        Assert.True(getB.Success);
        Assert.Empty(getB.Data!.Countries);

        // Update Tenant B with different countries
        var updateB = await service.UpdateSettingsAsync(TenantB, new UpdateCountrySettingsRequest
        {
            Countries = new List<CountryItemDto>
            {
                new() { CountryCode = "GB", Country = "United Kingdom", Currency = "GBP", PhoneCode = "+44" }
            }
        });
        Assert.True(updateB.Success);
        Assert.Single(updateB.Data!.Countries);

        // Re-verify Tenant A was not affected by Tenant B
        var verifyA = await service.GetSettingsAsync(TenantA);
        Assert.Equal(2, verifyA.Data!.Countries.Count);
        Assert.Contains(verifyA.Data.Countries, c => c.CountryCode == "IN");
        Assert.Contains(verifyA.Data.Countries, c => c.CountryCode == "US");
        Assert.DoesNotContain(verifyA.Data.Countries, c => c.CountryCode == "GB");
    }

    [Fact]
    public async Task CountrySettingsController_MissingTenantClaim_FailsClosed_ReturnsForbid()
    {
        var repo = new FakeCountrySettingRepository();
        var service = new CountrySettingService(repo);
        var controller = new CountrySettingsController(service)
        {
            ControllerContext = CreateContextWithClaims(tenantId: null, roles: new[] { "TenantAdmin" })
        };

        var getResult = await controller.GetCountrySettings();
        Assert.IsType<ForbidResult>(getResult);

        var putResult = await controller.UpdateCountrySettings(new UpdateCountrySettingsRequest
        {
            Countries = new List<CountryItemDto> { new() { CountryCode = "IN", Country = "India" } }
        });
        Assert.IsType<ForbidResult>(putResult);
    }

    #endregion

    #region Requirement 4: Numbering Concurrency, Precondition & Token Support

    [Fact]
    public async Task NumberingSettings_UpdateWithoutRowVersion_FailsWithPreconditionRequired()
    {
        var numRepo = new FakeNumberingRepository();
        var numGen = new NumberGenerationService(numRepo);
        var auditRepo = new FakeAuditLogRepository();
        var service = new NumberingSettingService(numRepo, numGen, auditRepo);

        // 1. Initial creation
        var createResult = await service.UpdateSettingAsync(new UpdateNumberingSettingRequest
        {
            DocumentType = "Invoice",
            Prefix = "INV-",
            Tokens = "{YYYY}-",
            SequenceLength = 4,
            NextNumber = 1,
            ResetPolicy = "Never"
        }, TenantA);
        Assert.True(createResult.Success);

        // 2. Attempt update WITHOUT RowVersion
        var updateWithoutVersion = await service.UpdateSettingAsync(new UpdateNumberingSettingRequest
        {
            DocumentType = "Invoice",
            Prefix = "INV-MODIFIED-",
            Tokens = "{YYYY}-",
            SequenceLength = 5,
            NextNumber = 10,
            ResetPolicy = "Never",
            RowVersion = null // Missing RowVersion!
        }, TenantA);

        Assert.False(updateWithoutVersion.Success);
        Assert.Contains("Precondition required", updateWithoutVersion.Message, StringComparison.OrdinalIgnoreCase);

        // Verify controller returns HTTP 428
        var controller = new NumberingSettingsController(service, numGen)
        {
            ControllerContext = CreateContextWithClaims(tenantId: TenantA, roles: new[] { "TenantAdmin" })
        };

        var ctrlResult = await controller.UpdateNumberingSettings(new UpdateNumberingSettingRequest
        {
            DocumentType = "Invoice",
            Prefix = "INV-MODIFIED-",
            RowVersion = "" // Empty RowVersion
        });

        var statusCodeResult = Assert.IsType<ObjectResult>(ctrlResult);
        Assert.Equal(StatusCodes.Status428PreconditionRequired, statusCodeResult.StatusCode);
    }

    [Fact]
    public async Task NumberingSettings_UpdateWithStaleRowVersion_FailsWithConcurrencyConflict()
    {
        var numRepo = new FakeNumberingRepository();
        var numGen = new NumberGenerationService(numRepo);
        var auditRepo = new FakeAuditLogRepository();
        var service = new NumberingSettingService(numRepo, numGen, auditRepo);

        // 1. Initial creation
        var createResult = await service.UpdateSettingAsync(new UpdateNumberingSettingRequest
        {
            DocumentType = "Invoice",
            Prefix = "INV-",
            Tokens = "{YYYY}-",
            SequenceLength = 4,
            NextNumber = 1,
            ResetPolicy = "Never"
        }, TenantA);
        var originalRowVersion = createResult.Data!.RowVersion;

        // 2. Simulate User 1 successfully updating the setting
        var update1 = await service.UpdateSettingAsync(new UpdateNumberingSettingRequest
        {
            DocumentType = "Invoice",
            Prefix = "INV-U1-",
            RowVersion = originalRowVersion
        }, TenantA);
        Assert.True(update1.Success);
        var newRowVersion = update1.Data!.RowVersion;
        Assert.NotEqual(originalRowVersion, newRowVersion);

        // 3. User 2 attempts update with the now STALE original RowVersion
        var controller = new NumberingSettingsController(service, numGen)
        {
            ControllerContext = CreateContextWithClaims(tenantId: TenantA, roles: new[] { "TenantAdmin" })
        };

        var staleUpdateResult = await controller.UpdateNumberingSettings(new UpdateNumberingSettingRequest
        {
            DocumentType = "Invoice",
            Prefix = "INV-U2-",
            RowVersion = originalRowVersion // Stale!
        });

        var conflictResult = Assert.IsType<ConflictObjectResult>(staleUpdateResult);
        Assert.Equal(StatusCodes.Status409Conflict, conflictResult.StatusCode);
    }

    [Fact]
    public async Task NumberGeneration_SupportsDDToken_FormatsZeroPaddedDay()
    {
        var numRepo = new FakeNumberingRepository();
        var numGen = new NumberGenerationService(numRepo);
        var auditRepo = new FakeAuditLogRepository();
        var service = new NumberingSettingService(numRepo, numGen, auditRepo);

        // Configure setting with {DD}
        await service.UpdateSettingAsync(new UpdateNumberingSettingRequest
        {
            DocumentType = "Invoice",
            Prefix = "INV-",
            Tokens = "{YYYY}-{MM}-{DD}-",
            Suffix = "",
            SequenceLength = 4,
            NextNumber = 1,
            ResetPolicy = "Never"
        }, TenantA);

        // Date: 2026-09-08 (Single digit day to verify 2-digit zero-padding "08")
        var date = new DateTime(2026, 9, 8);

        var result = await numGen.GenerateNextNumberAsync(new GenerateNumberRequest
        {
            DocumentType = "Invoice",
            TransactionDate = date
        }, TenantA);

        Assert.True(result.Success);
        Assert.Equal("INV-2026-09-08-0001", result.Data!.GeneratedNumber);

        // Also test token replacement directly
        var replaced = numGen.ReplaceTokens("DOC/{YYYY}/{MM}/{DD}", new DateTime(2026, 10, 24));
        Assert.Equal("DOC/2026/10/24", replaced);
    }

        [Fact]
    public async Task NumberingSettings_PreviewNumber_NeverConsumesSequenceNumber()
    {
        var numRepo = new FakeNumberingRepository();
        var numGen = new NumberGenerationService(numRepo);
        var auditRepo = new FakeAuditLogRepository();
        var service = new NumberingSettingService(numRepo, numGen, auditRepo);

        // Configure setting with initial NextNumber = 1
        await service.UpdateSettingAsync(new UpdateNumberingSettingRequest
        {
            DocumentType = "Invoice",
            Prefix = "INV-",
            Tokens = "{YYYY}-",
            NextNumber = 1,
            SequenceLength = 4
        }, TenantA);

        var controller = new NumberingSettingsController(service, numGen)
        {
            ControllerContext = CreateContextWithClaims(tenantId: TenantA, roles: new[] { "TenantAdmin" })
        };

        // Call preview multiple times
        for (int i = 0; i < 5; i++)
        {
            var previewResult = controller.PreviewNumber(new NumberPreviewRequest
            {
                Prefix = "INV-",
                Tokens = "{YYYY}-",
                NextNumber = 1,
                SequenceLength = 4,
                Date = new DateTime(2026, 10, 24)
            });

            var okObj = Assert.IsType<OkObjectResult>(previewResult);
            var previewEnvelope = Assert.IsType<ApiResponse<NumberPreviewResponseDto>>(okObj.Value);
            Assert.Equal("INV-2026-0001", previewEnvelope.Data!.FullPreview);
        }

        // Verify sequence in repository was NOT incremented and remains 1
        var currentSetting = await service.GetSettingByDocTypeAsync("Invoice", TenantA);
        Assert.Equal(1, currentSetting.Data!.NextNumber);
    }

    [Fact]
    public async Task InvoicesController_ExportInvoices_SetsTruncationHeaders()
    {
        var invoiceRepoMock = new Mock<IInvoiceRepository>();
        invoiceRepoMock
            .Setup(r => r.GetPagedAsync(TenantA, It.IsAny<InvoiceFilterRequest>(), default))
            .ReturnsAsync(new PagedResult<Invoice>
            {
                Items = new List<Invoice> { new Invoice { InvoiceNumber = "INV-001", TenantId = TenantA, Subtotal = 100m, TotalAmount = 100m } },
                TotalCount = 12500, // Exceeds 10,000
                PageNumber = 1,
                PageSize = 10000
            });

        var controller = new InvoicesController(
            Mock.Of<IInvoiceService>(),
            invoiceRepoMock.Object,
            Mock.Of<IInvoiceCommunicationRepository>(),
            Mock.Of<IAuditLogRepository>())
        {
            ControllerContext = CreateContextWithClaims(tenantId: TenantA, roles: new[] { "TenantAdmin" })
        };

        var result = await controller.ExportInvoices(new InvoiceFilterRequest(), format: "csv");
        Assert.IsType<FileContentResult>(result);

        var headers = controller.Response.Headers;
        Assert.Equal("12500", headers["X-Total-Count"].ToString());
        Assert.Equal("1", headers["X-Exported-Count"].ToString());
        Assert.Equal("true", headers["X-Export-Truncated"].ToString());
        Assert.Contains("X-Export-Truncated", headers["Access-Control-Expose-Headers"].ToString());
    }

    #endregion
}