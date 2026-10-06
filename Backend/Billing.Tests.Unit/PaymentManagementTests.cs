using System.Security.Claims;
using Billing.API.Controllers;
using Billing.Application.Interfaces;
using Billing.Application.Services;
using Billing.Contracts;
using Billing.Contracts.Payment;
using Billing.Domain.Entities;
using Billing.Domain.Enums;
using Billing.Tests.Unit.Fakes;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Billing.Tests.Unit;

public class PaymentManagementTests
{
    private const int Tenant1 = 1;
    private const int Tenant2 = 2;

    private sealed class TestContext
    {
        public FakeInvoiceRepository InvoiceRepo { get; } = new();
        public FakePaymentRepository PaymentRepo { get; } = new();
        public FakeCustomerRepository CustomerRepo { get; } = new();
        public FakeNumberingRepository NumberingRepo { get; } = new();
        public SnapshotAuditLogRepository AuditRepo { get; } = new();
        public FakeTransactionalUnitOfWork UnitOfWork { get; }
        public INumberGenerationService NumberGenService { get; }
        public PaymentService PaymentService { get; }

        public TestContext()
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
        }

        public async Task<Customer> SeedCustomerAsync(int tenantId = Tenant1, int id = 10, string currency = "INR")
        {
            var customer = new Customer
            {
                Id = id,
                TenantId = tenantId,
                CustomerCode = $"CUST-{id:D3}",
                Name = $"Customer {id}",
                CompanyName = $"Acme Corp {id}",
                Email = $"customer{id}@example.com",
                Currency = currency,
                Status = "Active",
                Addresses = new List<CustomerAddress>
                {
                    new()
                    {
                        Id = id * 10 + 1,
                        TenantId = tenantId,
                        CustomerId = id,
                        AddressType = "Billing",
                        AddressLine1 = "123 Main St",
                        City = "Hyderabad",
                        Country = "India"
                    }
                }
            };
            await CustomerRepo.AddAsync(customer);
            return customer;
        }

