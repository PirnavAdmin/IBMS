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
using Moq;

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
            UnitOfWork = new FakeTransactionalUnitOfWork(InvoiceRepo, PaymentRepo, AuditRepo, CreditNoteRepo);
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

    // 1. Full credit without discount
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
        Assert.Equal(0m, result.Data.DiscountAmount);
        Assert.Equal(0m, result.Data.RemainingRefundableAmount); // Draft is not yet issued
        Assert.Single(result.Data.Items);
    }

    // 2. Partial credit without discount
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
        Assert.Equal(0m, result.Data.DiscountAmount);
    }

    // 3. Line-level discount
    [Fact]
    public async Task CreateCreditNote_PartialDiscountedCreditUsesInvoiceDiscountProportion()
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();
        var invoice = await ctx.SeedInvoiceAsync(subtotal: 900m, tax: 162m);
        invoice.Items.First().DiscountAmount = 100m;
        invoice.Items.First().TaxAmount = 162m;
        invoice.Items.First().TotalAmount = 1062m;
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
                    new() { InvoiceItemId = invoice.Items.First().Id, Quantity = 1m }
                }
            },
            "FinanceUser", new List<string> { "Finance" }, new List<string> { "billing.admin" });

        Assert.True(result.Success);
        Assert.Equal(50m, result.Data!.Items.Single().DiscountAmount);
        Assert.Equal(50m, result.Data.DiscountAmount);
        Assert.Equal(450m, result.Data.Subtotal);
        Assert.Equal(81m, result.Data.TaxAmount);
        Assert.Equal(531m, result.Data.TotalAmount);
    }

    // 4. Invoice-level discount
    [Fact]
    public async Task CreateCreditNote_WithInvoiceLevelDiscount_AllocatesProportionallyAndComputesTaxOnDiscountedBase()
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();
        // Two items: Item 1 = 2 * 300 = 600, Item 2 = 2 * 200 = 400 (Gross = 1000).
        // Invoice-level discount = 100 (allocated 60 to Item 1, 40 to Item 2).
        // Discounted taxable: Item 1 = 540, Item 2 = 360 (Total Subtotal = 900).
        // 18% GST on 900 = 162. Total = 1062.
        var invoice = new Invoice
        {
            Id = 201,
            TenantId = Tenant1,
            InvoiceNumber = "INV-0201",
            CustomerId = 10,
            InvoiceDate = DateTime.UtcNow.AddDays(-2),
            Status = "Issued",
            Subtotal = 900m,
            DiscountAmount = 100m,
            TaxAmount = 162m,
            TotalAmount = 1062m,
            BalanceAmount = 1062m,
            Items = new List<InvoiceItem>
            {
                new() { Id = 2011, InvoiceId = 201, Description = "Item A", Quantity = 2m, UnitPrice = 300m, DiscountAmount = 0m, TaxType = "GST", TaxRate = 18m, TaxAmount = 97.20m, TotalAmount = 637.20m },
                new() { Id = 2012, InvoiceId = 201, Description = "Item B", Quantity = 2m, UnitPrice = 200m, DiscountAmount = 0m, TaxType = "GST", TaxRate = 18m, TaxAmount = 64.80m, TotalAmount = 424.80m }
            }
        };
        await ctx.InvoiceRepo.AddAsync(invoice);

        // Credit 1 unit of Item A (half of Item A):
        // Gross = 300, Proportional invoice discount = 30, Taxable Subtotal = 270, Tax (18%) = 48.60, Total = 318.60
        var partialResult = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest
            {
                InvoiceId = invoice.Id,
                Type = "Partial",
                Reason = "Partial return of Item A",
                Items = new List<CreateCreditNoteItemRequest>
                {
                    new() { InvoiceItemId = 2011, Quantity = 1m }
                }
            },
            "Staff", new List<string> { "Staff" }, new List<string>());

        Assert.True(partialResult.Success);
        Assert.Equal(30m, partialResult.Data!.Items.Single().DiscountAmount);
        Assert.Equal(270m, partialResult.Data.Subtotal);
        Assert.Equal(48.60m, partialResult.Data.TaxAmount);
        Assert.Equal(318.60m, partialResult.Data.TotalAmount);
    }

    // 5. Combined discounts (line-level + invoice-level discount without double deduction)
    [Fact]
    public async Task CreateCreditNote_WithCombinedLineAndInvoiceDiscounts_CalculatesAccurateNetAndTax()
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();
        // Item 1: Qty 2 * 500 = 1000, Line Discount = 100 (Net after line discount = 900).
        // Extra Invoice Discount = 90 (Combined DiscountAmount = 190, Final Taxable Subtotal = 810).
        // Tax @ 18% on 810 = 145.80. Total = 955.80.
        var invoice = new Invoice
        {
            Id = 202,
            TenantId = Tenant1,
            InvoiceNumber = "INV-0202",
            CustomerId = 10,
            InvoiceDate = DateTime.UtcNow.AddDays(-2),
            Status = "Issued",
            Subtotal = 810m,
            DiscountAmount = 190m,
            TaxAmount = 145.80m,
            TotalAmount = 955.80m,
            BalanceAmount = 955.80m,
            Items = new List<InvoiceItem>
            {
                new() { Id = 2021, InvoiceId = 202, Description = "Enterprise License", Quantity = 2m, UnitPrice = 500m, DiscountAmount = 100m, TaxType = "GST", TaxRate = 18m, TaxAmount = 145.80m, TotalAmount = 955.80m }
            }
        };
        await ctx.InvoiceRepo.AddAsync(invoice);

        // Partial credit for Qty 1:
        // Line discount share = 50, Extra invoice discount share = 45 -> Total line discount = 95.
        // Subtotal = 500 - 95 = 405. Tax (18%) = 72.90. Total = 477.90.
        var result = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest
            {
                InvoiceId = invoice.Id,
                Type = "Partial",
                Reason = "Return 1 license with combined discounts",
                Items = new List<CreateCreditNoteItemRequest>
                {
                    new() { InvoiceItemId = 2021, Quantity = 1m }
                }
            },
            "Staff", new List<string> { "Staff" }, new List<string>());

        Assert.True(result.Success);
        Assert.Equal(95m, result.Data!.Items.Single().DiscountAmount);
        Assert.Equal(95m, result.Data.DiscountAmount);
        Assert.Equal(405m, result.Data.Subtotal);
        Assert.Equal(72.90m, result.Data.TaxAmount);
        Assert.Equal(477.90m, result.Data.TotalAmount);
    }

    // 6. 0%, 5%, 12%, 18%, and 28% tax slabs + invalid tax rate rejection
    [Theory]
    [InlineData(0, 1000, 0, 1000)]
    [InlineData(5, 1000, 50, 1050)]
    [InlineData(12, 1000, 120, 1120)]
    [InlineData(18, 1000, 180, 1180)]
    [InlineData(28, 1000, 280, 1280)]
    public async Task CreateCreditNote_AllSupportedGstTaxSlabs_CalculatesExpectedTaxAndTotal(
        decimal taxRate,
        decimal expectedSubtotal,
        decimal expectedTax,
        decimal expectedTotal)
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();
        var invoice = await ctx.SeedInvoiceAsync(id: 300 + (int)taxRate, subtotal: expectedSubtotal, tax: expectedTax);
        var item = invoice.Items.First();
        item.TaxRate = taxRate;
        item.TaxAmount = expectedTax;
        item.TotalAmount = expectedTotal;
        await ctx.InvoiceRepo.UpdateAsync(invoice);

        var result = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest
            {
                InvoiceId = invoice.Id,
                Type = "Full",
                Reason = $"Tax slab {taxRate}% audit"
            },
            "Staff", new List<string> { "Staff" }, new List<string>());

        Assert.True(result.Success);
        Assert.Equal(expectedSubtotal, result.Data!.Subtotal);
        Assert.Equal(expectedTax, result.Data.TaxAmount);
        Assert.Equal(expectedTotal, result.Data.TotalAmount);
    }

    [Fact]
    public async Task CreateCreditNote_WithInvalidTaxRate_ReturnsValidationError()
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();
        var invoice = await ctx.SeedInvoiceAsync();

        var result = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest
            {
                InvoiceId = invoice.Id,
                Type = "Partial",
                Reason = "Invalid tax test",
                Items = new List<CreateCreditNoteItemRequest>
                {
                    new()
                    {
                        InvoiceItemId = invoice.Items.First().Id,
                        Description = "Product Consulting",
                        Quantity = 1m,
                        UnitPrice = 500m,
                        TaxRate = 15m // Unsupported GST rate
                    }
                }
            },
            "Staff", new List<string> { "Staff" }, new List<string>());

        Assert.False(result.Success);
        Assert.Contains("Invalid tax rate", result.Message);
    }

    // 7 & 8. Inclusive tax vs Exclusive tax
    [Fact]
    public async Task CreateCreditNote_TaxInclusivePricing_ExtractsTaxWithoutDoubleTaxing()
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();
        // 2 units @ 590 inclusive of 18% GST = 1180 total (Base = 1000, Tax = 180)
        var invoice = new Invoice
        {
            Id = 207,
            TenantId = Tenant1,
            InvoiceNumber = "INV-0207",
            CustomerId = 10,
            InvoiceDate = DateTime.UtcNow.AddDays(-2),
            Status = "Issued",
            Subtotal = 1000m,
            DiscountAmount = 0m,
            TaxAmount = 180m,
            TotalAmount = 1180m,
            BalanceAmount = 1180m,
            Items = new List<InvoiceItem>
            {
                new()
                {
                    Id = 2071,
                    InvoiceId = 207,
                    Description = "Inclusive Item",
                    Quantity = 2m,
                    UnitPrice = 590m,
                    DiscountAmount = 0m,
                    TaxType = "Inclusive",
                    TaxRate = 18m,
                    TaxAmount = 180m,
                    TotalAmount = 1180m
                }
            }
        };
        await ctx.InvoiceRepo.AddAsync(invoice);

        // Credit 1 unit: Inclusive total = 590, Base = 500, Tax = 90
        var result = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest
            {
                InvoiceId = invoice.Id,
                Type = "Partial",
                Reason = "Return 1 tax-inclusive unit",
                Items = new List<CreateCreditNoteItemRequest>
                {
                    new() { InvoiceItemId = 2071, Quantity = 1m }
                }
            },
            "Staff", new List<string> { "Staff" }, new List<string>());

        Assert.True(result.Success);
        Assert.Equal(500m, result.Data!.Subtotal);
        Assert.Equal(90m, result.Data.TaxAmount);
        Assert.Equal(590m, result.Data.TotalAmount);
        Assert.True(result.Data.Items.Single().IsTaxInclusive);
    }

    // 9 & 10. CGST + SGST (Intra-state) vs IGST (Inter-state)
    [Fact]
    public async Task CreateCreditNote_IntraStateCgstSgstAndInterStateIgst_ComputesAccurateTaxSplits()
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();

        // Intra-state (CGST + SGST): 1000 @ 18% -> CGST = 90, SGST = 90, IGST = 0
        var intraInvoice = await ctx.SeedInvoiceAsync(id: 209, subtotal: 1000m, tax: 180m);
        intraInvoice.Items.First().TaxType = "CGST+SGST";
        await ctx.InvoiceRepo.UpdateAsync(intraInvoice);

        var intraResult = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest { InvoiceId = intraInvoice.Id, Type = "Full", Reason = "Intra-state credit" },
            "Staff", new List<string> { "Staff" }, new List<string>());

        Assert.True(intraResult.Success);
        Assert.Equal(90m, intraResult.Data!.CgstAmount);
        Assert.Equal(90m, intraResult.Data.SgstAmount);
        Assert.Equal(0m, intraResult.Data.IgstAmount);

        // Inter-state (IGST): 1000 @ 18% -> CGST = 0, SGST = 0, IGST = 180
        var interInvoice = await ctx.SeedInvoiceAsync(id: 210, subtotal: 1000m, tax: 180m);
        interInvoice.Items.First().TaxType = "IGST";
        await ctx.InvoiceRepo.UpdateAsync(interInvoice);

        var interResult = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest { InvoiceId = interInvoice.Id, Type = "Full", Reason = "Inter-state credit" },
            "Staff", new List<string> { "Staff" }, new List<string>());

        Assert.True(interResult.Success);
        Assert.Equal(0m, interResult.Data!.CgstAmount);
        Assert.Equal(0m, interResult.Data.SgstAmount);
        Assert.Equal(180m, interResult.Data.IgstAmount);
    }

    // 11. Previously credited quantities
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
                    new() { InvoiceItemId = invoice.Items.First().Id, Quantity = 1m }
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
                    new() { InvoiceItemId = invoice.Items.First().Id, Quantity = 1m }
                }
            },
            "FinanceUser", new List<string> { "Finance" }, new List<string> { "billing.admin" });

        Assert.True(full.Success);
        Assert.Equal("Full", full.Data!.Type);
        Assert.Equal(1m, full.Data.Items.Single().Quantity);
        Assert.Equal(590m, full.Data.TotalAmount);
    }

    // 12. Over-credit prevention
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
                    new() { InvoiceItemId = invoice.Items.First().Id, Quantity = 1m }
                }
            },
            "FinanceUser", new List<string> { "Finance" }, new List<string> { "billing.admin" });

        Assert.False(result.Success);
        Assert.Contains("cannot exceed remaining eligible creditable amount", result.Message);
    }

    [Fact]
    public async Task CreateCreditNote_RejectsQuantityExceedingRemainingEligibleQuantity()
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();
        var invoice = await ctx.SeedInvoiceAsync(subtotal: 1000m, tax: 180m); // 2 units

        var result = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest
            {
                InvoiceId = invoice.Id,
                Type = "Partial",
                Reason = "Over-credit quantity attempt",
                Items = new List<CreateCreditNoteItemRequest>
                {
                    new() { InvoiceItemId = invoice.Items.First().Id, Quantity = 3m }
                }
            },
            "Staff", new List<string> { "Staff" }, new List<string>());

        Assert.False(result.Success);
        Assert.Contains("cannot exceed its remaining eligible quantity", result.Message);
    }

    // 13. Concurrent credit requests
    [Fact]
    public async Task ConcurrentCreditRequests_AgainstSameInvoice_PreventOverCrediting()
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();
        var invoice = await ctx.SeedInvoiceAsync(subtotal: 1000m, tax: 180m); // 2 units total

        // Two concurrent requests each trying to credit all 2 units
        var task1 = Task.Run(() => ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest
            {
                InvoiceId = invoice.Id,
                Type = "Partial",
                Reason = "Concurrent request 1",
                Items = new List<CreateCreditNoteItemRequest>
                {
                    new() { InvoiceItemId = invoice.Items.First().Id, Quantity = 2m }
                }
            },
            "Staff1", new List<string> { "Staff" }, new List<string>()));

        var task2 = Task.Run(() => ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest
            {
                InvoiceId = invoice.Id,
                Type = "Partial",
                Reason = "Concurrent request 2",
                Items = new List<CreateCreditNoteItemRequest>
                {
                    new() { InvoiceItemId = invoice.Items.First().Id, Quantity = 2m }
                }
            },
            "Staff2", new List<string> { "Staff" }, new List<string>()));

        var results = await Task.WhenAll(task1, task2);

        // Exactly one succeeds and one is rejected due to per-invoice lock and active reservation
        Assert.Equal(1, results.Count(r => r.Success));
        Assert.Equal(1, results.Count(r => !r.Success));
    }

    // 14 & 15. Full credit rounding and Partial credit rounding
    [Fact]
    public async Task FullCreditAndPartialCreditRounding_PreservesLineItemTotalsAndReconcilesHeaderRounding()
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();
        // Invoice with 3 units @ 100 = 300, Discount = 10 (99.67 * 3 = 290.00), Tax 18% = 52.20, Total = 342.20 + 0.80 RoundOff = 343.00
        var invoice = new Invoice
        {
            Id = 214,
            TenantId = Tenant1,
            InvoiceNumber = "INV-0214",
            CustomerId = 10,
            InvoiceDate = DateTime.UtcNow.AddDays(-3),
            Status = "Issued",
            Subtotal = 290m,
            DiscountAmount = 10m,
            TaxAmount = 52.20m,
            RoundingAmount = 0.80m,
            TotalAmount = 343.00m,
            BalanceAmount = 343.00m,
            Items = new List<InvoiceItem>
            {
                new()
                {
                    Id = 2141,
                    InvoiceId = 214,
                    Description = "Precision Widget",
                    Quantity = 3m,
                    UnitPrice = 100m,
                    DiscountAmount = 10m,
                    TaxType = "GST",
                    TaxRate = 18m,
                    TaxAmount = 52.20m,
                    TotalAmount = 342.20m
                }
            }
        };
        await ctx.InvoiceRepo.AddAsync(invoice);

        // Partial credit 1: Qty 1 -> Discount = 3.33, Subtotal = 96.67, Tax = 17.40, Line Total = 114.07
        var partial1 = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest
            {
                InvoiceId = invoice.Id,
                Type = "Partial",
                Reason = "First unit return",
                Items = new List<CreateCreditNoteItemRequest> { new() { InvoiceItemId = 2141, Quantity = 1m } }
            },
            "Staff", new List<string> { "Staff" }, new List<string>());

        Assert.True(partial1.Success);
        Assert.Equal(3.33m, partial1.Data!.Items.Single().DiscountAmount);
        Assert.Equal(96.67m, partial1.Data.Subtotal);
        Assert.Equal(17.40m, partial1.Data.TaxAmount);
        Assert.Equal(114.07m, partial1.Data.TotalAmount);
        Assert.Equal(114.07m, partial1.Data.Items.Single().TotalAmount);

        await ctx.CreditNoteService.SubmitForApprovalAsync(Tenant1, partial1.Data.Id, "Staff", new List<string> { "Staff" }, new List<string>());
        await ctx.CreditNoteService.ApproveCreditNoteAsync(Tenant1, partial1.Data.Id, "Manager", new List<string> { "FinanceAdmin" }, new List<string>());
        await ctx.CreditNoteService.IssueCreditNoteAsync(Tenant1, partial1.Data.Id, "Manager", new List<string> { "FinanceAdmin" }, new List<string>());

        // Full credit for remaining 2 units:
        // Remaining discount = 10.00 - 3.33 = 6.67. Subtotal = 200 - 6.67 = 193.33. Tax = 34.80. Line Total = 228.13.
        // Remaining invoice creditable = 343.00 - 114.07 = 228.93.
        // Header RoundingAmount = +0.80, Header TotalAmount = 228.93, while Line Total remains 228.13 (not silently mutated!).
        var fullRemaining = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest
            {
                InvoiceId = invoice.Id,
                Type = "Full",
                Reason = "Remaining two units"
            },
            "Staff", new List<string> { "Staff" }, new List<string>());

        Assert.True(fullRemaining.Success);
        Assert.Equal(6.67m, fullRemaining.Data!.Items.Single().DiscountAmount);
        Assert.Equal(193.33m, fullRemaining.Data.Subtotal);
        Assert.Equal(34.80m, fullRemaining.Data.TaxAmount);
        Assert.Equal(228.13m, fullRemaining.Data.Items.Single().TotalAmount); // Line item total is consistent with its own subtotal + tax
        Assert.Equal(0.80m, fullRemaining.Data.RoundingAmount);
        Assert.Equal(228.93m, fullRemaining.Data.TotalAmount);
    }

    // 16 & 17. Invoice outstanding balance recalculation & Remaining credit eligibility on paid/partially paid invoices
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
    public async Task PaidInvoice_KeepsOutstandingBalanceSeparateFromRemainingCreditableAmount()
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();
        var invoice = await ctx.SeedInvoiceAsync(id: 217, subtotal: 1000m, tax: 180m, status: "Paid");
        invoice.PaidAmount = 1180m;
        invoice.BalanceAmount = 0m;
        await ctx.InvoiceRepo.UpdateAsync(invoice);

        var summaryBefore = await ctx.CreditNoteService.GetInvoiceCreditableSummaryAsync(Tenant1, invoice.Id, new List<string> { "Finance" });
        Assert.True(summaryBefore.Success);
        Assert.Equal(0m, summaryBefore.Data!.BalanceAmount);
        Assert.Equal(1180m, summaryBefore.Data.RemainingCreditableAmount);
        Assert.True(summaryBefore.Data.IsEligibleForCredit);

        // Issue a partial credit of 590 against the paid invoice
        var create = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest
            {
                InvoiceId = invoice.Id,
                Type = "Partial",
                Reason = "Post-payment credit adjustment",
                Items = new List<CreateCreditNoteItemRequest> { new() { InvoiceItemId = invoice.Items.First().Id, Quantity = 1m } }
            },
            "Staff", new List<string> { "Staff" }, new List<string>());
        await ctx.CreditNoteService.SubmitForApprovalAsync(Tenant1, create.Data!.Id, "Staff", new List<string> { "Staff" }, new List<string>());
        await ctx.CreditNoteService.ApproveCreditNoteAsync(Tenant1, create.Data.Id, "Manager", new List<string> { "FinanceAdmin" }, new List<string>());
        var issued = await ctx.CreditNoteService.IssueCreditNoteAsync(Tenant1, create.Data.Id, "Manager", new List<string> { "FinanceAdmin" }, new List<string>());

        Assert.True(issued.Success);
        Assert.Equal(0m, issued.Data!.InvoiceBalanceAmount); // Outstanding balance remains 0
        Assert.Equal(590m, issued.Data.InvoiceRemainingCreditableAmount); // Remaining creditable = 1180 - 590 = 590
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

    // 18 & 19. Full refund & Partial refund
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

    // 20 & 21. Duplicate refund prevention & Refund failure
    [Fact]
    public async Task ProcessRefund_DuplicateReferenceAndProviderFailure_AreRejectedWithoutDeductingBalance()
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();
        var invoice = await ctx.SeedInvoiceAsync(subtotal: 1000m, tax: 180m);

        var createResult = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest { InvoiceId = invoice.Id, Type = "Full", Reason = "Refund audit" },
            "Staff", new List<string> { "Staff" }, new List<string>());
        var cnId = createResult.Data!.Id;
        await ctx.CreditNoteService.SubmitForApprovalAsync(Tenant1, cnId, "Staff", new List<string> { "Staff" }, new List<string>());
        await ctx.CreditNoteService.ApproveCreditNoteAsync(Tenant1, cnId, "Manager", new List<string> { "FinanceAdmin" }, new List<string>());
        await ctx.CreditNoteService.IssueCreditNoteAsync(Tenant1, cnId, "Manager", new List<string> { "FinanceAdmin" }, new List<string>());

        // 1. Simulated provider failure
        var failedRefund = await ctx.CreditNoteService.ProcessRefundAsync(
            Tenant1,
            cnId,
            new ProcessRefundRequest
            {
                RefundAmount = 400m,
                PaymentMethod = "Bank Transfer",
                ReferenceNumber = "FAIL-999",
                SimulateProviderFailure = true
            },
            "Manager", new List<string> { "FinanceAdmin" }, new List<string>());
        Assert.False(failedRefund.Success);
        Assert.Contains("Refund processing failed", failedRefund.Message);

        var afterFail = await ctx.CreditNoteService.GetCreditNoteByIdAsync(Tenant1, cnId, new List<string> { "FinanceAdmin" });
        Assert.Equal(0m, afterFail.Data!.RefundedAmount);
        Assert.Equal(1180m, afterFail.Data.RemainingRefundableAmount);

        // 2. Valid refund with reference TXN-DUP-01
        var firstRefund = await ctx.CreditNoteService.ProcessRefundAsync(
            Tenant1,
            cnId,
            new ProcessRefundRequest { RefundAmount = 400m, PaymentMethod = "UPI", ReferenceNumber = "TXN-DUP-01" },
            "Manager", new List<string> { "FinanceAdmin" }, new List<string>());
        Assert.True(firstRefund.Success);
        Assert.Equal(780m, firstRefund.Data!.RemainingRefundableAmount);

        // 3. Duplicate refund with same ReferenceNumber TXN-DUP-01
        var duplicateRefund = await ctx.CreditNoteService.ProcessRefundAsync(
            Tenant1,
            cnId,
            new ProcessRefundRequest { RefundAmount = 400m, PaymentMethod = "UPI", ReferenceNumber = "TXN-DUP-01" },
            "Manager", new List<string> { "FinanceAdmin" }, new List<string>());
        Assert.False(duplicateRefund.Success);
        Assert.Contains("Duplicate refund detected", duplicateRefund.Message);
    }

    // 22. Invalid status transitions & Cancellation freeing quantities
    [Fact]
    public async Task CancelCreditNote_WhenInDraftOrApproved_SucceedsAndReleasesQuantity()
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

        // After cancellation, a new full credit note can be created against the same invoice
        var recreateResult = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest { InvoiceId = invoice.Id, Type = "Full", Reason = "Recreated after cancel" },
            "Staff", new List<string> { "Staff" }, new List<string>());
        Assert.True(recreateResult.Success);
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
    public async Task InvalidStatusTransitions_AreBlockedAtEveryStage()
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();
        var invoice = await ctx.SeedInvoiceAsync(subtotal: 1000m, tax: 180m);

        var draft = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest { InvoiceId = invoice.Id, Type = "Full", Reason = "Transition checks" },
            "Staff", new List<string> { "Staff" }, new List<string>());
        var cnId = draft.Data!.Id;

        // Cannot approve or issue or refund directly from Draft
        var approveDraft = await ctx.CreditNoteService.ApproveCreditNoteAsync(Tenant1, cnId, "Manager", new List<string> { "FinanceAdmin" }, new List<string>());
        Assert.False(approveDraft.Success);

        var issueDraft = await ctx.CreditNoteService.IssueCreditNoteAsync(Tenant1, cnId, "Manager", new List<string> { "FinanceAdmin" }, new List<string>());
        Assert.False(issueDraft.Success);

        var refundDraft = await ctx.CreditNoteService.ProcessRefundAsync(Tenant1, cnId, new ProcessRefundRequest { RefundAmount = 100m, PaymentMethod = "Bank Transfer" }, "Manager", new List<string> { "FinanceAdmin" }, new List<string>());
        Assert.False(refundDraft.Success);

        // Submit -> PendingApproval; cannot submit again (duplicate submission prevention)
        await ctx.CreditNoteService.SubmitForApprovalAsync(Tenant1, cnId, "Staff", new List<string> { "Staff" }, new List<string>());
        var duplicateSubmit = await ctx.CreditNoteService.SubmitForApprovalAsync(Tenant1, cnId, "Staff", new List<string> { "Staff" }, new List<string>());
        Assert.False(duplicateSubmit.Success);
    }

    // 23. Unauthorized approval and issuance + Separation of duties
    [Fact]
    public async Task UnauthorizedUser_CannotApproveOrIssue_AndCreatorCannotSelfApprove()
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();
        var invoice = await ctx.SeedInvoiceAsync(subtotal: 1000m, tax: 180m);

        var createResult = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest { InvoiceId = invoice.Id, Type = "Full", Reason = "Auth test" },
            "FinanceCreator", new List<string> { "FinanceAdmin" }, new List<string>());

        var cnId = createResult.Data!.Id;
        await ctx.CreditNoteService.SubmitForApprovalAsync(Tenant1, cnId, "FinanceCreator", new List<string> { "FinanceAdmin" }, new List<string>());

        // 1. Attempt approve as regular staff without finance roles/permissions
        var approveResult = await ctx.CreditNoteService.ApproveCreditNoteAsync(
            Tenant1,
            cnId,
            "StaffUser",
            new List<string> { "Staff" },
            new List<string> { "read.only" });

        Assert.False(approveResult.Success);
        Assert.Contains("permission to approve", approveResult.Message);

        // 2. Separation of duties: Creator ("FinanceCreator") cannot approve their own credit note
        var selfApprove = await ctx.CreditNoteService.ApproveCreditNoteAsync(
            Tenant1,
            cnId,
            "FinanceCreator",
            new List<string> { "FinanceAdmin" },
            new List<string>());
        Assert.False(selfApprove.Success);
        Assert.Contains("Separation of duties", selfApprove.Message);

        // 3. Another authorized manager ("OtherFinanceManager") can approve
        var validApprove = await ctx.CreditNoteService.ApproveCreditNoteAsync(
            Tenant1,
            cnId,
            "OtherFinanceManager",
            new List<string> { "FinanceAdmin" },
            new List<string>());
        Assert.True(validApprove.Success);

        // 4. Separation of duties: Creator ("FinanceCreator") cannot issue their own credit note
        var selfIssue = await ctx.CreditNoteService.IssueCreditNoteAsync(
            Tenant1,
            cnId,
            "FinanceCreator",
            new List<string> { "FinanceAdmin" },
            new List<string>());
        Assert.False(selfIssue.Success);
        Assert.Contains("Separation of duties", selfIssue.Message);
    }

    // 24. Database transaction rollback
    [Fact]
    public async Task IssueAndRefund_WhenPersistenceThrows_RollsBackAtomically()
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();
        var invoice = await ctx.SeedInvoiceAsync(subtotal: 1000m, tax: 180m);

        var create = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest { InvoiceId = invoice.Id, Type = "Full", Reason = "Rollback test" },
            "Staff", new List<string> { "Staff" }, new List<string>());
        var cnId = create.Data!.Id;

        await ctx.CreditNoteService.SubmitForApprovalAsync(Tenant1, cnId, "Staff", new List<string> { "Staff" }, new List<string>());
        await ctx.CreditNoteService.ApproveCreditNoteAsync(Tenant1, cnId, "Manager", new List<string> { "FinanceAdmin" }, new List<string>());

        // Simulate failure in AuditRepo during IssueCreditNoteAsync
        ctx.AuditRepo.ThrowOnAdd = true;
        var issueFail = await ctx.CreditNoteService.IssueCreditNoteAsync(Tenant1, cnId, "Manager", new List<string> { "FinanceAdmin" }, new List<string>());
        Assert.False(issueFail.Success);
        Assert.True(ctx.UnitOfWork.RollbackCount > 0);

        // Verify credit note remained in Approved status and invoice balance was rolled back to 1180
        var cnAfterRollback = await ctx.CreditNoteRepo.GetByIdAsync(cnId, Tenant1);
        var invAfterRollback = await ctx.InvoiceRepo.GetByIdAsync(invoice.Id, Tenant1);
        Assert.Equal("Approved", cnAfterRollback!.Status);
        Assert.Equal(0m, invAfterRollback!.CreditedAmount);
        Assert.Equal(1180m, invAfterRollback.BalanceAmount);

        // Restore AuditRepo and issue successfully
        ctx.AuditRepo.ThrowOnAdd = false;
        var issueSuccess = await ctx.CreditNoteService.IssueCreditNoteAsync(Tenant1, cnId, "Manager", new List<string> { "FinanceAdmin" }, new List<string>());
        Assert.True(issueSuccess.Success);

        // Simulate failure during ProcessRefundAsync
        ctx.AuditRepo.ThrowOnAdd = true;
        var refundFail = await ctx.CreditNoteService.ProcessRefundAsync(
            Tenant1,
            cnId,
            new ProcessRefundRequest { RefundAmount = 500m, PaymentMethod = "Bank Transfer", ReferenceNumber = "TXN-RB-1" },
            "Manager", new List<string> { "FinanceAdmin" }, new List<string>());
        Assert.False(refundFail.Success);

        var cnAfterRefundRollback = await ctx.CreditNoteRepo.GetByIdAsync(cnId, Tenant1);
        Assert.Equal("Issued", cnAfterRefundRollback!.Status);
        Assert.Equal(0m, cnAfterRefundRollback.RefundedAmount);
        Assert.Equal(1180m, cnAfterRefundRollback.RemainingRefundableAmount);
        Assert.Empty(cnAfterRefundRollback.Refunds);
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

    [Fact]
    public async Task IssueCreditNote_WhenNotificationServiceProvided_DispatchesCreditNoteNotification()
    {
        var ctx = new TestContext();
        var customer = await ctx.SeedCustomerAsync();
        var invoice = await ctx.SeedInvoiceAsync(customerId: customer.Id);

        var notificationServiceMock = new Moq.Mock<INotificationService>();
        notificationServiceMock
            .Setup(s => s.SendCreditNoteNotificationAsync(Moq.It.IsAny<int>(), Tenant1, "Manager", null, null))
            .ReturnsAsync(ApiResponse<Billing.Contracts.Notification.NotificationLogDto>.Ok(new Billing.Contracts.Notification.NotificationLogDto { Status = "Sent" }));

        var creditNoteService = new CreditNoteService(
            ctx.CreditNoteRepo,
            ctx.InvoiceRepo,
            ctx.CustomerRepo,
            ctx.NumberGenService,
            ctx.AuditRepo,
            ctx.UnitOfWork,
            outboxService: null,
            notificationService: notificationServiceMock.Object);

        var createResult = await creditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest
            {
                InvoiceId = invoice.Id,
                Type = "Full",
                Reason = "Overcharge correction"
            },
            "Staff", new List<string> { "Staff" }, new List<string>());

        var cnId = createResult.Data!.Id;
        await creditNoteService.SubmitForApprovalAsync(Tenant1, cnId, "Staff", new List<string> { "Staff" }, new List<string>());
        await creditNoteService.ApproveCreditNoteAsync(Tenant1, cnId, "Manager", new List<string> { "FinanceAdmin" }, new List<string>());
        var issueResult = await creditNoteService.IssueCreditNoteAsync(Tenant1, cnId, "Manager", new List<string> { "FinanceAdmin" }, new List<string>());

        Assert.True(issueResult.Success);
        notificationServiceMock.Verify(s => s.SendCreditNoteNotificationAsync(cnId, Tenant1, "Manager", null, null), Moq.Times.Once);
    }

    [Fact]
    public async Task CreateCreditNote_TaxInclusiveWithLineAndInvoiceDiscounts_DoesNotDoubleSubtractDiscount()
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();

        var lineDiscountOnlyInvoice = new Invoice
        {
            Id = 901,
            TenantId = Tenant1,
            InvoiceNumber = "INV-0901",
            CustomerId = 10,
            InvoiceDate = DateTime.UtcNow.AddDays(-2),
            Status = "Issued",
            Subtotal = 300m,
            DiscountAmount = 10m,
            TaxAmount = 44.24m,
            TotalAmount = 290m,
            BalanceAmount = 290m,
            Items = new List<InvoiceItem>
            {
                new()
                {
                    Id = 9011,
                    InvoiceId = 901,
                    Description = "Inclusive Item",
                    Quantity = 3m,
                    UnitPrice = 100m,
                    DiscountAmount = 10m,
                    TaxType = "Inclusive",
                    TaxRate = 18m,
                    TaxAmount = 44.24m,
                    TotalAmount = 290m
                }
            }
        };
        await ctx.InvoiceRepo.AddAsync(lineDiscountOnlyInvoice);

        var resLineOnly = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest
            {
                InvoiceId = lineDiscountOnlyInvoice.Id,
                Type = "Full",
                Reason = "Tax-inclusive line discount regression"
            },
            "Staff", new List<string> { "Staff" }, new List<string>());

        Assert.True(resLineOnly.Success);
        Assert.Equal(10m, resLineOnly.Data!.DiscountAmount);
        Assert.Equal(245.76m, resLineOnly.Data.Subtotal);
        Assert.Equal(44.24m, resLineOnly.Data.TaxAmount);
        Assert.Equal(290m, resLineOnly.Data.TotalAmount);
        Assert.True(resLineOnly.Data.Items.Single().IsTaxInclusive);

        var combinedDiscountInvoice = new Invoice
        {
            Id = 902,
            TenantId = Tenant1,
            InvoiceNumber = "INV-0902",
            CustomerId = 10,
            InvoiceDate = DateTime.UtcNow.AddDays(-2),
            Status = "Issued",
            Subtotal = 300m,
            DiscountAmount = 30m,
            TaxAmount = 44.24m,
            TotalAmount = 270m,
            BalanceAmount = 270m,
            Items = new List<InvoiceItem>
            {
                new()
                {
                    Id = 9021,
                    InvoiceId = 902,
                    Description = "Inclusive Item",
                    Quantity = 3m,
                    UnitPrice = 100m,
                    DiscountAmount = 10m,
                    TaxType = "Inclusive",
                    TaxRate = 18m,
                    TaxAmount = 44.24m,
                    TotalAmount = 290m
                }
            }
        };
        await ctx.InvoiceRepo.AddAsync(combinedDiscountInvoice);

        var resCombined = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest
            {
                InvoiceId = combinedDiscountInvoice.Id,
                Type = "Full",
                Reason = "Tax-inclusive line and invoice discount regression"
            },
            "Staff", new List<string> { "Staff" }, new List<string>());

        Assert.True(resCombined.Success);
        Assert.Equal(30m, resCombined.Data!.DiscountAmount);
        Assert.Equal(228.81m, resCombined.Data.Subtotal);
        Assert.Equal(41.19m, resCombined.Data.TaxAmount);
        Assert.Equal(270m, resCombined.Data.TotalAmount);
    }

    [Fact]
    public async Task GetInvoiceCreditableSummary_WithInvoiceLevelDiscount_PreservesAlreadyDiscountedLineTotalsAndAdjustsPreDiscountTotals()
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();

        var alreadyDiscountedInvoice = new Invoice
        {
            Id = 903,
            TenantId = Tenant1,
            InvoiceNumber = "INV-0903",
            CustomerId = 10,
            InvoiceDate = DateTime.UtcNow.AddDays(-2),
            Status = "Issued",
            Subtotal = 900m,
            DiscountAmount = 100m,
            TaxAmount = 162m,
            TotalAmount = 1062m,
            BalanceAmount = 1062m,
            Items = new List<InvoiceItem>
            {
                new() { Id = 9031, InvoiceId = 903, Description = "Item A", Quantity = 2m, UnitPrice = 300m, DiscountAmount = 0m, TaxType = "GST", TaxRate = 18m, TaxAmount = 97.20m, TotalAmount = 637.20m },
                new() { Id = 9032, InvoiceId = 903, Description = "Item B", Quantity = 2m, UnitPrice = 200m, DiscountAmount = 0m, TaxType = "GST", TaxRate = 18m, TaxAmount = 64.80m, TotalAmount = 424.80m }
            }
        };
        await ctx.InvoiceRepo.AddAsync(alreadyDiscountedInvoice);

        var summaryAlreadyDiscounted = await ctx.CreditNoteService.GetInvoiceCreditableSummaryAsync(
            Tenant1, alreadyDiscountedInvoice.Id, new List<string> { "Finance" });

        Assert.True(summaryAlreadyDiscounted.Success);
        Assert.Equal(60m, summaryAlreadyDiscounted.Data!.Items[0].DiscountAmount);
        Assert.Equal(637.20m, summaryAlreadyDiscounted.Data.Items[0].TotalAmount);
        Assert.Equal(424.80m, summaryAlreadyDiscounted.Data.Items[1].TotalAmount);
        Assert.Equal(1062m, summaryAlreadyDiscounted.Data.Items.Sum(x => x.TotalAmount));

        // FinancialCalculationEngine exclusive pre-discount tax case: 2*300 + 2*200 = 1000, InvoiceDiscount=100, line taxes=108+72=180, Charges=25, Total=1105
        var preDiscountExclusiveInvoice = new Invoice
        {
            Id = 905,
            TenantId = Tenant1,
            InvoiceNumber = "INV-0905",
            CustomerId = 10,
            InvoiceDate = DateTime.UtcNow.AddDays(-2),
            Status = "Issued",
            Subtotal = 1000m,
            DiscountAmount = 100m,
            TaxAmount = 180m,
            ChargesAmount = 25m,
            RoundingAmount = 0m,
            TotalAmount = 1105m,
            BalanceAmount = 1105m,
            Items = new List<InvoiceItem>
            {
                new() { Id = 9051, InvoiceId = 905, Description = "Item A", Quantity = 2m, UnitPrice = 300m, DiscountAmount = 0m, TaxType = "GST", TaxRate = 18m, TaxAmount = 108m, TotalAmount = 708m },
                new() { Id = 9052, InvoiceId = 905, Description = "Item B", Quantity = 2m, UnitPrice = 200m, DiscountAmount = 0m, TaxType = "GST", TaxRate = 18m, TaxAmount = 72m, TotalAmount = 472m }
            }
        };
        await ctx.InvoiceRepo.AddAsync(preDiscountExclusiveInvoice);

        var summaryPreDiscount = await ctx.CreditNoteService.GetInvoiceCreditableSummaryAsync(
            Tenant1, preDiscountExclusiveInvoice.Id, new List<string> { "Finance" });

        Assert.True(summaryPreDiscount.Success);
        Assert.Equal(25m, summaryPreDiscount.Data!.ChargesAmount);
        Assert.Equal(648m, summaryPreDiscount.Data.Items[0].TotalAmount);
        Assert.Equal(432m, summaryPreDiscount.Data.Items[1].TotalAmount);
        Assert.Equal(1080m, summaryPreDiscount.Data.Items.Sum(x => x.TotalAmount));
    }

    [Fact]
    public async Task CreateCreditNote_WithInvoicePersistedCustomTaxRateAndHeaderDerivedRate_Succeeds()
    {
        var ctx = new TestContext();
        await ctx.SeedCustomerAsync();

        var customRateInvoice = new Invoice
        {
            Id = 906,
            TenantId = Tenant1,
            InvoiceNumber = "INV-0906",
            CustomerId = 10,
            InvoiceDate = DateTime.UtcNow.AddDays(-2),
            Status = "Issued",
            Subtotal = 1395m,
            DiscountAmount = 105m,
            TaxAmount = 181.35m,
            RoundingAmount = -0.35m,
            TotalAmount = 1576m,
            BalanceAmount = 1576m,
            Items = new List<InvoiceItem>
            {
                new() { Id = 9061, InvoiceId = 906, Description = "Cooker", Quantity = 1m, UnitPrice = 1500m, DiscountAmount = 105m, TaxType = "GST", TaxRate = 13m, TaxAmount = 181.35m, TotalAmount = 1576.35m }
            }
        };
        await ctx.InvoiceRepo.AddAsync(customRateInvoice);

        var customRateResult = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest
            {
                InvoiceId = customRateInvoice.Id,
                Type = "Partial",
                Reason = "Custom GST rate regression",
                Items = new List<CreateCreditNoteItemRequest>
                {
                    new() { InvoiceItemId = 9061, Description = "Cooker", Quantity = 1m, UnitPrice = 1500m, TaxRate = 13m }
                }
            },
            "Staff", new List<string> { "Staff" }, new List<string>());

        Assert.True(customRateResult.Success);
        Assert.Equal(181.35m, customRateResult.Data!.TaxAmount);
        Assert.Equal(1576m, customRateResult.Data.TotalAmount);

        var headerOnlyInvoice = new Invoice
        {
            Id = 907,
            TenantId = Tenant1,
            InvoiceNumber = "INV-0907",
            CustomerId = 10,
            InvoiceDate = DateTime.UtcNow.AddDays(-2),
            Status = "Issued",
            Subtotal = 1000m,
            DiscountAmount = 100m,
            TaxAmount = 150m,
            TotalAmount = 1050m,
            BalanceAmount = 1050m,
            Items = new List<InvoiceItem>()
        };
        await ctx.InvoiceRepo.AddAsync(headerOnlyInvoice);

        var headerOnlyResult = await ctx.CreditNoteService.CreateCreditNoteAsync(
            Tenant1,
            new CreateCreditNoteRequest
            {
                InvoiceId = headerOnlyInvoice.Id,
                Type = "Full",
                Reason = "Header-only invoice derived tax rate",
                Items = new List<CreateCreditNoteItemRequest>
                {
                    new() { InvoiceItemId = 0, Description = "Invoice INV-0907", Quantity = 1m, UnitPrice = 1000m, TaxRate = 16.67m }
                }
            },
            "Staff", new List<string> { "Staff" }, new List<string>());

        Assert.True(headerOnlyResult.Success);
        Assert.Equal(1050m, headerOnlyResult.Data!.TotalAmount);
    }
}
