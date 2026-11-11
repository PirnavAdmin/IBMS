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
using Moq;

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

    [Fact]
    public async Task InternetBanking_RequiresReference_AndPersistsMethodAndBankDetails()
    {
        var ctx = new TestContext();
        var invoice = await ctx.SeedInvoiceAsync(totalAmount: 1500m);

        var missingRefRes = await ctx.PaymentService.CreatePaymentAsync(
            Tenant1,
            new CreatePaymentRequest
            {
                InvoiceId = invoice.Id,
                Amount = 500m,
                Method = "InternetBanking",
                BankName = "HDFC Bank",
                PaymentDate = DateTime.UtcNow.Date
            },
            "admin@ibms.com");

        Assert.False(missingRefRes.IsSuccess);
        Assert.Equal("METHOD_REFERENCE_REQUIRED", missingRefRes.ErrorCode);

        var validRes = await ctx.PaymentService.CreatePaymentAsync(
            Tenant1,
            new CreatePaymentRequest
            {
                InvoiceId = invoice.Id,
                Amount = 1500m,
                Method = "InternetBanking",
                BankName = "HDFC Bank",
                AccountLabel = "Retail Banking",
                Reference = "NB_HDFC_99001122",
                PaymentDate = DateTime.UtcNow.Date
            },
            "customer@ibms.com");

        Assert.True(validRes.IsSuccess);
        Assert.Equal("Internet Banking", validRes.Data!.Method);
        Assert.Equal("HDFC Bank", validRes.Data.BankName);
        Assert.Equal("Retail Banking", validRes.Data.AccountLabel);
        Assert.Equal("NB_HDFC_99001122", validRes.Data.Reference);
    }

    [Fact]
    public async Task CreatePayment_WhenNotificationServiceProvided_DispatchesPaymentReceivedNotification()
    {
        var context = new TestContext();
        var customer = await context.SeedCustomerAsync();
        var invoice = await context.SeedInvoiceAsync(Tenant1, customer.Id, totalAmount: 1000m, paidAmount: 0m);

        var notificationServiceMock = new Moq.Mock<INotificationService>();
        notificationServiceMock
            .Setup(s => s.SendPaymentNotificationAsync(Moq.It.IsAny<int>(), Tenant1, "PaymentReceived", "Admin"))
            .ReturnsAsync(ApiResponse<Billing.Contracts.Notification.NotificationLogDto>.Ok(new Billing.Contracts.Notification.NotificationLogDto { Id = 1, Status = "Sent" }));

        var paymentService = new PaymentService(
            context.PaymentRepo,
            context.InvoiceRepo,
            context.CustomerRepo,
            context.NumberGenService,
            context.AuditRepo,
            context.UnitOfWork,
            outboxService: null,
            notificationService: notificationServiceMock.Object);

        var request = new CreatePaymentRequest
        {
            InvoiceId = invoice.Id,
            CustomerId = customer.Id,
            Amount = 500m,
            Method = "Cash",
            PaymentDate = DateTime.UtcNow
        };

        var result = await paymentService.CreatePaymentAsync(Tenant1, request, "Admin");

        Assert.True(result.IsSuccess);
        notificationServiceMock.Verify(
            s => s.SendPaymentNotificationAsync(Moq.It.IsAny<int>(), Tenant1, "PaymentReceived", "Admin"),
            Moq.Times.Once);
    }

    [Fact]
    public async Task PaymentsController_BlocksSimulateQrAndWebhookSpoofWhenDisallowed()
    {
        var paymentServiceMock = new Moq.Mock<IPaymentService>();
        var gatewayMock = new Moq.Mock<IPaymentGatewayService>();
        gatewayMock.Setup(g => g.IsTestSimulationAllowedAsync(Tenant1)).ReturnsAsync(false);

        var controller = new PaymentsController(paymentServiceMock.Object, gatewayMock.Object)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(new[]
                    {
                        new Claim("TenantId", Tenant1.ToString()),
                        new Claim(ClaimTypes.Role, "TenantAdmin")
                    }, "Test"))
                }
            }
        };

        var simResult = await controller.SimulateQrPayment(32, Tenant1, new SimulateQrPaymentRequest());
        var simBad = Assert.IsType<BadRequestObjectResult>(simResult);
        var simResp = Assert.IsType<ApiResponse<PaymentDetailDto>>(simBad.Value);
        Assert.False(simResp.Success);

        var spoofResult = await controller.VerifyGatewayPayment(
            new VerifyGatewayPaymentRequest { InvoiceId = 32, Gateway = "Razorpay_Webhook", PaymentId = "fake_1" },
            Tenant1);
        var spoofBad = Assert.IsType<BadRequestObjectResult>(spoofResult);
        var spoofResp = Assert.IsType<ApiResponse<PaymentDetailDto>>(spoofBad.Value);
        Assert.False(spoofResp.Success);
    }

    [Fact]
    public async Task PaymentService_PublishesInAppNotifications_ForCreatedCompletedStatusUpdatedAndReversedPayments()
    {
        var ctx = new TestContext();
        var invoice = await ctx.SeedInvoiceAsync(totalAmount: 1000.00m);

        var published = new List<Billing.Contracts.Notification.PublishTenantNotificationCommand>();
        var inAppMock = new Moq.Mock<IInAppNotificationService>();
        inAppMock
            .Setup(s => s.PublishTenantNotificationAsync(
                Moq.It.IsAny<Billing.Contracts.Notification.PublishTenantNotificationCommand>(),
                Moq.It.IsAny<CancellationToken>()))
            .Callback<Billing.Contracts.Notification.PublishTenantNotificationCommand, CancellationToken>((cmd, _) => published.Add(cmd))
            .ReturnsAsync(ApiResponse<int>.Ok(1));

        var paymentService = new PaymentService(
            ctx.PaymentRepo,
            ctx.InvoiceRepo,
            ctx.CustomerRepo,
            ctx.NumberGenService,
            ctx.AuditRepo,
            ctx.UnitOfWork,
            inAppNotificationService: inAppMock.Object);

        // 1. Completed partial payment -> PaymentReceived
        var paidRes = await paymentService.CreatePaymentAsync(
            Tenant1,
            new CreatePaymentRequest
            {
                InvoiceId = invoice.Id,
                Amount = 400.00m,
                Currency = "INR",
                PaymentDate = DateTime.UtcNow.Date,
                Method = "BankTransfer",
                Reference = "IMPS-NOTIFY-01"
            },
            "finance@ibms.com");

        Assert.True(paidRes.IsSuccess);
        Assert.Single(published);
        var receivedNotif = published[0];
        Assert.Equal(Tenant1, receivedNotif.TenantId);
        Assert.Equal("PaymentReceived", receivedNotif.EventType);
        Assert.Equal($"payment-{paidRes.Data!.Id}-received", receivedNotif.EventDeduplicationId);
        Assert.Equal("payments", receivedNotif.ActionModule);
        Assert.Equal(paidRes.Data.Id.ToString(), receivedNotif.ActionEntityId);
        Assert.Contains(paidRes.Data.PaymentNumber, receivedNotif.Title);
        Assert.Contains("400.00", receivedNotif.Message);

        // 2. Uncleared Cheque (Pending) -> PaymentCreated
        var chequeRes = await paymentService.CreatePaymentAsync(
            Tenant1,
            new CreatePaymentRequest
            {
                InvoiceId = invoice.Id,
                Amount = 200.00m,
                Currency = "INR",
                PaymentDate = DateTime.UtcNow.Date,
                Method = "Cheque",
                ChequeNumber = "045999",
                ChequeDate = DateTime.UtcNow.Date,
                BankName = "HDFC Bank",
                ClearingStatus = "Uncleared"
            },
            "finance@ibms.com");

        Assert.True(chequeRes.IsSuccess);
        Assert.Equal(2, published.Count);
        var createdNotif = published[1];
        Assert.Equal("PaymentCreated", createdNotif.EventType);
        Assert.Equal($"payment-{chequeRes.Data!.Id}-created", createdNotif.EventDeduplicationId);
        Assert.Equal("payments", createdNotif.ActionModule);
        Assert.Equal(chequeRes.Data.Id.ToString(), createdNotif.ActionEntityId);

        // 3. Clearing the cheque -> PaymentReceived
        var clearRes = await paymentService.UpdatePaymentStatusAsync(
            Tenant1,
            chequeRes.Data.Id,
            new UpdatePaymentStatusRequest
            {
                Status = "Completed",
                ClearingStatus = "Cleared",
                Notes = "Cleared in batch"
            },
            "finance@ibms.com");

        Assert.True(clearRes.IsSuccess);
        Assert.Equal(3, published.Count);
        var clearedNotif = published[2];
        Assert.Equal("PaymentReceived", clearedNotif.EventType);
        Assert.Equal($"payment-{chequeRes.Data.Id}-received", clearedNotif.EventDeduplicationId);
        Assert.Equal("payments", clearedNotif.ActionModule);
        Assert.Equal(chequeRes.Data.Id.ToString(), clearedNotif.ActionEntityId);

        // 4. Pending gateway payment + Failed callback -> PaymentCreated then PaymentFailed
        var gatewayRes = await paymentService.CreatePaymentAsync(
            Tenant1,
            new CreatePaymentRequest
            {
                InvoiceId = invoice.Id,
                Amount = 200.00m,
                Currency = "INR",
                PaymentDate = DateTime.UtcNow.Date,
                Method = "Gateway",
                ProviderName = "Razorpay",
                ProviderTransactionId = "pay_RzpNotify99",
                CallbackStatus = "Pending"
            },
            "system@ibms.com");

        Assert.True(gatewayRes.IsSuccess);
        Assert.Equal(4, published.Count);
        Assert.Equal("PaymentCreated", published[3].EventType);

        var failedRes = await paymentService.UpdatePaymentStatusAsync(
            Tenant1,
            gatewayRes.Data!.Id,
            new UpdatePaymentStatusRequest
            {
                Status = "Failed",
                CallbackStatus = "Failed"
            },
            "webhook@ibms.com");

        Assert.True(failedRes.IsSuccess);
        Assert.Equal(5, published.Count);
        var failedNotif = published[4];
        Assert.Equal("PaymentFailed", failedNotif.EventType);
        Assert.Equal($"payment-{gatewayRes.Data.Id}-failed", failedNotif.EventDeduplicationId);
        Assert.Equal("payments", failedNotif.ActionModule);
        Assert.Equal(gatewayRes.Data.Id.ToString(), failedNotif.ActionEntityId);

        // 5. Reversing the completed payment -> PaymentReversed
        var reverseRes = await paymentService.ReversePaymentAsync(
            Tenant1,
            paidRes.Data.Id,
            new ReversePaymentRequest { Reason = "Customer requested refund" },
            "admin@ibms.com",
            new[] { "TenantAdmin" });

        Assert.True(reverseRes.IsSuccess);
        Assert.Equal(6, published.Count);
        var reversedNotif = published[5];
        Assert.Equal("PaymentReversed", reversedNotif.EventType);
        Assert.Equal($"payment-{paidRes.Data.Id}-reversed", reversedNotif.EventDeduplicationId);
        Assert.Equal("payments", reversedNotif.ActionModule);
        Assert.Equal(paidRes.Data.Id.ToString(), reversedNotif.ActionEntityId);
        Assert.Contains("Customer requested refund", reversedNotif.Message);
    }

    [Fact]
    public async Task PaymentService_CreatePaymentSucceeds_WhenInAppNotificationServiceThrows()
    {
        var ctx = new TestContext();
        var invoice = await ctx.SeedInvoiceAsync(totalAmount: 1000.00m);

        var inAppMock = new Moq.Mock<IInAppNotificationService>();
        inAppMock
            .Setup(s => s.PublishTenantNotificationAsync(
                Moq.It.IsAny<Billing.Contracts.Notification.PublishTenantNotificationCommand>(),
                Moq.It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("Notification inbox unavailable"));

        var paymentService = new PaymentService(
            ctx.PaymentRepo,
            ctx.InvoiceRepo,
            ctx.CustomerRepo,
            ctx.NumberGenService,
            ctx.AuditRepo,
            ctx.UnitOfWork,
            inAppNotificationService: inAppMock.Object);

        var result = await paymentService.CreatePaymentAsync(
            Tenant1,
            new CreatePaymentRequest
            {
                InvoiceId = invoice.Id,
                Amount = 500.00m,
                Currency = "INR",
                PaymentDate = DateTime.UtcNow.Date,
                Method = "BankTransfer",
                Reference = "NEFT-FAILSAFE-01"
            },
            "finance@ibms.com");

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Data);
        Assert.Equal("Completed", result.Data!.Status);
    }

    [Fact]
    public async Task PaymentService_QueuesNotificationAsync_WhenBackgroundQueueConfigured()
    {
        var ctx = new TestContext();
        var invoice = await ctx.SeedInvoiceAsync(totalAmount: 1000.00m);

        var notificationMock = new Moq.Mock<INotificationService>();
        var queueMock = new Moq.Mock<IPaymentNotificationQueue>();
        var queued = new List<(int PaymentId, int TenantId, string EventType, string? Actor)>();
        queueMock
            .Setup(q => q.EnqueueAsync(
                Moq.It.IsAny<int>(),
                Tenant1,
                "PaymentReceived",
                "finance@ibms.com",
                Moq.It.IsAny<CancellationToken>()))
            .Callback<int, int, string, string?, CancellationToken>((pid, tid, ev, actor, _) => queued.Add((pid, tid, ev, actor)))
            .Returns(ValueTask.CompletedTask);

        var paymentService = new PaymentService(
            ctx.PaymentRepo,
            ctx.InvoiceRepo,
            ctx.CustomerRepo,
            ctx.NumberGenService,
            ctx.AuditRepo,
            ctx.UnitOfWork,
            outboxService: null,
            notificationService: notificationMock.Object,
            paymentNotificationQueue: queueMock.Object);

        var result = await paymentService.CreatePaymentAsync(
            Tenant1,
            new CreatePaymentRequest
            {
                InvoiceId = invoice.Id,
                Amount = 450.00m,
                Currency = "INR",
                PaymentDate = DateTime.UtcNow.Date,
                Method = "BankTransfer",
                Reference = "QUEUE-NOTIFY-01"
            },
            "finance@ibms.com");

        Assert.True(result.IsSuccess);
        Assert.Single(queued);
        Assert.Equal(result.Data!.Id, queued[0].PaymentId);
        Assert.Equal("PaymentReceived", queued[0].EventType);
        notificationMock.Verify(
            n => n.SendPaymentNotificationAsync(Moq.It.IsAny<int>(), Moq.It.IsAny<int>(), Moq.It.IsAny<string>(), Moq.It.IsAny<string?>()),
            Moq.Times.Never);
    }
}
