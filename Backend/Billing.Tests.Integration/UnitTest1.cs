using System.Security.Claims;
using Billing.API.Controllers;
using Billing.Application.Services;
using Billing.Contracts;
using Billing.Contracts.CreditNote;
using Billing.Domain.Entities;
using Billing.Tests.Unit.Fakes;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Billing.Tests.Integration;

public class UnitTest1
{
    private static ControllerContext CreateControllerContext(int tenantId, string userName, string[] roles, string[]? permissions = null)
    {
        var claims = new List<Claim>
        {
            new("tenant_id", tenantId.ToString()),
            new("name", userName)
        };
        foreach (var role in roles)
        {
            claims.Add(new Claim(ClaimTypes.Role, role));
        }
        if (permissions != null)
        {
            foreach (var perm in permissions)
            {
                claims.Add(new Claim("permissions", perm));
            }
        }

        var identity = new ClaimsIdentity(claims, "TestAuth");
        var httpContext = new DefaultHttpContext { User = new ClaimsPrincipal(identity) };
        return new ControllerContext { HttpContext = httpContext };
    }

    [Fact]
    public async Task CreditNotesController_EndToEndWorkflow_CalculatesCreditsUpdatesBalancesAndProcessesRefunds()
    {
        var invoiceRepo = new FakeInvoiceRepository();
        var creditNoteRepo = new FakeCreditNoteRepository();
        var customerRepo = new FakeCustomerRepository();
        var numberingRepo = new FakeNumberingRepository();
        var auditRepo = new SnapshotAuditLogRepository();
        var paymentRepo = new FakePaymentRepository();
        var unitOfWork = new FakeTransactionalUnitOfWork(invoiceRepo, paymentRepo, auditRepo, creditNoteRepo);
        var numberGen = new NumberGenerationService(numberingRepo);
        var service = new CreditNoteService(creditNoteRepo, invoiceRepo, customerRepo, numberGen, auditRepo, unitOfWork);

        await customerRepo.AddAsync(new Customer
        {
            Id = 10,
            TenantId = 1,
            CustomerCode = "CUST-010",
            Name = "Enterprise Client",
            CompanyName = "Enterprise Client Pvt Ltd",
            Currency = "INR",
            Status = "Active"
        });

        var invoice = new Invoice
        {
            Id = 500,
            TenantId = 1,
            InvoiceNumber = "INV-0500",
            CustomerId = 10,
            InvoiceDate = DateTime.UtcNow.AddDays(-3),
            Status = "Issued",
            Subtotal = 1800m,
            DiscountAmount = 200m,
            TaxAmount = 324m,
            TotalAmount = 2124m,
            PaidAmount = 0m,
            CreditedAmount = 0m,
            BalanceAmount = 2124m,
            Items = new List<InvoiceItem>
            {
                new()
                {
                    Id = 5001,
                    InvoiceId = 500,
                    Description = "Cloud Platform Subscription",
                    Quantity = 2m,
                    UnitPrice = 1000m,
                    DiscountAmount = 200m,
                    TaxType = "IGST",
                    TaxRate = 18m,
                    TaxAmount = 324m,
                    TotalAmount = 2124m
                }
            }
        };
        await invoiceRepo.AddAsync(invoice);

        var staffController = new CreditNotesController(service)
        {
            ControllerContext = CreateControllerContext(1, "BillingStaff", new[] { "Staff" })
        };
        staffController.HttpContext.Request.Headers["Idempotency-Key"] = "IDEM-CN-500-1";

        // 1. Create Partial Credit Note for 1 unit (Gross 1000 - Discount 100 = 900 Subtotal + 162 IGST = 1062 Total)
        var createAction = await staffController.CreateCreditNote(new CreateCreditNoteRequest
        {
            InvoiceId = 500,
            Type = "Partial",
            Reason = "Partial seat reduction",
            Items = new List<CreateCreditNoteItemRequest>
            {
                new() { InvoiceItemId = 5001, Description = "Cloud Platform Subscription", Quantity = 1m }
            }
        });
        var createdObj = Assert.IsType<ObjectResult>(createAction.Result);
        Assert.Equal(201, createdObj.StatusCode);
        var createdEnvelope = Assert.IsType<ApiResponse<CreditNoteDetailDto>>(createdObj.Value);
        Assert.True(createdEnvelope.Success);
        Assert.Equal(900m, createdEnvelope.Data!.Subtotal);
        Assert.Equal(100m, createdEnvelope.Data.DiscountAmount);
        Assert.Equal(162m, createdEnvelope.Data.TaxAmount);
        Assert.Equal(162m, createdEnvelope.Data.IgstAmount);
        Assert.Equal(0m, createdEnvelope.Data.CgstAmount);
        Assert.Equal(1062m, createdEnvelope.Data.TotalAmount);
        Assert.Equal(0m, createdEnvelope.Data.RemainingRefundableAmount);

        var cnId = createdEnvelope.Data.Id;

        // 2. Duplicate Idempotency-Key request is rejected
        var dupAction = await staffController.CreateCreditNote(new CreateCreditNoteRequest
        {
            InvoiceId = 500,
            Type = "Partial",
            Reason = "Duplicate retry",
            Items = new List<CreateCreditNoteItemRequest>
            {
                new() { InvoiceItemId = 5001, Description = "Cloud Platform Subscription", Quantity = 1m }
            }
        });
        Assert.IsType<BadRequestObjectResult>(dupAction.Result);

        // 3. Submit for approval
        var submitAction = await staffController.SubmitForApproval(cnId);
        var submitOk = Assert.IsType<OkObjectResult>(submitAction.Result);
        var submitEnvelope = Assert.IsType<ApiResponse<CreditNoteDetailDto>>(submitOk.Value);
        Assert.Equal("PendingApproval", submitEnvelope.Data!.Status);

        // 4. Approve and Issue as FinanceManager
        var managerController = new CreditNotesController(service)
        {
            ControllerContext = CreateControllerContext(1, "FinanceManager", new[] { "FinanceAdmin" })
        };

        var approveAction = await managerController.ApproveCreditNote(cnId);
        var approveOk = Assert.IsType<OkObjectResult>(approveAction.Result);
        var approveEnvelope = Assert.IsType<ApiResponse<CreditNoteDetailDto>>(approveOk.Value);
        Assert.Equal("Approved", approveEnvelope.Data!.Status);

        var issueAction = await managerController.IssueCreditNote(cnId);
        var issueOk = Assert.IsType<OkObjectResult>(issueAction.Result);
        var issueEnvelope = Assert.IsType<ApiResponse<CreditNoteDetailDto>>(issueOk.Value);
        Assert.Equal("Issued", issueEnvelope.Data!.Status);
        Assert.Equal(1062m, issueEnvelope.Data.RemainingRefundableAmount);
        Assert.Equal(1062m, issueEnvelope.Data.InvoiceBalanceAmount);
        Assert.Equal(1062m, issueEnvelope.Data.InvoiceRemainingCreditableAmount);

        // 5. Partial Refund (400) followed by Full Remaining Refund (662)
        var refund1Action = await managerController.ProcessRefund(cnId, new ProcessRefundRequest
        {
            RefundAmount = 400m,
            PaymentMethod = "Bank Transfer",
            ReferenceNumber = "UTR-90001"
        });
        var refund1Ok = Assert.IsType<OkObjectResult>(refund1Action.Result);
        var refund1Envelope = Assert.IsType<ApiResponse<CreditNoteDetailDto>>(refund1Ok.Value);
        Assert.Equal("PartiallyRefunded", refund1Envelope.Data!.Status);
        Assert.Equal(400m, refund1Envelope.Data.RefundedAmount);
        Assert.Equal(662m, refund1Envelope.Data.RemainingRefundableAmount);

        var refund2Action = await managerController.ProcessRefund(cnId, new ProcessRefundRequest
        {
            RefundAmount = 662m,
            PaymentMethod = "Bank Transfer",
            ReferenceNumber = "UTR-90002"
        });
        var refund2Ok = Assert.IsType<OkObjectResult>(refund2Action.Result);
        var refund2Envelope = Assert.IsType<ApiResponse<CreditNoteDetailDto>>(refund2Ok.Value);
        Assert.Equal("Refunded", refund2Envelope.Data!.Status);
        Assert.Equal(1062m, refund2Envelope.Data.RefundedAmount);
        Assert.Equal(0m, refund2Envelope.Data.RemainingRefundableAmount);
    }
}
