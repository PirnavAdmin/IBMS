using Billing.Application.Interfaces;
using Billing.Application.Services;
using Billing.API.Controllers;
using Billing.Contracts.Settings;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Billing.Infrastructure.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using System.Security.Claims;
using Xunit;

namespace Billing.Tests.Integration;

public class ReminderSettingsIntegrationTests
{
    private static BillingDbContext CreateDb(string name)
    {
        var opts = new DbContextOptionsBuilder<BillingDbContext>()
            .UseInMemoryDatabase(name)
            .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
            .Options;
        return new BillingDbContext(opts);
    }

    [Fact]
    public async Task ReminderSettingsController_GetAndUpdate_PersistsPerTenantAndDrivesReminderJobWithPayOnlineChoice()
    {
        await using var db = CreateDb(nameof(ReminderSettingsController_GetAndUpdate_PersistsPerTenantAndDrivesReminderJobWithPayOnlineChoice));
        var tenant = new Tenant { Id = 2, Name = "Pirnav Test", CompanyEmail = "billing@pirnav.test", Status = "Active" };
        var customer = new Customer { Id = 11, TenantId = 2, Name = "Ravi", Email = "ravi@example.com", Status = "Active" };
        db.Tenants.Add(tenant);
        db.Customers.Add(customer);

        var partialInvoiceNoPayOnline = new Invoice
        {
            Id = 201,
            TenantId = 2,
            CustomerId = 11,
            Customer = customer,
            InvoiceNumber = "INV-REM-201",
            Currency = "INR",
            Status = "Sent",
            AllowPartialPayments = true,
            IncludePayOnlineButton = false,
            TotalAmount = 2000m,
            PaidAmount = 0m,
            BalanceAmount = 2000m,
            DueDate = DateTime.UtcNow.Date.AddDays(15),
            UpdatedAtUtc = DateTime.UtcNow.AddDays(-8),
            CreatedAtUtc = DateTime.UtcNow.AddDays(-8)
        };
        var overdueWithPayOnline = new Invoice
        {
            Id = 202,
            TenantId = 2,
            CustomerId = 11,
            Customer = customer,
            InvoiceNumber = "INV-REM-202",
            Currency = "INR",
            Status = "Overdue",
            AllowPartialPayments = false,
            IncludePayOnlineButton = true,
            TotalAmount = 1500m,
            PaidAmount = 0m,
            BalanceAmount = 1500m,
            DueDate = DateTime.UtcNow.Date.AddDays(-3),
            UpdatedAtUtc = DateTime.UtcNow.AddDays(-10),
            CreatedAtUtc = DateTime.UtcNow.AddDays(-10)
        };
        db.Invoices.AddRange(partialInvoiceNoPayOnline, overdueWithPayOnline);
        db.SaveChanges();

        var settingRepo = new ReminderSettingRepository(db);
        var settingService = new ReminderSettingService(settingRepo);
        var controller = new ReminderSettingsController(settingService)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(new[]
                    {
                        new Claim(ClaimTypes.Name, "TenantAdmin"),
                        new Claim(ClaimTypes.Role, "TenantAdmin"),
                        new Claim("TenantId", "2")
                    }, "TestAuth"))
                }
            }
        };

        // 1. Default GET returns 7-day partial & 1-day overdue
        var getAction = await controller.GetReminderSettings(default);
        var getOk = Assert.IsType<OkObjectResult>(getAction);
        var getPayload = Assert.IsType<Billing.Contracts.ApiResponse<ReminderSettingsDto>>(getOk.Value);
        Assert.Equal(7, getPayload.Data!.PartialPaymentIntervalValue);
        Assert.Equal("Days", getPayload.Data.PartialPaymentIntervalUnit);
        Assert.Equal(1, getPayload.Data.OverdueReminderIntervalDays);

        // 2. PUT updates settings in DB
        var putAction = await controller.UpdateReminderSettings(new UpdateReminderSettingsRequest
        {
            PartialPaymentReminderEnabled = true,
            PartialPaymentIntervalValue = 7,
            PartialPaymentIntervalUnit = "Days",
            OverdueReminderEnabled = true,
            OverdueReminderIntervalDays = 1,
            UpcomingDueReminderEnabled = true
        }, default);
        Assert.IsType<OkObjectResult>(putAction);

        // 3. ReminderJob runs against EF DB & sends emails preserving each invoice's IncludePayOnlineButton
        var sentEmails = new List<(string Subject, string Body)>();
        var emailMock = new Mock<IEmailService>();
        emailMock.Setup(e => e.SendEmailAsync("ravi@example.com", It.IsAny<string>(), It.IsAny<string>(), It.IsAny<byte[]?>(), It.IsAny<string?>()))
            .Callback<string, string, string, byte[]?, string?>((_, subj, body, _, _) => sentEmails.Add((subj, body)))
            .Returns(Task.CompletedTask);

        var notificationService = new NotificationService(
            new NotificationTemplateRepository(db),
            new NotificationLogRepository(db),
            new TemplateEngineService(),
            emailMock.Object,
            new InvoiceRepository(db),
            new PaymentRepository(db),
            Mock.Of<IQuotationRepository>(),
            Mock.Of<ICreditNoteRepository>(),
            new TenantRepository(db),
            new AuditLogRepository(db),
            NullLogger<NotificationService>.Instance);

        var reminderJob = new ReminderJobService(
            new InvoiceRepository(db),
            new TenantRepository(db),
            notificationService,
            new NotificationLogRepository(db),
            new InvoiceCommunicationRepository(db),
            NullLogger<ReminderJobService>.Instance,
            new PaymentRepository(db),
            null,
            settingRepo);

        var jobResult = await reminderJob.ProcessPaymentRemindersAsync(2);
        Assert.True(jobResult.Success);
        Assert.Equal(2, jobResult.ProcessedCount);
        Assert.Equal(2, sentEmails.Count);

        var partialEmail = Assert.Single(sentEmails, e => e.Subject.Contains("INV-REM-201"));
        Assert.DoesNotContain("Click Here to Pay Online", partialEmail.Body);
        Assert.DoesNotContain("Pay Now", partialEmail.Body);
        Assert.DoesNotContain("/pay/201", partialEmail.Body);

        var overdueEmail = Assert.Single(sentEmails, e => e.Subject.Contains("INV-REM-202"));
        Assert.Contains("Click Here to Pay Online", overdueEmail.Body);
        Assert.Contains("/pay/202?tenantId=2", overdueEmail.Body);

        // Re-running within same day/7-day window dispatches 0 duplicates
        var secondRun = await reminderJob.ProcessPaymentRemindersAsync(2);
        Assert.True(secondRun.Success);
        Assert.Equal(0, secondRun.ProcessedCount);
    }
}
