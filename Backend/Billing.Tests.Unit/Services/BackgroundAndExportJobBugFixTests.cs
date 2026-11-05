using System.Security.Claims;
using System.Text;
using Billing.API.Controllers;
using Billing.Application.Interfaces;
using Billing.Application.Services;
using Billing.Contracts;
using Billing.Contracts.BackgroundJobs;
using Billing.Contracts.Export;
using Billing.Contracts.Notification;
using Billing.Domain.Entities;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace Billing.Tests.Unit.Services;

public class BackgroundAndExportJobBugFixTests
{
    private const int TenantId = 1;

    [Fact]
    public async Task BackgroundJobsController_ForbidsTenantSpoofing_AndCrossTenantRun()
    {
        var coordinator = new Mock<IBackgroundJobCoordinator>();
        var controller = new BackgroundJobsController(coordinator.Object);

        // 1. Missing tenant claim + spoofed X-Tenant-Id header by non-SuperAdmin -> ForbidResult
        var spoofContext = new DefaultHttpContext();
        spoofContext.Request.Headers["X-Tenant-Id"] = "99";
        spoofContext.User = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.Role, "TenantAdmin")
        }, "TestAuth"));
        controller.ControllerContext = new ControllerContext { HttpContext = spoofContext };

        var triggerSpoof = controller.GetJobStatuses();
        Assert.IsType<ForbidResult>(triggerSpoof);

        // 2. Valid TenantId=1 claim, but request.TenantId=2 passed by non-SuperAdmin -> ForbidResult
        var crossTenantContext = new DefaultHttpContext();
        crossTenantContext.User = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.Role, "TenantAdmin"),
            new Claim("TenantId", "1")
        }, "TestAuth"));
        controller.ControllerContext = new ControllerContext { HttpContext = crossTenantContext };

        var crossTenantRun = await controller.RunJob("OverdueInvoiceJob", new RunJobRequest
        {
            TenantId = 2
        });
        Assert.IsType<ForbidResult>(crossTenantRun);
    }

    [Fact]
    public async Task ExportJobsController_BlocksAuditLogExportForStandardUser_ExcludesAuditLogsInList_AndAllowsInvoiceExportForBillingManager()
    {
        var exportService = new Mock<IExportJobService>();
        ExportJobFilterRequest? capturedFilter = null;

        exportService.Setup(s => s.QueueExportJobAsync(
                It.IsAny<CreateExportJobRequest>(), TenantId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(ApiResponse<ExportJobDto>.Ok(new ExportJobDto { Id = 1, JobType = "Invoice", Status = "Pending" }));

        exportService.Setup(s => s.GetExportJobsAsync(
                TenantId, It.IsAny<ExportJobFilterRequest>(), It.IsAny<CancellationToken>()))
            .Callback<int, ExportJobFilterRequest, CancellationToken>((_, filter, _) => capturedFilter = filter)
            .ReturnsAsync(ApiResponse<PagedResult<ExportJobDto>>.Ok(new PagedResult<ExportJobDto>(new List<ExportJobDto>(), 0, 1, 20)));

        var controller = new ExportJobsController(exportService.Object);

        // 1. Standard User attempting to export AuditLog -> ForbidResult
        var userContext = new DefaultHttpContext();
        userContext.User = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.Role, "User"),
            new Claim("TenantId", "1")
        }, "TestAuth"));
        controller.ControllerContext = new ControllerContext { HttpContext = userContext };

        var auditExportResult = await controller.QueueExportJob(
            new CreateExportJobRequest { JobType = "AuditLog", ExportFormat = "CSV" });
        Assert.IsType<ForbidResult>(auditExportResult);

        // 2. Standard User listing unfiltered exports -> ExcludeAuditLogs is set to true
        var listResult = await controller.GetExportJobs(new ExportJobFilterRequest());
        Assert.IsType<OkObjectResult>(listResult);
        Assert.NotNull(capturedFilter);
        Assert.True(capturedFilter!.ExcludeAuditLogs);

        // 3. BillingManager queueing Invoice export -> AcceptedAtActionResult
        var managerContext = new DefaultHttpContext();
        managerContext.User = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.Role, "BillingManager"),
            new Claim("TenantId", "1")
        }, "TestAuth"));
        controller.ControllerContext = new ControllerContext { HttpContext = managerContext };

        var invoiceExportResult = await controller.QueueExportJob(
            new CreateExportJobRequest { JobType = "Invoice", ExportFormat = "CSV" });
        Assert.IsType<AcceptedAtActionResult>(invoiceExportResult);
    }

    [Fact]
    public async Task OverdueInvoiceJob_DoesNotOverwritePartiallyPaidInvoices()
    {
        var invoiceRepo = new Mock<IInvoiceRepository>();
        var tenantRepo = new Mock<ITenantRepository>();
        var auditRepo = new Mock<IAuditLogRepository>();
        var logger = new Mock<ILogger<OverdueInvoiceJobService>>();

        var partiallyPaidInvoice = new Invoice
        {
            Id = 99,
            TenantId = TenantId,
            InvoiceNumber = "INV-PART-99",
            Status = "Partially Paid",
            TotalAmount = 500m,
            BalanceAmount = 200m,
            DueDate = DateTime.UtcNow.AddDays(-3)
        };

        invoiceRepo.Setup(r => r.GetAllAsync(TenantId))
            .ReturnsAsync(new List<Invoice> { partiallyPaidInvoice });

        var job = new OverdueInvoiceJobService(
            invoiceRepo.Object,
            tenantRepo.Object,
            auditRepo.Object,
            logger.Object);

        var result = await job.ProcessOverdueInvoicesAsync(TenantId);

        Assert.True(result.Success);
        Assert.Equal(0, result.ProcessedCount);
        Assert.Equal("Partially Paid", partiallyPaidInvoice.Status);
        invoiceRepo.Verify(r => r.UpdateAsync(It.IsAny<Invoice>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ExportJobService_AppliesFilters_AndSanitizesCsvFormulas()
    {
        var exportRepo = new Mock<IExportJobRepository>();
        var invoiceRepo = new Mock<IInvoiceRepository>();
        var storage = new Mock<IDocumentStorageService>();
        var logger = new Mock<ILogger<ExportJobService>>();

        var job = new ExportJob
        {
            Id = 77,
            TenantId = TenantId,
            JobType = "Invoice",
            ExportFormat = "CSV",
            Status = "Pending",
            FilterParametersJson = "{\"Status\":\"Paid\"}"
        };

        byte[]? savedBytes = null;
        exportRepo.Setup(r => r.GetPendingJobsAsync(10, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<ExportJob> { job });

        invoiceRepo.Setup(r => r.GetAllAsync(TenantId))
            .ReturnsAsync(new List<Invoice>
            {
                new()
                {
                    Id = 1,
                    TenantId = TenantId,
                    InvoiceNumber = "INV-PAID",
                    Status = "Paid",
                    TotalAmount = 100m,
                    Customer = new Customer { Name = "=cmd|' /C calc'!A0", Email = " =1+1" }
                },
                new()
                {
                    Id = 2,
                    TenantId = TenantId,
                    InvoiceNumber = "INV-DRAFT",
                    Status = "Draft",
                    TotalAmount = 200m,
                    Customer = new Customer { Name = "Draft Corp", Email = "draft@example.com" }
                }
            });

        storage.Setup(s => s.SaveDocumentAsync(It.IsAny<byte[]>(), It.IsAny<string>(), "text/csv", TenantId, It.IsAny<CancellationToken>()))
            .Callback<byte[], string, string, int, CancellationToken>((bytes, _, _, _, _) => savedBytes = bytes)
            .ReturnsAsync("tenant_1/exports/filtered.csv");

        var service = new ExportJobService(
            exportRepo.Object,
            invoiceRepo.Object,
            Mock.Of<IPaymentRepository>(),
            Mock.Of<ICustomerRepository>(),
            Mock.Of<IAuditLogRepository>(),
            storage.Object,
            logger.Object);

        var result = await service.ProcessPendingExportJobsAsync();

        Assert.True(result.Success);
        Assert.Equal("Completed", job.Status);
        Assert.Equal(1, job.TotalRecords);
        Assert.NotNull(savedBytes);
        var csv = Encoding.UTF8.GetString(savedBytes!);
        Assert.Contains("INV-PAID", csv);
        Assert.DoesNotContain("INV-DRAFT", csv);
        Assert.Contains("'=cmd|' /C calc'!A0", csv);
        Assert.Contains("' =1+1", csv);
    }

    [Fact]
    public async Task ExportJobService_MarksCancelledExportAsFailed_WithoutSavingPartialFile()
    {
        var exportRepo = new Mock<IExportJobRepository>();
        var invoiceRepo = new Mock<IInvoiceRepository>();
        var storage = new Mock<IDocumentStorageService>();
        var logger = new Mock<ILogger<ExportJobService>>();

        var job = new ExportJob
        {
            Id = 78,
            TenantId = TenantId,
            JobType = "Invoice",
            ExportFormat = "CSV",
            Status = "Pending"
        };

        using var cts = new CancellationTokenSource();

        exportRepo.Setup(r => r.GetPendingJobsAsync(10, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<ExportJob> { job });

        invoiceRepo.Setup(r => r.GetAllAsync(TenantId))
            .Callback(() => cts.Cancel())
            .ReturnsAsync(new List<Invoice>
            {
                new() { Id = 1, TenantId = TenantId, InvoiceNumber = "INV-1", Status = "Issued" }
            });

        var service = new ExportJobService(
            exportRepo.Object,
            invoiceRepo.Object,
            Mock.Of<IPaymentRepository>(),
            Mock.Of<ICustomerRepository>(),
            Mock.Of<IAuditLogRepository>(),
            storage.Object,
            logger.Object);

        await service.ProcessPendingExportJobsAsync(cts.Token);

        Assert.Equal("Failed", job.Status);
        storage.Verify(s => s.SaveDocumentAsync(It.IsAny<byte[]>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task EmailNotificationJob_MarksFailedImmediatelyOnFirstDispatchFailure()
    {
        var logRepo = new Mock<INotificationLogRepository>();
        var tenantRepo = new Mock<ITenantRepository>();
        var emailService = new Mock<IEmailService>();
        var logger = new Mock<ILogger<EmailNotificationJobService>>();

        var queuedLog = new NotificationLog
        {
            Id = 88,
            TenantId = TenantId,
            Recipient = "fail@example.com",
            Subject = "Test",
            Message = "Body",
            Status = "Queued",
            RetryCount = 0
        };

        logRepo.Setup(r => r.QueryLogsAsync(TenantId, It.Is<NotificationLogQueryParameters>(p => p.Status == "Queued")))
            .ReturnsAsync(new PagedResult<NotificationLog>(new List<NotificationLog> { queuedLog }, 1, 1, 10));
        logRepo.Setup(r => r.GetFailedForRetryAsync(TenantId, 3))
            .ReturnsAsync(new List<NotificationLog>());
        logRepo.Setup(r => r.GetByIdAsync(88, TenantId)).ReturnsAsync(queuedLog);

        emailService.Setup(e => e.SendEmailAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), null, null))
            .ThrowsAsync(new InvalidOperationException("SMTP down"));

        var job = new EmailNotificationJobService(logRepo.Object, tenantRepo.Object, emailService.Object, logger.Object);
        await job.ProcessPendingEmailNotificationsAsync(TenantId);

        Assert.Equal("Failed", queuedLog.Status);
        Assert.Equal(1, queuedLog.RetryCount);
        Assert.NotNull(queuedLog.NextRetryAtUtc);
    }
}
