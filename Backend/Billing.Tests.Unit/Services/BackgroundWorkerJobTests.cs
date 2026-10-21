using System.Text;
using Billing.Application.Interfaces;
using Billing.Application.Services;
using Billing.Contracts;
using Billing.Contracts.Export;
using Billing.Contracts.InvoiceTemplate;
using Billing.Contracts.Notification;
using Billing.Contracts.Payment;
using Billing.Domain.Entities;
using Billing.Domain.Enums;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace Billing.Tests.Unit.Services;

public class BackgroundWorkerJobTests
{
    private const int TenantId = 1;

    // =========================================================================
    // 1. Overdue Invoice Job Tests
    // =========================================================================
    [Fact]
    public async Task OverdueInvoiceJob_TransitionsPastDueInvoices_ToOverdueStatus()
    {
        var invoiceRepo = new Mock<IInvoiceRepository>();
        var tenantRepo = new Mock<ITenantRepository>();
        var auditRepo = new Mock<IAuditLogRepository>();
        var outboxService = new Mock<IOutboxService>();
        var notificationService = new Mock<INotificationService>();
        var logger = new Mock<ILogger<OverdueInvoiceJobService>>();

        var pastDueInvoice = new Invoice
        {
            Id = 10,
            TenantId = TenantId,
            InvoiceNumber = "INV-0010",
            Status = "Issued",
            TotalAmount = 500m,
            BalanceAmount = 500m,
            DueDate = DateTime.UtcNow.AddDays(-2)
        };

        var currentInvoice = new Invoice
        {
            Id = 11,
            TenantId = TenantId,
            InvoiceNumber = "INV-0011",
            Status = "Issued",
            TotalAmount = 300m,
            BalanceAmount = 300m,
            DueDate = DateTime.UtcNow.AddDays(5)
        };

        var paidInvoice = new Invoice
        {
            Id = 12,
            TenantId = TenantId,
            InvoiceNumber = "INV-0012",
            Status = "Paid",
            TotalAmount = 200m,
            BalanceAmount = 0m,
            DueDate = DateTime.UtcNow.AddDays(-5)
        };

        invoiceRepo.Setup(r => r.GetAllAsync(TenantId))
            .ReturnsAsync(new List<Invoice> { pastDueInvoice, currentInvoice, paidInvoice });

        tenantRepo.Setup(r => r.GetAllAsync())
            .ReturnsAsync(new List<Tenant> { new() { Id = TenantId, Name = "Test Tenant" } });

        var job = new OverdueInvoiceJobService(
            invoiceRepo.Object,
            tenantRepo.Object,
            auditRepo.Object,
            logger.Object,
            outboxService.Object,
            notificationService.Object);

        var result = await job.ProcessOverdueInvoicesAsync(TenantId);

        Assert.True(result.Success);
        Assert.Equal(1, result.ProcessedCount);
        Assert.Equal("Overdue", pastDueInvoice.Status);
        invoiceRepo.Verify(r => r.UpdateAsync(pastDueInvoice, It.IsAny<CancellationToken>()), Times.Once);
        auditRepo.Verify(r => r.AddAsync(It.Is<AuditLog>(a => a.Action == "Invoice Overdue Transition"), It.IsAny<CancellationToken>()), Times.Once);
        outboxService.Verify(o => o.PublishEventAsync(TenantId, "invoice.overdue", It.IsAny<object>(), null), Times.Once);
    }

