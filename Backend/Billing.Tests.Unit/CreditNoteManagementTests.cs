using System.Security.Claims;
using Billing.API.Controllers;
using Billing.Application.Interfaces;
using Billing.Application.Services;
using Billing.Contracts;
using Billing.Contracts.CreditNote;
using Billing.Domain.Entities;
using Billing.Tests.Unit.Fakes;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Billing.Tests.Unit;

public class CreditNoteManagementTests
{
    private const int Tenant1 = 1;
    private const int Tenant2 = 2;

    private sealed class TestContext
    {
        public FakeInvoiceRepository InvoiceRepo { get; } = new();
        public FakeCreditNoteRepository CreditNoteRepo { get; } = new();
        public FakeCustomerRepository CustomerRepo { get; } = new();
        public FakeNumberingRepository NumberingRepo { get; } = new();
        public SnapshotAuditLogRepository AuditRepo { get; } = new();
        public FakePaymentRepository PaymentRepo { get; } = new();
        public FakeTransactionalUnitOfWork UnitOfWork { get; }
        public INumberGenerationService NumberGenService { get; }
        public CreditNoteService CreditNoteService { get; }

        public TestContext()
        {
            UnitOfWork = new FakeTransactionalUnitOfWork(InvoiceRepo, PaymentRepo, AuditRepo);
            NumberGenService = new NumberGenerationService(NumberingRepo);
            CreditNoteService = new CreditNoteService(
                CreditNoteRepo,
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
                Status = "Active"
            };
            await CustomerRepo.AddAsync(customer);
            return customer;
        }

        public async Task<Invoice> SeedInvoiceAsync(
            int tenantId = Tenant1,
            int id = 100,
            int customerId = 10,
            decimal subtotal = 1000m,
            decimal tax = 180m,
            string status = "Issued")
        {
            var invoice = new Invoice
            {
                Id = id,
                TenantId = tenantId,
                InvoiceNumber = $"INV-{id:D4}",
                CustomerId = customerId,
                InvoiceDate = DateTime.UtcNow.AddDays(-5),
                Status = status,
                Subtotal = subtotal,
                DiscountAmount = 0m,
                TaxAmount = tax,
                TotalAmount = subtotal + tax,
                PaidAmount = 0m,
                CreditedAmount = 0m,
                BalanceAmount = subtotal + tax,
                Items = new List<InvoiceItem>
                {
                    new()
                    {
                        Id = id * 10 + 1,
                        InvoiceId = id,
                        Description = "Product Consulting",
                        Quantity = 2m,
                        UnitPrice = 500m,
                        DiscountAmount = 0m,
                        TaxRate = 18m,
                        TaxAmount = 180m,
                        TotalAmount = 1180m
                    }
                }
            };
            await InvoiceRepo.AddAsync(invoice);
            return invoice;
        }
    }

    [Fact]
    public async Task CreateCreditNote_FullCredit_CreatesDraftWithExactInvoiceTotals()
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();
        var invoice = await ctx.SeedInvoiceAsync(subtotal: 1000m, tax: 180m);

        var request = new CreateCreditNoteRequest
        {
            InvoiceId = invoice.Id,
            Type = "Full",
            Reason = "Customer was billed incorrectly"
        };