        public async Task<Invoice> SeedInvoiceAsync(
            int tenantId = Tenant1,
            int customerId = 10,
            decimal totalAmount = 1000.00m,
            decimal paidAmount = 0.00m,
            string status = "Issued",
            string currency = "INR",
            DateTime? dueDate = null)
        {
            var customer = await CustomerRepo.GetByIdAsync(customerId, tenantId)
                           ?? await SeedCustomerAsync(tenantId, customerId, currency);

            var invoice = new Invoice
            {
                TenantId = tenantId,
                CustomerId = customer.Id,
                Customer = customer,
                InvoiceNumber = $"INV-2026-{InvoiceRepo.Invoices.Count + 1:D4}",
                InvoiceDate = DateTime.UtcNow.Date.AddDays(-5),
                DueDate = dueDate ?? DateTime.UtcNow.Date.AddDays(15),
                Status = status,
                Subtotal = totalAmount,
                TotalAmount = totalAmount,
                PaidAmount = paidAmount,
                BalanceAmount = Math.Max(0m, totalAmount - paidAmount),
                CreatedAtUtc = DateTime.UtcNow
            };

            return await InvoiceRepo.AddAsync(invoice);
        }
    }

    [Fact]
    public async Task CreatePayment_PartialPayment_UpdatesInvoiceToPartiallyPaidAndLogsAudit()
    {
        var ctx = new TestContext();
        var invoice = await ctx.SeedInvoiceAsync(totalAmount: 1000.00m);

        var request = new CreatePaymentRequest
        {
            InvoiceId = invoice.Id,
            CustomerId = invoice.CustomerId,
            Amount = 400.00m,
            Currency = "INR",
            PaymentDate = DateTime.UtcNow.Date,
            Method = "UPI",
            Reference = "UPI-TXN-99887766",
            UpiPayerMetadata = "customer@okaxis",
            Notes = "First installment"
        };

        var result = await ctx.PaymentService.CreatePaymentAsync(
            Tenant1,
            request,
            "finance@ibms.com",
            new[] { "Finance" });

        Assert.True(result.IsSuccess);
        Assert.Equal(201, result.StatusCode);
        Assert.False(result.IsIdempotentReplay);
        Assert.NotNull(result.Data);
        Assert.StartsWith("PAY-", result.Data!.PaymentNumber);
        Assert.Equal(400.00m, result.Data.Amount);
        Assert.Equal(400.00m, result.Data.AllocatedAmount);
        Assert.Equal("Completed", result.Data.Status);
        Assert.True(result.Data.IsReversible);
        Assert.Single(result.Data.Allocations);

        var updatedInvoice = await ctx.InvoiceRepo.GetByIdAsync(invoice.Id, Tenant1);
        Assert.NotNull(updatedInvoice);
        Assert.Equal(400.00m, updatedInvoice!.PaidAmount);
        Assert.Equal(600.00m, updatedInvoice.BalanceAmount);
        Assert.Equal("Partially Paid", updatedInvoice.Status);

        // Verify transactional audit/outbox events
        Assert.Contains(ctx.AuditRepo.Logs, l => l.EntityName == "Payment" && l.Action == "PaymentCreated");
        Assert.Contains(ctx.AuditRepo.Logs, l => l.EntityName == "Payment" && l.Action == "PaymentStatusChanged");
    }

    [Fact]
    public async Task CreatePayment_FullPayment_UpdatesInvoiceToPaidAndPreventsFurtherPayment()
    {
        var ctx = new TestContext();
        var invoice = await ctx.SeedInvoiceAsync(totalAmount: 1250.50m);

        var request = new CreatePaymentRequest
        {
            InvoiceId = invoice.Id,
            Amount = 1250.50m,
            Currency = "INR",
            PaymentDate = DateTime.UtcNow.Date,
            Method = "BankTransfer",
            Reference = "NEFT-20260930-12345",
            BankName = "HDFC Bank"
        };

        var result = await ctx.PaymentService.CreatePaymentAsync(Tenant1, request, "admin@ibms.com");

        Assert.True(result.IsSuccess);
        Assert.Equal("Completed", result.Data!.Status);

        var updatedInvoice = await ctx.InvoiceRepo.GetByIdAsync(invoice.Id, Tenant1);
        Assert.Equal(1250.50m, updatedInvoice!.PaidAmount);
        Assert.Equal(0.00m, updatedInvoice.BalanceAmount);
        Assert.Equal("Paid", updatedInvoice.Status);

        // Attempting another payment against a Paid invoice must fail
        var secondAttempt = await ctx.PaymentService.CreatePaymentAsync(
            Tenant1,
            new CreatePaymentRequest
            {
                InvoiceId = invoice.Id,
                Amount = 10.00m,
                Currency = "INR",
                PaymentDate = DateTime.UtcNow.Date,
                Method = "Cash"
            },
            "admin@ibms.com");

        Assert.False(secondAttempt.IsSuccess);
        Assert.Equal("INVOICE_NOT_ELIGIBLE", secondAttempt.ErrorCode);
    }

    [Fact]
    public async Task CreatePayment_Overpayment_IsRejectedAndLeavesInvoiceUnchanged()
    {
        var ctx = new TestContext();
        var invoice = await ctx.SeedInvoiceAsync(totalAmount: 500.00m, paidAmount: 200.00m, status: "Partially Paid");

        var request = new CreatePaymentRequest
        {
            InvoiceId = invoice.Id,
            Amount = 300.01m, // Remaining balance is 300.00
            Currency = "INR",
            PaymentDate = DateTime.UtcNow.Date,
            Method = "Cash"
        };

        var result = await ctx.PaymentService.CreatePaymentAsync(Tenant1, request, "cashier@ibms.com");

        Assert.False(result.IsSuccess);
        Assert.Equal(400, result.StatusCode);
        Assert.Equal("OVERPAYMENT_NOT_ALLOWED", result.ErrorCode);

        var unchangedInvoice = await ctx.InvoiceRepo.GetByIdAsync(invoice.Id, Tenant1);
        Assert.Equal(200.00m, unchangedInvoice!.PaidAmount);
        Assert.Equal(300.00m, unchangedInvoice.BalanceAmount);
        Assert.Equal("Partially Paid", unchangedInvoice.Status);
        Assert.Empty(ctx.PaymentRepo.Payments);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-50)]
    [InlineData(10.123)]
    public async Task CreatePayment_InvalidAmounts_AreRejected(decimal invalidAmount)
    {
        var ctx = new TestContext();
        var invoice = await ctx.SeedInvoiceAsync(totalAmount: 1000.00m);

        var result = await ctx.PaymentService.CreatePaymentAsync(
            Tenant1,
            new CreatePaymentRequest
            {
                InvoiceId = invoice.Id,
                Amount = invalidAmount,
                Currency = "INR",
                PaymentDate = DateTime.UtcNow.Date,
                Method = "Cash"
            },
            "cashier@ibms.com");

        Assert.False(result.IsSuccess);
        Assert.Equal(400, result.StatusCode);
    }

    [Theory]
    [InlineData("Draft")]
    [InlineData("Cancelled")]
    [InlineData("Void")]
    public async Task CreatePayment_IneligibleInvoiceStatus_IsRejected(string status)
    {
        var ctx = new TestContext();
        var invoice = await ctx.SeedInvoiceAsync(totalAmount: 1000.00m, status: status);

        var result = await ctx.PaymentService.CreatePaymentAsync(
            Tenant1,
            new CreatePaymentRequest
            {
                InvoiceId = invoice.Id,
                Amount = 100.00m,
                Currency = "INR",
                PaymentDate = DateTime.UtcNow.Date,
                Method = "Cash"
            },
            "cashier@ibms.com");

        Assert.False(result.IsSuccess);
        Assert.Equal("INVOICE_NOT_ELIGIBLE", result.ErrorCode);
    }

    [Fact]
    public async Task CreatePayment_SensitiveCardOrPinData_IsStrictlyRejected()
    {
        var ctx = new TestContext();
        var invoice = await ctx.SeedInvoiceAsync(totalAmount: 1000.00m);

        // 1. Forbidden trap field (CVV / CardNumber)
        var withCvv = new CreatePaymentRequest
        {
            InvoiceId = invoice.Id,
            Amount = 100.00m,
            Currency = "INR",
            PaymentDate = DateTime.UtcNow.Date,
            Method = "Card",
            Reference = "AUTH-9988",
            Cvv = "123"
        };

        var res1 = await ctx.PaymentService.CreatePaymentAsync(Tenant1, withCvv, "cashier@ibms.com");
        Assert.False(res1.IsSuccess);
        Assert.Equal("SENSITIVE_DATA_FORBIDDEN", res1.ErrorCode);

        // 2. Full 16-digit PAN in Reference field
        var withPanInReference = new CreatePaymentRequest
        {
            InvoiceId = invoice.Id,
            Amount = 100.00m,
            Currency = "INR",
            PaymentDate = DateTime.UtcNow.Date,
            Method = "Card",
            Reference = "4111 2222 3333 4444"
        };

        var res2 = await ctx.PaymentService.CreatePaymentAsync(Tenant1, withPanInReference, "cashier@ibms.com");
        Assert.False(res2.IsSuccess);
        Assert.Equal("SENSITIVE_DATA_FORBIDDEN", res2.ErrorCode);

        // 3. Masked last-4 card reference is allowed
        var validCard = new CreatePaymentRequest
        {
            InvoiceId = invoice.Id,
            Amount = 100.00m,
            Currency = "INR",
            PaymentDate = DateTime.UtcNow.Date,
            Method = "Card",
            Reference = "****4242"
        };

        var res3 = await ctx.PaymentService.CreatePaymentAsync(Tenant1, validCard, "cashier@ibms.com");
        Assert.True(res3.IsSuccess);
        Assert.Equal("****4242", res3.Data!.Reference);
    }

    [Fact]
    public async Task CreatePayment_IdempotentRetry_SameKeyReturnsOriginalAndDoesNotDoubleDeduct()
    {
        var ctx = new TestContext();
        var invoice = await ctx.SeedInvoiceAsync(totalAmount: 1000.00m);

        var request = new CreatePaymentRequest
        {
            InvoiceId = invoice.Id,
            Amount = 350.00m,
            Currency = "INR",
            PaymentDate = DateTime.UtcNow.Date,
            Method = "UPI",
            Reference = "UPI-IDEM-001",
            IdempotencyKey = "idem-key-001"
        };

        var first = await ctx.PaymentService.CreatePaymentAsync(Tenant1, request, "user@ibms.com");
        Assert.True(first.IsSuccess);
        Assert.Equal(201, first.StatusCode);
        Assert.False(first.IsIdempotentReplay);

        var retry = await ctx.PaymentService.CreatePaymentAsync(Tenant1, request, "user@ibms.com");
        Assert.True(retry.IsSuccess);
        Assert.Equal(200, retry.StatusCode);
        Assert.True(retry.IsIdempotentReplay);
        Assert.Equal(first.Data!.Id, retry.Data!.Id);
        Assert.Equal(first.Data.PaymentNumber, retry.Data.PaymentNumber);

        // Invoice balance must only be deducted once (1000 - 350 = 650)
        var updatedInvoice = await ctx.InvoiceRepo.GetByIdAsync(invoice.Id, Tenant1);
        Assert.Equal(350.00m, updatedInvoice!.PaidAmount);
        Assert.Equal(650.00m, updatedInvoice.BalanceAmount);
        Assert.Single(ctx.PaymentRepo.Payments);
    }

    [Fact]
    public async Task CreatePayment_IdempotencyKeyReusedWithDifferentPayload_Returns409Conflict()
    {
        var ctx = new TestContext();
        var invoice = await ctx.SeedInvoiceAsync(totalAmount: 1000.00m);

        var firstRequest = new CreatePaymentRequest
        {
            InvoiceId = invoice.Id,
            Amount = 250.00m,
            Currency = "INR",
            PaymentDate = DateTime.UtcNow.Date,
            Method = "Cash",
            IdempotencyKey = "idem-conflict-key"
        };

        var first = await ctx.PaymentService.CreatePaymentAsync(Tenant1, firstRequest, "user@ibms.com");
        Assert.True(first.IsSuccess);

        var modifiedPayloadRequest = new CreatePaymentRequest
        {
            InvoiceId = invoice.Id,
            Amount = 500.00m, // Different amount with same idempotency key
            Currency = "INR",
            PaymentDate = DateTime.UtcNow.Date,
            Method = "Cash",
            IdempotencyKey = "idem-conflict-key"
        };

        var conflict = await ctx.PaymentService.CreatePaymentAsync(Tenant1, modifiedPayloadRequest, "user@ibms.com");
        Assert.False(conflict.IsSuccess);
        Assert.Equal(409, conflict.StatusCode);
        Assert.Equal("IDEMPOTENCY_CONFLICT", conflict.ErrorCode);
    }

    [Fact]
    public async Task CreatePayment_ConcurrentPaymentsAgainstSameInvoice_ProtectsBalanceIntegrity()
    {
        var ctx = new TestContext();
        var invoice = await ctx.SeedInvoiceAsync(totalAmount: 1000.00m);

        // Two concurrent requests each trying to pay 700.00 against a 1000.00 balance
        var req1 = new CreatePaymentRequest
        {
            InvoiceId = invoice.Id,
            Amount = 700.00m,
            Currency = "INR",
            PaymentDate = DateTime.UtcNow.Date,
            Method = "UPI",
            Reference = "UPI-CONC-1",
            IdempotencyKey = "conc-key-1"
        };

        var req2 = new CreatePaymentRequest
        {
            InvoiceId = invoice.Id,
            Amount = 700.00m,
            Currency = "INR",
            PaymentDate = DateTime.UtcNow.Date,
            Method = "UPI",
            Reference = "UPI-CONC-2",
            IdempotencyKey = "conc-key-2"
        };

        var results = await Task.WhenAll(
            Task.Run(() => ctx.PaymentService.CreatePaymentAsync(Tenant1, req1, "user1@ibms.com")),
            Task.Run(() => ctx.PaymentService.CreatePaymentAsync(Tenant1, req2, "user2@ibms.com")));

        var successes = results.Where(r => r.IsSuccess).ToList();
        var failures = results.Where(r => !r.IsSuccess).ToList();

        Assert.Single(successes);
        Assert.Single(failures);
        Assert.Equal("OVERPAYMENT_NOT_ALLOWED", failures[0].ErrorCode);

        var finalInvoice = await ctx.InvoiceRepo.GetByIdAsync(invoice.Id, Tenant1);
        Assert.Equal(700.00m, finalInvoice!.PaidAmount);
        Assert.Equal(300.00m, finalInvoice.BalanceAmount);
        Assert.Equal("Partially Paid", finalInvoice.Status);
    }

    [Fact]
    public async Task ReversePayment_ValidReversal_RestoresInvoiceBalanceAndStatusAndPreservesRecord()
    {
        var ctx = new TestContext();
        var invoice = await ctx.SeedInvoiceAsync(totalAmount: 1000.00m);

        var createRes = await ctx.PaymentService.CreatePaymentAsync(
            Tenant1,
            new CreatePaymentRequest
            {
                InvoiceId = invoice.Id,
                Amount = 1000.00m,
                Currency = "INR",
                PaymentDate = DateTime.UtcNow.Date,
                Method = "BankTransfer",
                Reference = "IMPS-889900"
            },
            "finance@ibms.com");

        Assert.True(createRes.IsSuccess);
        var paymentId = createRes.Data!.Id;

        var reverseRes = await ctx.PaymentService.ReversePaymentAsync(
            Tenant1,
            paymentId,
            new ReversePaymentRequest { Reason = "Bank transfer returned by beneficiary bank" },
            "admin@ibms.com",
            new[] { "TenantAdmin" });

        Assert.True(reverseRes.IsSuccess);
        Assert.Equal("Reversed", reverseRes.Data!.Status);
        Assert.False(reverseRes.Data.IsReversible);
        Assert.Equal("admin@ibms.com", reverseRes.Data.ReversedBy);
        Assert.Equal("Bank transfer returned by beneficiary bank", reverseRes.Data.ReversalReason);
        Assert.NotNull(reverseRes.Data.ReversedAtUtc);
        Assert.All(reverseRes.Data.Allocations, a => Assert.True(a.IsReversed));

        // Original payment still exists in repository (never deleted)
        var storedPayment = await ctx.PaymentRepo.GetByIdAsync(Tenant1, paymentId);
        Assert.NotNull(storedPayment);
        Assert.Equal(PaymentStatus.Reversed, storedPayment!.Status);

        // Invoice balance and status are restored
        var restoredInvoice = await ctx.InvoiceRepo.GetByIdAsync(invoice.Id, Tenant1);
        Assert.Equal(0.00m, restoredInvoice!.PaidAmount);
        Assert.Equal(1000.00m, restoredInvoice.BalanceAmount);
        Assert.Equal("Issued", restoredInvoice.Status);

        // Audit logs contain PaymentReversed and PaymentStatusChanged
        Assert.Contains(ctx.AuditRepo.Logs, l => l.EntityId == paymentId.ToString() && l.Action == "PaymentReversed");
        Assert.True(ctx.AuditRepo.Logs.Count(l => l.EntityId == paymentId.ToString() && l.Action == "PaymentStatusChanged") >= 2);
    }

    [Fact]
    public async Task ReversePayment_ReverseTwice_IsRejected()
    {
        var ctx = new TestContext();
        var invoice = await ctx.SeedInvoiceAsync(totalAmount: 500.00m);

        var created = await ctx.PaymentService.CreatePaymentAsync(
            Tenant1,
            new CreatePaymentRequest
            {
                InvoiceId = invoice.Id,
                Amount = 500.00m,
                Currency = "INR",
                PaymentDate = DateTime.UtcNow.Date,
                Method = "Cash"
            },
            "finance@ibms.com");

        var firstReverse = await ctx.PaymentService.ReversePaymentAsync(
            Tenant1,
            created.Data!.Id,
            new ReversePaymentRequest { Reason = "Posted to wrong invoice" },
            "admin@ibms.com",
            new[] { "TenantAdmin" });

        Assert.True(firstReverse.IsSuccess);

        var secondReverse = await ctx.PaymentService.ReversePaymentAsync(
            Tenant1,
            created.Data.Id,
            new ReversePaymentRequest { Reason = "Trying to reverse a second time" },
            "admin@ibms.com",
            new[] { "TenantAdmin" });

        Assert.False(secondReverse.IsSuccess);
        Assert.Equal(400, secondReverse.StatusCode);
        Assert.Equal("ALREADY_REVERSED", secondReverse.ErrorCode);

        // Invoice balance remains 500.00 (not 1000.00)
        var restoredInvoice = await ctx.InvoiceRepo.GetByIdAsync(invoice.Id, Tenant1);
        Assert.Equal(0.00m, restoredInvoice!.PaidAmount);
        Assert.Equal(500.00m, restoredInvoice.BalanceAmount);
    }

    [Fact]
    public async Task ReversePayment_UnauthorizedUserOrMissingReason_IsRejected()
    {
        var ctx = new TestContext();
        var invoice = await ctx.SeedInvoiceAsync(totalAmount: 500.00m);

        var created = await ctx.PaymentService.CreatePaymentAsync(
            Tenant1,
            new CreatePaymentRequest
            {
                InvoiceId = invoice.Id,
                Amount = 200.00m,
                Currency = "INR",
                PaymentDate = DateTime.UtcNow.Date,
                Method = "Cash"
            },
            "cashier@ibms.com");

        // 1. Unauthorized role (Cashier without reversal permission)
        var unauthResult = await ctx.PaymentService.ReversePaymentAsync(
            Tenant1,
            created.Data!.Id,
            new ReversePaymentRequest { Reason = "Valid reason text" },
            "cashier@ibms.com",
            new[] { "Cashier" },
            new[] { "billing.view", "billing.create" });

        Assert.False(unauthResult.IsSuccess);
        Assert.Equal(403, unauthResult.StatusCode);
        Assert.Equal("FORBIDDEN", unauthResult.ErrorCode);

        // 2. Authorized role but empty reason
        var missingReasonResult = await ctx.PaymentService.ReversePaymentAsync(
            Tenant1,
            created.Data.Id,
            new ReversePaymentRequest { Reason = "  " },
            "admin@ibms.com",
            new[] { "TenantAdmin" });

        Assert.False(missingReasonResult.IsSuccess);
        Assert.Equal(400, missingReasonResult.StatusCode);
        Assert.Equal("REVERSAL_REASON_REQUIRED", missingReasonResult.ErrorCode);
    }

    [Fact]
    public async Task CrossTenantAccess_IsStrictlyIsolatedAcrossAllOperations()
    {
        var ctx = new TestContext();
        var tenant1Invoice = await ctx.SeedInvoiceAsync(tenantId: Tenant1, customerId: 10, totalAmount: 800.00m);

        // Tenant 2 trying to pay Tenant 1's invoice
        var crossTenantCreate = await ctx.PaymentService.CreatePaymentAsync(
            Tenant2,
            new CreatePaymentRequest
            {
                InvoiceId = tenant1Invoice.Id,
                Amount = 800.00m,
                Currency = "INR",
                PaymentDate = DateTime.UtcNow.Date,
                Method = "Cash"
            },
            "attacker@tenant2.com");

        Assert.False(crossTenantCreate.IsSuccess);
        Assert.Equal(404, crossTenantCreate.StatusCode);

        // Create valid payment in Tenant 1
        var tenant1Payment = await ctx.PaymentService.CreatePaymentAsync(
            Tenant1,
            new CreatePaymentRequest
            {
                InvoiceId = tenant1Invoice.Id,
                Amount = 300.00m,
                Currency = "INR",
                PaymentDate = DateTime.UtcNow.Date,
                Method = "Cash"
            },
            "admin@tenant1.com");

        Assert.True(tenant1Payment.IsSuccess);

        // Tenant 2 cannot view Tenant 1's payment details
        var crossTenantGet = await ctx.PaymentService.GetPaymentByIdAsync(Tenant2, tenant1Payment.Data!.Id);
        Assert.False(crossTenantGet.IsSuccess);
        Assert.Equal(404, crossTenantGet.StatusCode);

        // Tenant 2 list returns empty
        var crossTenantList = await ctx.PaymentService.GetPagedPaymentsAsync(Tenant2, new PaymentListFilterRequest());
        Assert.True(crossTenantList.IsSuccess);
        Assert.Empty(crossTenantList.Data!.Items);

        // Tenant 2 cannot reverse Tenant 1's payment
        var crossTenantReverse = await ctx.PaymentService.ReversePaymentAsync(
            Tenant2,
            tenant1Payment.Data.Id,
            new ReversePaymentRequest { Reason = "Cross tenant reversal attempt" },
            "admin@tenant2.com",
            new[] { "TenantAdmin" });

        Assert.False(crossTenantReverse.IsSuccess);
        Assert.Equal(404, crossTenantReverse.StatusCode);
    }

    [Fact]
    public async Task GatewayAndChequeWorkflows_PendingDoesNotReduceBalanceUntilCompleted()
    {
        var ctx = new TestContext();
        var invoice = await ctx.SeedInvoiceAsync(totalAmount: 1000.00m);

        // 1. Uncleared Cheque starts as Pending; invoice balance stays 1000.00
        var chequeRes = await ctx.PaymentService.CreatePaymentAsync(
            Tenant1,
            new CreatePaymentRequest
            {
                InvoiceId = invoice.Id,
                Amount = 400.00m,
                Currency = "INR",
                PaymentDate = DateTime.UtcNow.Date,
                Method = "Cheque",
                ChequeNumber = "045678",
                ChequeDate = DateTime.UtcNow.Date,
                BankName = "ICICI Bank",
                ClearingStatus = "Uncleared"
            },
            "finance@ibms.com");

        Assert.True(chequeRes.IsSuccess);
        Assert.Equal("Pending", chequeRes.Data!.Status);

        var invAfterPendingCheque = await ctx.InvoiceRepo.GetByIdAsync(invoice.Id, Tenant1);
        Assert.Equal(0.00m, invAfterPendingCheque!.PaidAmount);
        Assert.Equal(1000.00m, invAfterPendingCheque.BalanceAmount);
        Assert.Equal("Issued", invAfterPendingCheque.Status);

        // 2. Clear the cheque -> status becomes Completed and invoice balance reduces to 600.00
        var clearRes = await ctx.PaymentService.UpdatePaymentStatusAsync(
            Tenant1,
            chequeRes.Data.Id,
            new UpdatePaymentStatusRequest
            {
                Status = "Completed",
                ClearingStatus = "Cleared",
                Notes = "Cheque cleared in settlement"
            },
            "finance@ibms.com");

        Assert.True(clearRes.IsSuccess);
        Assert.Equal("Completed", clearRes.Data!.Status);
        Assert.Equal("Cleared", clearRes.Data.ClearingStatus);

        var invAfterClearedCheque = await ctx.InvoiceRepo.GetByIdAsync(invoice.Id, Tenant1);
        Assert.Equal(400.00m, invAfterClearedCheque!.PaidAmount);
        Assert.Equal(600.00m, invAfterClearedCheque.BalanceAmount);
        Assert.Equal("Partially Paid", invAfterClearedCheque.Status);

        // 3. Gateway pending payment followed by Failed callback -> invoice balance stays 600.00
        var gatewayRes = await ctx.PaymentService.CreatePaymentAsync(
            Tenant1,
            new CreatePaymentRequest
            {
                InvoiceId = invoice.Id,
                Amount = 600.00m,
                Currency = "INR",
                PaymentDate = DateTime.UtcNow.Date,
                Method = "Gateway",
                ProviderName = "Razorpay",
                ProviderTransactionId = "pay_RzpPending123",
                CallbackStatus = "Pending"
            },
            "system@ibms.com");

        Assert.True(gatewayRes.IsSuccess);
        Assert.Equal("Pending", gatewayRes.Data!.Status);

        var gatewayFailedRes = await ctx.PaymentService.UpdatePaymentStatusAsync(
            Tenant1,
            gatewayRes.Data.Id,
            new UpdatePaymentStatusRequest
            {
                Status = "Failed",
                CallbackStatus = "Failed"
            },
            "webhook@ibms.com");

        Assert.True(gatewayFailedRes.IsSuccess);
        Assert.Equal("Failed", gatewayFailedRes.Data!.Status);

        // Duplicate callback is handled idempotently
        var duplicateCallbackRes = await ctx.PaymentService.UpdatePaymentStatusAsync(
            Tenant1,
            gatewayRes.Data.Id,
            new UpdatePaymentStatusRequest
            {
                Status = "Failed",
                CallbackStatus = "Failed"
            },
            "webhook@ibms.com");

        Assert.True(duplicateCallbackRes.IsSuccess);
        Assert.True(duplicateCallbackRes.IsIdempotentReplay);

        var invAfterFailedGateway = await ctx.InvoiceRepo.GetByIdAsync(invoice.Id, Tenant1);
        Assert.Equal(400.00m, invAfterFailedGateway!.PaidAmount);
        Assert.Equal(600.00m, invAfterFailedGateway.BalanceAmount);
    }

    [Fact]
    public async Task TransactionRollback_OnMidTransactionOrAuditFailure_LeavesNoPartialRecords()
    {
        var ctx = new TestContext();
        var invoice = await ctx.SeedInvoiceAsync(totalAmount: 1000.00m);

        // 1. Simulate failure during Invoice update after Payment was added
        ctx.InvoiceRepo.ThrowOnUpdate = true;

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            ctx.PaymentService.CreatePaymentAsync(
                Tenant1,
                new CreatePaymentRequest
                {
                    InvoiceId = invoice.Id,
                    Amount = 500.00m,
                    Currency = "INR",
                    PaymentDate = DateTime.UtcNow.Date,
                    Method = "Cash"
                },
                "admin@ibms.com"));

        Assert.Equal(1, ctx.UnitOfWork.RollbackCount);
        Assert.Empty(ctx.PaymentRepo.Payments);
        Assert.Empty(ctx.AuditRepo.Logs);

        var unchangedInvoice = await ctx.InvoiceRepo.GetByIdAsync(invoice.Id, Tenant1);
        Assert.Equal(0.00m, unchangedInvoice!.PaidAmount);
        Assert.Equal(1000.00m, unchangedInvoice.BalanceAmount);

        // 2. Simulate failure during Audit/Outbox persistence
        ctx.InvoiceRepo.ThrowOnUpdate = false;
        ctx.AuditRepo.ThrowOnAdd = true;

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            ctx.PaymentService.CreatePaymentAsync(
                Tenant1,
                new CreatePaymentRequest
                {
                    InvoiceId = invoice.Id,
                    Amount = 500.00m,
                    Currency = "INR",
                    PaymentDate = DateTime.UtcNow.Date,
                    Method = "Cash"
                },
                "admin@ibms.com"));

        Assert.Equal(2, ctx.UnitOfWork.RollbackCount);
        Assert.Empty(ctx.PaymentRepo.Payments);

        unchangedInvoice = await ctx.InvoiceRepo.GetByIdAsync(invoice.Id, Tenant1);
        Assert.Equal(0.00m, unchangedInvoice!.PaidAmount);
        Assert.Equal(1000.00m, unchangedInvoice.BalanceAmount);
    }

    [Fact]
    public async Task PaymentsController_EndToEndFlow_ListDetailsAndReversalConsistency()
    {
        var ctx = new TestContext();
        var invoice = await ctx.SeedInvoiceAsync(totalAmount: 2000.00m);

        var controller = new PaymentsController(ctx.PaymentService);
        var httpContext = new DefaultHttpContext();
        httpContext.Request.Headers["Idempotency-Key"] = "ctrl-idem-100";
        httpContext.User = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim("tenant_id", Tenant1.ToString()),
            new Claim(ClaimTypes.Name, "Abhiram Kothuri"),
            new Claim(ClaimTypes.Role, "TenantAdmin")
        }, "TestAuth"));

        controller.ControllerContext = new ControllerContext
        {
            HttpContext = httpContext
        };

        // 1. Create partial payment via controller
        var createAction = await controller.CreatePayment(new CreatePaymentRequest
        {
            InvoiceId = invoice.Id,
            Amount = 750.00m,
            Currency = "INR",
            PaymentDate = DateTime.UtcNow.Date,
            Method = "Custom",
            CustomMethodName = "Corporate Voucher",
            Reference = "VCH-2026-77"
        });

        var createdResult = Assert.IsType<ObjectResult>(createAction.Result);
        Assert.Equal(201, createdResult.StatusCode);
        var createdEnvelope = Assert.IsType<ApiResponse<PaymentDetailDto>>(createdResult.Value);
        Assert.True(createdEnvelope.Success);
        var paymentId = createdEnvelope.Data!.Id;

        // 2. Verify List and Details consistency
        var listAction = await controller.GetPayments(new PaymentListFilterRequest { Search = "VCH-2026-77" });
        var listOk = Assert.IsType<OkObjectResult>(listAction.Result);
        var listEnvelope = Assert.IsType<ApiResponse<PagedResult<PaymentListItemDto>>>(listOk.Value);
        Assert.Single(listEnvelope.Data!.Items);
        var listItem = listEnvelope.Data.Items[0];

        var detailAction = await controller.GetPaymentById(paymentId);
        var detailOk = Assert.IsType<OkObjectResult>(detailAction.Result);
        var detailEnvelope = Assert.IsType<ApiResponse<PaymentDetailDto>>(detailOk.Value);
        var detail = detailEnvelope.Data!;

        Assert.Equal(listItem.PaymentNumber, detail.PaymentNumber);
        Assert.Equal(listItem.Amount, detail.Amount);
        Assert.Equal(listItem.Status, detail.Status);
        Assert.Equal(listItem.Method, detail.Method);
        Assert.Equal(1250.00m, detail.Allocations[0].InvoiceBalanceAmount);

        // 3. Check invoice balance endpoint
        var balanceAction = await controller.GetInvoiceBalance(invoice.Id);
        var balanceOk = Assert.IsType<OkObjectResult>(balanceAction.Result);
        var balanceEnvelope = Assert.IsType<ApiResponse<EligibleInvoiceBalanceDto>>(balanceOk.Value);
        Assert.Equal(750.00m, balanceEnvelope.Data!.PaidAmount);
        Assert.Equal(1250.00m, balanceEnvelope.Data.BalanceAmount);
        Assert.Equal("Partially Paid", balanceEnvelope.Data.Status);
    }
}