    // =========================================================================
    // 2. Reminder Job Tests
    // =========================================================================
    [Fact]
    public async Task ReminderJob_SendsReminder_WhenDueIn3Days_AndNotSentToday()
    {
        var invoiceRepo = new Mock<IInvoiceRepository>();
        var tenantRepo = new Mock<ITenantRepository>();
        var notificationService = new Mock<INotificationService>();
        var logRepo = new Mock<INotificationLogRepository>();
        var commRepo = new Mock<IInvoiceCommunicationRepository>();
        var logger = new Mock<ILogger<ReminderJobService>>();

        var invoice = new Invoice
        {
            Id = 20,
            TenantId = TenantId,
            InvoiceNumber = "INV-0020",
            Status = "Issued",
            TotalAmount = 1000m,
            BalanceAmount = 1000m,
            DueDate = DateTime.UtcNow.Date.AddDays(3),
            Customer = new Customer { Id = 5, Name = "Alice", Email = "alice@example.com" }
        };

        invoiceRepo.Setup(r => r.GetAllAsync(TenantId)).ReturnsAsync(new List<Invoice> { invoice });
        logRepo.Setup(r => r.QueryLogsAsync(TenantId, It.IsAny<NotificationLogQueryParameters>()))
            .ReturnsAsync(new PagedResult<NotificationLog>(new List<NotificationLog>(), 0, 1, 10));

        notificationService.Setup(s => s.SendInvoiceNotificationAsync(invoice.Id, TenantId, "PaymentReminder", "SystemReminderJob", null, null))
            .ReturnsAsync(ApiResponse<NotificationLogDto>.Ok(new NotificationLogDto { Id = 1, Status = "Sent" }));

        var job = new ReminderJobService(
            invoiceRepo.Object,
            tenantRepo.Object,
            notificationService.Object,
            logRepo.Object,
            commRepo.Object,
            logger.Object);

        var result = await job.ProcessPaymentRemindersAsync(TenantId);

        Assert.True(result.Success);
        Assert.Equal(1, result.ProcessedCount);
        notificationService.Verify(s => s.SendInvoiceNotificationAsync(invoice.Id, TenantId, "PaymentReminder", "SystemReminderJob", null, null), Times.Once);
        commRepo.Verify(c => c.AddAsync(It.Is<InvoiceCommunication>(i => i.InvoiceId == 20 && i.CommunicationType == "Email")), Times.Once);
    }

    [Fact]
    public async Task ReminderJob_SkipsReminder_WhenAlreadySentToday()
    {
        var invoiceRepo = new Mock<IInvoiceRepository>();
        var tenantRepo = new Mock<ITenantRepository>();
        var notificationService = new Mock<INotificationService>();
        var logRepo = new Mock<INotificationLogRepository>();
        var commRepo = new Mock<IInvoiceCommunicationRepository>();
        var logger = new Mock<ILogger<ReminderJobService>>();

        var invoice = new Invoice
        {
            Id = 21,
            TenantId = TenantId,
            InvoiceNumber = "INV-0021",
            Status = "Issued",
            TotalAmount = 1000m,
            BalanceAmount = 1000m,
            DueDate = DateTime.UtcNow.Date.AddDays(1)
        };

        invoiceRepo.Setup(r => r.GetAllAsync(TenantId)).ReturnsAsync(new List<Invoice> { invoice });
        // Return existing log sent today
        logRepo.Setup(r => r.QueryLogsAsync(TenantId, It.IsAny<NotificationLogQueryParameters>()))
            .ReturnsAsync(new PagedResult<NotificationLog>(new List<NotificationLog> { new() { Id = 99, Status = "Sent" } }, 1, 1, 10));

        var job = new ReminderJobService(
            invoiceRepo.Object,
            tenantRepo.Object,
            notificationService.Object,
            logRepo.Object,
            commRepo.Object,
            logger.Object);

        var result = await job.ProcessPaymentRemindersAsync(TenantId);

        Assert.True(result.Success);
        Assert.Equal(0, result.ProcessedCount);
        notificationService.Verify(s => s.SendInvoiceNotificationAsync(It.IsAny<int>(), It.IsAny<int>(), It.IsAny<string>(), It.IsAny<string>(), null, null), Times.Never);
    }