        var result = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            request,
            "FinanceUser",
            new List<string> { "Finance" },
            new List<string> { "billing.admin" });

        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.Equal("Draft", result.Data.Status);
        Assert.Equal("Full", result.Data.Type);
        Assert.Equal(1180m, result.Data.TotalAmount);
        Assert.Equal(180m, result.Data.TaxAmount);
        Assert.Equal(1000m, result.Data.Subtotal);
        Assert.Single(result.Data.Items);
    }

    [Fact]
    public async Task CreateCreditNote_PartialCredit_CalculatesItemTaxesCorrectly()
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();
        var invoice = await ctx.SeedInvoiceAsync(subtotal: 1000m, tax: 180m);

        var request = new CreateCreditNoteRequest
        {
            InvoiceId = invoice.Id,
            Type = "Partial",
            Reason = "Return 1 unit of consulting",
            Items = new List<CreateCreditNoteItemRequest>
            {
                new()
                {
                    InvoiceItemId = invoice.Items.First().Id,
                    Description = "Product Consulting (1 unit)",
                    Quantity = 1m,
                    UnitPrice = 500m,
                    TaxRate = 18m,
                    TaxAmount = 90m,
                    TotalAmount = 590m
                }
            }
        };

        var result = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            request,
            "FinanceUser",
            new List<string> { "Finance" },
            new List<string> { "billing.admin" });

        Assert.True(result.Success);
        Assert.NotNull(result.Data);
        Assert.Equal("Draft", result.Data.Status);
        Assert.Equal("Partial", result.Data.Type);
        Assert.Equal(590m, result.Data.TotalAmount);
        Assert.Equal(90m, result.Data.TaxAmount);
        Assert.Equal(500m, result.Data.Subtotal);
    }

    [Fact]
    public async Task CreateCreditNote_PartialDiscountedCreditUsesInvoiceDiscountProportion()
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();
        var invoice = await ctx.SeedInvoiceAsync(subtotal: 900m, tax: 162m);
        invoice.Items[0].DiscountAmount = 100m;
        invoice.Items[0].TaxAmount = 162m;
        invoice.Items[0].TotalAmount = 1062m;
        invoice.DiscountAmount = 100m;
        invoice.Subtotal = 900m;
        invoice.TaxAmount = 162m;
        invoice.TotalAmount = 1062m;
        invoice.BalanceAmount = 1062m;
        await ctx.InvoiceRepo.UpdateAsync(invoice);

        var result = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest
            {
                InvoiceId = invoice.Id,
                Type = "Partial",
                Reason = "Return one discounted unit",
                Items = new List<CreateCreditNoteItemRequest>
                {
                    new() { InvoiceItemId = invoice.Items[0].Id, Quantity = 1m }
                }
            },
            "FinanceUser", new List<string> { "Finance" }, new List<string> { "billing.admin" });

        Assert.True(result.Success);
        Assert.Equal(50m, result.Data!.Items.Single().DiscountAmount);
        Assert.Equal(450m, result.Data.Subtotal);
        Assert.Equal(81m, result.Data.TaxAmount);
        Assert.Equal(531m, result.Data.TotalAmount);
    }

    [Fact]
    public async Task CreateCreditNote_FullCreditAfterPreviousIssueUsesOnlyRemainingQuantity()
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();
        var invoice = await ctx.SeedInvoiceAsync(subtotal: 1000m, tax: 180m);
        var partial = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest
            {
                InvoiceId = invoice.Id,
                Type = "Partial",
                Reason = "Return one unit",
                Items = new List<CreateCreditNoteItemRequest>
                {
                    new() { InvoiceItemId = invoice.Items[0].Id, Quantity = 1m }
                }
            },
            "Staff", new List<string> { "Staff" }, new List<string>());
        Assert.True(partial.Success);
        await ctx.CreditNoteService.SubmitForApprovalAsync(Tenant1, partial.Data!.Id, "Staff", new List<string> { "Staff" }, new List<string>());
        await ctx.CreditNoteService.ApproveCreditNoteAsync(Tenant1, partial.Data.Id, "Manager", new List<string> { "FinanceAdmin" }, new List<string>());
        await ctx.CreditNoteService.IssueCreditNoteAsync(Tenant1, partial.Data.Id, "Manager", new List<string> { "FinanceAdmin" }, new List<string>());

        var full = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest
            {
                InvoiceId = invoice.Id,
                Type = "Full",
                Reason = "Credit remaining invoice amount",
                Items = new List<CreateCreditNoteItemRequest>
                {
                    new() { InvoiceItemId = invoice.Items[0].Id, Quantity = 1m }
                }
            },
            "FinanceUser", new List<string> { "Finance" }, new List<string> { "billing.admin" });

        Assert.True(full.Success);
        Assert.Equal("Full", full.Data!.Type);
        Assert.Equal(1m, full.Data.Items.Single().Quantity);
        Assert.Equal(590m, full.Data.TotalAmount);
    }

    [Fact]
    public async Task CreateCreditNote_RejectsPartialAmountAboveRemainingCreditableBalance()
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();
        var invoice = await ctx.SeedInvoiceAsync(subtotal: 1000m, tax: 180m);
        invoice.CreditedAmount = 1170m;
        invoice.RecalculateBalanceAndStatus();
        await ctx.InvoiceRepo.UpdateAsync(invoice);

        var result = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest
            {
                InvoiceId = invoice.Id,
                Type = "Partial",
                Reason = "Credit selected unit",
                Items = new List<CreateCreditNoteItemRequest>
                {
                    new() { InvoiceItemId = invoice.Items[0].Id, Quantity = 1m }
                }
            },
            "FinanceUser", new List<string> { "Finance" }, new List<string> { "billing.admin" });

        Assert.False(result.Success);
        Assert.Contains("cannot exceed remaining eligible creditable amount", result.Message);
    }

    [Fact]
    public async Task CreditNoteLifecycle_DraftToSubmittedToApprovedToIssued_ReducesInvoiceBalance()
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();
        var invoice = await ctx.SeedInvoiceAsync(subtotal: 1000m, tax: 180m);

        // 1. Create Draft
        var createResult = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest
            {
                InvoiceId = invoice.Id,
                Type = "Full",
                Reason = "Cancellation"
            },
            "BillingStaff",
            new List<string> { "Staff" },
            new List<string>());

        Assert.True(createResult.Success);
        var creditNoteId = createResult.Data!.Id;

        // 2. Submit for Approval
        var submitResult = await ctx.CreditNoteService.SubmitForApprovalAsync(
            Tenant1,
            creditNoteId,
            "BillingStaff",
            new List<string> { "Staff" },
            new List<string>());

        Assert.True(submitResult.Success);
        Assert.Equal("PendingApproval", submitResult.Data!.Status);

        // Invoice balance is STILL untouched before issuing
        var invBeforeIssue = await ctx.InvoiceRepo.GetByIdAsync(invoice.Id, Tenant1);
        Assert.Equal(1180m, invBeforeIssue!.BalanceAmount);

        // 3. Approve
        var approveResult = await ctx.CreditNoteService.ApproveCreditNoteAsync(
            Tenant1,
            creditNoteId,
            "FinanceManager",
            new List<string> { "FinanceAdmin" },
            new List<string>());

        Assert.True(approveResult.Success);
        Assert.Equal("Approved", approveResult.Data!.Status);

        // 4. Issue Credit Note
        var issueResult = await ctx.CreditNoteService.IssueCreditNoteAsync(
            Tenant1,
            creditNoteId,
            "FinanceManager",
            new List<string> { "FinanceAdmin" },
            new List<string>());

        Assert.True(issueResult.Success);
        Assert.Equal("Issued", issueResult.Data!.Status);

        // Verify Invoice balance is updated to 0 and Status is Paid
        var invAfterIssue = await ctx.InvoiceRepo.GetByIdAsync(invoice.Id, Tenant1);
        Assert.NotNull(invAfterIssue);
        Assert.Equal(1180m, invAfterIssue.CreditedAmount);
        Assert.Equal(0m, invAfterIssue.BalanceAmount);
        Assert.Equal("Paid", invAfterIssue.Status);
    }

    [Fact]
    public async Task RejectCreditNote_WithReason_ChangesStatusToRejectedWithoutAffectingInvoice()
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();
        var invoice = await ctx.SeedInvoiceAsync(subtotal: 1000m, tax: 180m);

        var createResult = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest
            {
                InvoiceId = invoice.Id,
                Type = "Full",
                Reason = "Service issue"
            },
            "BillingStaff",
            new List<string> { "Staff" },
            new List<string>());

        await ctx.CreditNoteService.SubmitForApprovalAsync(Tenant1, createResult.Data!.Id, "BillingStaff", new List<string> { "Staff" }, new List<string>());

        var rejectResult = await ctx.CreditNoteService.RejectCreditNoteAsync(
            Tenant1,
            createResult.Data!.Id,
            new RejectCreditNoteRequest { Reason = "Invalid claim, service was delivered successfully" },
            "FinanceManager",
            new List<string> { "FinanceAdmin" },
            new List<string>());

        Assert.True(rejectResult.Success);
        Assert.Equal("Rejected", rejectResult.Data!.Status);
        Assert.Equal("Invalid claim, service was delivered successfully", rejectResult.Data.RejectionReason);

        var inv = await ctx.InvoiceRepo.GetByIdAsync(invoice.Id, Tenant1);
        Assert.Equal(1180m, inv!.BalanceAmount);
        Assert.Equal(0m, inv.CreditedAmount);
    }

    [Fact]
    public async Task ProcessRefund_OnIssuedCreditNote_DeductsRemainingRefundableAmount()
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();
        var invoice = await ctx.SeedInvoiceAsync(subtotal: 1000m, tax: 180m);

        var createResult = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest { InvoiceId = invoice.Id, Type = "Full", Reason = "Refund customer" },
            "Staff", new List<string> { "Staff" }, new List<string>());

        var cnId = createResult.Data!.Id;
        await ctx.CreditNoteService.SubmitForApprovalAsync(Tenant1, cnId, "Staff", new List<string> { "Staff" }, new List<string>());
        await ctx.CreditNoteService.ApproveCreditNoteAsync(Tenant1, cnId, "Manager", new List<string> { "FinanceAdmin" }, new List<string>());
        await ctx.CreditNoteService.IssueCreditNoteAsync(Tenant1, cnId, "Manager", new List<string> { "FinanceAdmin" }, new List<string>());

        // Partial Refund 500
        var refundResult1 = await ctx.CreditNoteService.ProcessRefundAsync(
            Tenant1,
            cnId,
            new ProcessRefundRequest { RefundAmount = 500m, PaymentMethod = "Bank Transfer", ReferenceNumber = "TXN-12345" },
            "Manager",
            new List<string> { "FinanceAdmin" },
            new List<string>());

        Assert.True(refundResult1.Success);
        Assert.Equal("PartiallyRefunded", refundResult1.Data!.Status);
        Assert.Equal(500m, refundResult1.Data.RefundedAmount);
        Assert.Equal(680m, refundResult1.Data.RemainingRefundableAmount);
        Assert.Single(refundResult1.Data.Refunds);

        // Refund remaining 680
        var refundResult2 = await ctx.CreditNoteService.ProcessRefundAsync(
            Tenant1,
            cnId,
            new ProcessRefundRequest { RefundAmount = 680m, PaymentMethod = "Bank Transfer", ReferenceNumber = "TXN-12346" },
            "Manager",
            new List<string> { "FinanceAdmin" },
            new List<string>());

        Assert.True(refundResult2.Success);
        Assert.Equal("Refunded", refundResult2.Data!.Status);
        Assert.Equal(1180m, refundResult2.Data.RefundedAmount);
        Assert.Equal(0m, refundResult2.Data.RemainingRefundableAmount);
        Assert.Equal(2, refundResult2.Data.Refunds.Count);
    }

    [Fact]
    public async Task ProcessRefund_ExceedingRemainingRefundable_Fails()
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();
        var invoice = await ctx.SeedInvoiceAsync(subtotal: 1000m, tax: 180m);

        var createResult = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest { InvoiceId = invoice.Id, Type = "Full", Reason = "Refund customer" },
            "Staff", new List<string> { "Staff" }, new List<string>());

        var cnId = createResult.Data!.Id;
        await ctx.CreditNoteService.SubmitForApprovalAsync(Tenant1, cnId, "Staff", new List<string> { "Staff" }, new List<string>());
        await ctx.CreditNoteService.ApproveCreditNoteAsync(Tenant1, cnId, "Manager", new List<string> { "FinanceAdmin" }, new List<string>());
        await ctx.CreditNoteService.IssueCreditNoteAsync(Tenant1, cnId, "Manager", new List<string> { "FinanceAdmin" }, new List<string>());

        var refundResult = await ctx.CreditNoteService.ProcessRefundAsync(
            Tenant1,
            cnId,
            new ProcessRefundRequest { RefundAmount = 2000m, PaymentMethod = "Bank Transfer" },
            "Manager",
            new List<string> { "FinanceAdmin" },
            new List<string>());

        Assert.False(refundResult.Success);
        Assert.Contains("exceeds remaining refundable amount", refundResult.Message);
    }

    [Fact]
    public async Task CancelCreditNote_WhenInDraftOrApproved_Succeeds()
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();
        var invoice = await ctx.SeedInvoiceAsync(subtotal: 1000m, tax: 180m);

        var createResult = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest { InvoiceId = invoice.Id, Type = "Full", Reason = "Cancellation test" },
            "Staff", new List<string> { "Staff" }, new List<string>());

        var cnId = createResult.Data!.Id;

        var cancelResult = await ctx.CreditNoteService.CancelCreditNoteAsync(
            Tenant1,
            cnId,
            new CancelCreditNoteRequest { Reason = "Draft was created by mistake" },
            "Staff",
            new List<string> { "Staff" },
            new List<string>());

        Assert.True(cancelResult.Success);
        Assert.Equal("Cancelled", cancelResult.Data!.Status);
        Assert.Equal("Draft was created by mistake", cancelResult.Data.CancellationReason);
    }

    [Fact]
    public async Task CancelCreditNote_WhenAlreadyIssued_Fails()
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();
        var invoice = await ctx.SeedInvoiceAsync(subtotal: 1000m, tax: 180m);

        var createResult = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest { InvoiceId = invoice.Id, Type = "Full", Reason = "Cancellation test" },
            "Staff", new List<string> { "Staff" }, new List<string>());

        var cnId = createResult.Data!.Id;
        await ctx.CreditNoteService.SubmitForApprovalAsync(Tenant1, cnId, "Staff", new List<string> { "Staff" }, new List<string>());
        await ctx.CreditNoteService.ApproveCreditNoteAsync(Tenant1, cnId, "Manager", new List<string> { "FinanceAdmin" }, new List<string>());
        await ctx.CreditNoteService.IssueCreditNoteAsync(Tenant1, cnId, "Manager", new List<string> { "FinanceAdmin" }, new List<string>());

        var cancelResult = await ctx.CreditNoteService.CancelCreditNoteAsync(
            Tenant1,
            cnId,
            new CancelCreditNoteRequest { Reason = "Try to cancel issued note" },
            "Manager",
            new List<string> { "FinanceAdmin" },
            new List<string>());

        Assert.False(cancelResult.Success);
        Assert.Contains("Issued or refunded credit notes cannot be cancelled", cancelResult.Message);
    }

    [Fact]
    public async Task UnauthorizedUser_CannotApproveCreditNote()
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();
        var invoice = await ctx.SeedInvoiceAsync(subtotal: 1000m, tax: 180m);

        var createResult = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest { InvoiceId = invoice.Id, Type = "Full", Reason = "Auth test" },
            "Staff", new List<string> { "Staff" }, new List<string>());

        var cnId = createResult.Data!.Id;
        await ctx.CreditNoteService.SubmitForApprovalAsync(Tenant1, cnId, "Staff", new List<string> { "Staff" }, new List<string>());

        // Attempt approve as regular staff without finance roles/permissions
        var approveResult = await ctx.CreditNoteService.ApproveCreditNoteAsync(
            Tenant1,
            cnId,
            "StaffUser",
            new List<string> { "Staff" },
            new List<string> { "read.only" });

        Assert.False(approveResult.Success);
        Assert.Contains("permission to approve", approveResult.Message);
    }

    [Fact]
    public async Task GetInvoiceCreditableSummary_ReturnsAccurateRemainingEligibleQuantities()
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();
        var invoice = await ctx.SeedInvoiceAsync(subtotal: 1000m, tax: 180m);

        var summaryBefore = await ctx.CreditNoteService.GetInvoiceCreditableSummaryAsync(Tenant1, invoice.Id, new List<string> { "Finance" });
        Assert.True(summaryBefore.Success);
        Assert.True(summaryBefore.Data!.IsEligibleForCredit);
        Assert.Equal(1180m, summaryBefore.Data.RemainingCreditableAmount);
        Assert.Equal(2m, summaryBefore.Data.Items.First().RemainingEligibleQuantity);

        // Create, approve and issue a partial credit for 1 unit
        var createResult = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest
            {
                InvoiceId = invoice.Id,
                Type = "Partial",
                Reason = "Return 1 unit",
                Items = new List<CreateCreditNoteItemRequest>
                {
                    new()
                    {
                        InvoiceItemId = invoice.Items.First().Id,
                        Description = "Consulting 1 unit",
                        Quantity = 1m,
                        UnitPrice = 500m,
                        TaxRate = 18m,
                        TaxAmount = 90m,
                        TotalAmount = 590m
                    }
                }
            },
            "Staff", new List<string> { "Staff" }, new List<string>());

        var cnId = createResult.Data!.Id;
        await ctx.CreditNoteService.SubmitForApprovalAsync(Tenant1, cnId, "Staff", new List<string> { "Staff" }, new List<string>());
        await ctx.CreditNoteService.ApproveCreditNoteAsync(Tenant1, cnId, "Manager", new List<string> { "FinanceAdmin" }, new List<string>());
        await ctx.CreditNoteService.IssueCreditNoteAsync(Tenant1, cnId, "Manager", new List<string> { "FinanceAdmin" }, new List<string>());

        // Check summary after issue
        var summaryAfter = await ctx.CreditNoteService.GetInvoiceCreditableSummaryAsync(Tenant1, invoice.Id, new List<string> { "Finance" });
        Assert.True(summaryAfter.Success);
        Assert.Equal(590m, summaryAfter.Data!.CreditedAmount);
        Assert.Equal(590m, summaryAfter.Data.RemainingCreditableAmount);
        Assert.Equal(1m, summaryAfter.Data.Items.First().RemainingEligibleQuantity);
        Assert.Equal(1m, summaryAfter.Data.Items.First().PreviouslyCreditedQuantity);
    }
}