    // =========================================================================
    // 3. PDF Generation Job Tests
    // =========================================================================
    [Fact]
    public async Task PdfGenerationJob_RendersPdf_WhenDocumentMissing()
    {
        var invoiceRepo = new Mock<IInvoiceRepository>();
        var tenantRepo = new Mock<ITenantRepository>();
        var docRepo = new Mock<IGeneratedDocumentRepository>();
        var templateService = new Mock<IInvoiceTemplateService>();
        var storageService = new Mock<IDocumentStorageService>();
        var logger = new Mock<ILogger<PdfGenerationJobService>>();

        var invoice = new Invoice
        {
            Id = 30,
            TenantId = TenantId,
            InvoiceNumber = "INV-0030",
            Status = "Issued",
            TotalAmount = 500m
        };

        invoiceRepo.Setup(r => r.GetAllAsync(TenantId)).ReturnsAsync(new List<Invoice> { invoice });
        docRepo.Setup(r => r.GetByInvoiceIdAsync(30, TenantId)).ReturnsAsync((GeneratedDocument?)null);

        var job = new PdfGenerationJobService(
            invoiceRepo.Object,
            tenantRepo.Object,
            docRepo.Object,
            templateService.Object,
            storageService.Object,
            logger.Object);

        var result = await job.ProcessPendingPdfGenerationsAsync(TenantId);

        Assert.True(result.Success);
        Assert.Equal(1, result.ProcessedCount);
        templateService.Verify(s => s.GenerateInvoicePdfAsync(It.Is<GenerateInvoicePdfRequest>(r => r.InvoiceId == 30), TenantId, "SystemPdfJob", It.IsAny<CancellationToken>()), Times.Once);
    }

    // =========================================================================
    // 4. Email Notification Job Tests
    // =========================================================================
    [Fact]
    public async Task EmailNotificationJob_SendsQueuedEmail_AndUpdatesStatusToSent()
    {
        var logRepo = new Mock<INotificationLogRepository>();
        var tenantRepo = new Mock<ITenantRepository>();
        var emailService = new Mock<IEmailService>();
        var logger = new Mock<ILogger<EmailNotificationJobService>>();

        var queuedLog = new NotificationLog
        {
            Id = 40,
            TenantId = TenantId,
            Recipient = "test@example.com",
            Subject = "Subject",
            Message = "Message",
            Status = "Queued",
            RetryCount = 0
        };

        logRepo.Setup(r => r.QueryLogsAsync(TenantId, It.Is<NotificationLogQueryParameters>(p => p.Status == "Queued")))
            .ReturnsAsync(new PagedResult<NotificationLog>(new List<NotificationLog>
            {
                queuedLog
            }, 1, 1, 10));

        logRepo.Setup(r => r.QueryLogsAsync(TenantId, It.Is<NotificationLogQueryParameters>(p => p.Status == "Failed")))
            .ReturnsAsync(new PagedResult<NotificationLog>(new List<NotificationLog>(), 0, 1, 10));

        logRepo.Setup(r => r.GetByIdAsync(40, TenantId)).ReturnsAsync(queuedLog);

        var job = new EmailNotificationJobService(logRepo.Object, tenantRepo.Object, emailService.Object, logger.Object);

        var result = await job.ProcessPendingEmailNotificationsAsync(TenantId);

        Assert.True(result.Success);
        Assert.Equal(1, result.ProcessedCount);
        Assert.Equal("Sent", queuedLog.Status);
        emailService.Verify(e => e.SendEmailAsync("test@example.com", "Subject", "Message", null, null), Times.Once);
        logRepo.Verify(r => r.UpdateAsync(queuedLog), Times.Once);
    }

    // =========================================================================
    // 5. Webhook Delivery Job Tests
    // =========================================================================
    [Fact]
    public async Task WebhookDeliveryJob_ProcessesOutboxMessagesAndRetries()
    {
        var outboxService = new Mock<IOutboxService>();
        var logger = new Mock<ILogger<WebhookDeliveryJobService>>();

        outboxService.Setup(o => o.ProcessPendingOutboxMessagesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(3);
        outboxService.Setup(o => o.ProcessPendingRetriesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(2);

        var job = new WebhookDeliveryJobService(outboxService.Object, logger.Object);
        var result = await job.ProcessPendingWebhooksAsync();

        Assert.True(result.Success);
        Assert.Equal(5, result.ProcessedCount);
        outboxService.Verify(o => o.ProcessPendingOutboxMessagesAsync(It.IsAny<CancellationToken>()), Times.Once);
        outboxService.Verify(o => o.ProcessPendingRetriesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    // =========================================================================
    // 6. Export Job Service Tests
    // =========================================================================
    [Fact]
    public async Task ExportJobService_QueuesAndProcessesInvoiceExport_AsCsv()
    {
        var exportRepo = new Mock<IExportJobRepository>();
        var invoiceRepo = new Mock<IInvoiceRepository>();
        var paymentRepo = new Mock<IPaymentRepository>();
        var customerRepo = new Mock<ICustomerRepository>();
        var auditRepo = new Mock<IAuditLogRepository>();
        var storage = new Mock<IDocumentStorageService>();
        var logger = new Mock<ILogger<ExportJobService>>();

        var job = new ExportJob
        {
            Id = 50,
            TenantId = TenantId,
            JobType = "Invoice",
            ExportFormat = "CSV",
            Status = "Pending"
        };

        exportRepo.Setup(r => r.AddAsync(It.IsAny<ExportJob>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(job);

        exportRepo.Setup(r => r.GetPendingJobsAsync(10, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<ExportJob> { job });

        invoiceRepo.Setup(r => r.GetAllAsync(TenantId))
            .ReturnsAsync(new List<Invoice>
            {
                new()
                {
                    Id = 1,
                    TenantId = TenantId,
                    InvoiceNumber = "INV-001",
                    InvoiceDate = new DateTime(2026, 1, 1),
                    TotalAmount = 100m,
                    BalanceAmount = 50m,
                    Status = "Issued",
                    Customer = new Customer { Name = "Acme Corp", Email = "acme@example.com" }
                }
            });

        storage.Setup(s => s.SaveDocumentAsync(It.IsAny<byte[]>(), It.IsAny<string>(), "text/csv", TenantId, It.IsAny<CancellationToken>()))
            .ReturnsAsync("tenant_1/exports/invoices.csv");

        var service = new ExportJobService(
            exportRepo.Object,
            invoiceRepo.Object,
            paymentRepo.Object,
            customerRepo.Object,
            auditRepo.Object,
            storage.Object,
            logger.Object);

        // 1. Queue job
        var queueResult = await service.QueueExportJobAsync(new CreateExportJobRequest { JobType = "Invoice", ExportFormat = "CSV" }, TenantId, "Admin");
        Assert.True(queueResult.Success);

        // 2. Process pending job
        var processResult = await service.ProcessPendingExportJobsAsync();
        Assert.True(processResult.Success);
        Assert.Equal(1, processResult.ProcessedCount);
        Assert.Equal("Completed", job.Status);
        Assert.Equal(1, job.TotalRecords);
        Assert.Equal("tenant_1/exports/invoices.csv", job.StoragePath);

        // 3. Download job
        exportRepo.Setup(r => r.GetByIdAsync(50, TenantId, It.IsAny<CancellationToken>())).ReturnsAsync(job);
        storage.Setup(s => s.GetDocumentAsync("tenant_1/exports/invoices.csv", TenantId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Encoding.UTF8.GetBytes("Id,InvoiceNumber..."));

        var downloadResult = await service.DownloadExportFileAsync(50, TenantId);
        Assert.True(downloadResult.Success);
        Assert.NotEmpty(downloadResult.Data.Content);
    }

    [Fact]
    public async Task ExportJobService_RejectsInvalidFormat()
    {
        var service = new ExportJobService(
            Mock.Of<IExportJobRepository>(),
            Mock.Of<IInvoiceRepository>(),
            Mock.Of<IPaymentRepository>(),
            Mock.Of<ICustomerRepository>(),
            Mock.Of<IAuditLogRepository>(),
            Mock.Of<IDocumentStorageService>(),
            Mock.Of<ILogger<ExportJobService>>());

        var result = await service.QueueExportJobAsync(new CreateExportJobRequest { JobType = "Invoice", ExportFormat = "XML" }, TenantId, "Admin");
        Assert.False(result.Success);
        Assert.Contains("Supported export formats", result.Message);
    }

    // =========================================================================
    // 7. Operational Cleanup Job Tests
    // =========================================================================
    [Fact]
    public async Task OperationalCleanupJob_CleansSessionsOutboxWebhooksAndExports()
    {
        var cleanupRepo = new Mock<IOperationalCleanupRepository>();
        var exportRepo = new Mock<IExportJobRepository>();
        var storage = new Mock<IDocumentStorageService>();
        var auditRepo = new Mock<IAuditLogRepository>();
        var logger = new Mock<ILogger<OperationalCleanupJobService>>();

        cleanupRepo.Setup(c => c.CleanupExpiredSessionsAsync(It.IsAny<DateTime>(), It.IsAny<CancellationToken>())).ReturnsAsync(5);
        cleanupRepo.Setup(c => c.CleanupOldOutboxMessagesAsync(It.IsAny<DateTime>(), It.IsAny<CancellationToken>())).ReturnsAsync(12);
        cleanupRepo.Setup(c => c.CleanupOldWebhookDeliveriesAsync(It.IsAny<DateTime>(), It.IsAny<CancellationToken>())).ReturnsAsync(8);
        cleanupRepo.Setup(c => c.CleanupOldPaymentIdempotencyKeysAsync(It.IsAny<DateTime>(), It.IsAny<CancellationToken>())).ReturnsAsync(4);

        var oldJob = new ExportJob { Id = 90, TenantId = TenantId, StoragePath = "old/path.csv", Status = "Completed" };
        exportRepo.Setup(r => r.GetOldCompletedJobsAsync(It.IsAny<DateTime>(), 100, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<ExportJob> { oldJob });

        var job = new OperationalCleanupJobService(cleanupRepo.Object, exportRepo.Object, storage.Object, auditRepo.Object, logger.Object);
        var result = await job.RunOperationalCleanupAsync();

        Assert.True(result.Success);
        Assert.Equal(5, result.ExpiredSessionsCleaned);
        Assert.Equal(12, result.OldOutboxMessagesCleaned);
        Assert.Equal(8, result.OldWebhookDeliveriesCleaned);
        Assert.Equal(4, result.OldIdempotencyKeysPurged);
        Assert.Equal(1, result.ExpiredExportJobsCleaned);

        storage.Verify(s => s.DeleteDocumentAsync("old/path.csv", TenantId, It.IsAny<CancellationToken>()), Times.Once);
        exportRepo.Verify(r => r.DeleteAsync(oldJob, It.IsAny<CancellationToken>()), Times.Once);
        auditRepo.Verify(a => a.AddAsync(It.Is<AuditLog>(l => l.Action == "Operational Cleanup"), It.IsAny<CancellationToken>()), Times.Once);
    }

    // =========================================================================
    // 8. Background Job Coordinator Tests
    // =========================================================================
    [Fact]
    public async Task Coordinator_ExecutesJobByName_AndUpdatesStatuses()
    {
        var overdue = new Mock<IOverdueInvoiceJobService>();
        var reminder = new Mock<IReminderJobService>();
        var pdf = new Mock<IPdfGenerationJobService>();
        var email = new Mock<IEmailNotificationJobService>();
        var webhook = new Mock<IWebhookDeliveryJobService>();
        var export = new Mock<IExportJobService>();
        var cleanup = new Mock<IOperationalCleanupJobService>();
        var logger = new Mock<ILogger<BackgroundJobCoordinator>>();

        overdue.Setup(o => o.ProcessOverdueInvoicesAsync(TenantId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Billing.Contracts.BackgroundJobs.JobExecutionResultDto
            {
                JobName = "OverdueInvoiceJob",
                Success = true,
                ProcessedCount = 4,
                Duration = TimeSpan.FromMilliseconds(50),
                Message = "Done"
            });

        var coordinator = new BackgroundJobCoordinator(
            overdue.Object,
            reminder.Object,
            pdf.Object,
            email.Object,
            webhook.Object,
            export.Object,
            cleanup.Object,
            logger.Object);

        var statusesBefore = coordinator.GetAllJobStatuses();
        Assert.Equal(7, statusesBefore.Count);

        var execResult = await coordinator.RunJobByNameAsync("OverdueInvoiceJob", TenantId);
        Assert.True(execResult.Success);
        Assert.Equal(4, execResult.ProcessedCount);

        var statusesAfter = coordinator.GetAllJobStatuses();
        var overdueStatus = statusesAfter.First(s => s.JobName == "OverdueInvoiceJob");
        Assert.Equal("Succeeded", overdueStatus.Status);
        Assert.Equal(4, overdueStatus.LastProcessedCount);
        Assert.NotNull(overdueStatus.LastRunAtUtc);
    }
}
