using Billing.Application.Interfaces;
using Billing.Application.Services;
using Billing.Infrastructure.Data;
using Billing.Infrastructure.Repositories;
using Billing.Infrastructure.Services;
using Billing.Worker;
using Microsoft.EntityFrameworkCore;

var builder = Host.CreateApplicationBuilder(args);

// Database configuration
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Server=localhost;Port=3306;Database=invoice;User=root;Password=Pilli@1995;";

builder.Services.AddDbContext<BillingDbContext>(options =>
    options.UseMySql(
        connectionString,
        ServerVersion.AutoDetect(connectionString)
    )
    .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.PendingModelChangesWarning))
);

builder.Services.AddScoped<ICurrentUserService, WorkerCurrentUserService>();

// Core infrastructure services
builder.Services.AddScoped<IEmailService, EmailService>();
builder.Services.AddScoped<EmailService>();
builder.Services.AddSingleton<IInvoicePdfEngine, QuestPdfInvoiceEngine>();
builder.Services.AddScoped<IDocumentStorageService, LocalStorageService>();
builder.Services.AddSingleton<IWebhookSecurityService, WebhookSecurityService>();
builder.Services.AddHttpClient<IWebhookDispatcher, WebhookDispatcher>();

// Application Services
builder.Services.AddScoped<ICustomerService, CustomerService>();
builder.Services.AddScoped<IProductService, ProductService>();
builder.Services.AddScoped<ICategoryService, CategoryService>();
builder.Services.AddScoped<IDiscountService, DiscountService>();
builder.Services.AddScoped<IDiscountSettingService, DiscountSettingService>();
builder.Services.AddScoped<IAuditService, AuditService>();
builder.Services.AddScoped<ITaxSettingService, TaxSettingService>();
builder.Services.AddScoped<ITaxCalculationService, TaxCalculationService>();
builder.Services.AddScoped<IChargeSettingService, ChargeSettingService>();
builder.Services.AddScoped<IChargeCalculationService, ChargeCalculationService>();
builder.Services.AddScoped<INumberingSettingService, NumberingSettingService>();
builder.Services.AddScoped<INumberGenerationService, NumberGenerationService>();
builder.Services.AddScoped<IFinancialCalculationEngine, FinancialCalculationEngine>();
builder.Services.AddScoped<IQuotationService, QuotationService>();
builder.Services.AddScoped<IQuotationActionService, QuotationActionService>();
builder.Services.AddScoped<IPaymentService, PaymentService>();
builder.Services.AddScoped<IInvoiceService, InvoiceService>();
builder.Services.AddScoped<IInvoiceTemplateService, InvoiceTemplateService>();
builder.Services.AddScoped<ICreditNoteService, CreditNoteService>();
builder.Services.AddScoped<ITemplateEngineService, TemplateEngineService>();
builder.Services.AddScoped<INotificationTemplateService, NotificationTemplateService>();
builder.Services.AddScoped<INotificationService, NotificationService>();
builder.Services.AddScoped<IOutboxService, OutboxService>();
builder.Services.AddScoped<IWebhookService, WebhookService>();
builder.Services.AddScoped<IWebhookDeliveryService, WebhookDeliveryService>();
builder.Services.AddScoped<IIntegrationApplicationService, IntegrationApplicationService>();

// Module 16 Background Job Services
builder.Services.AddScoped<IOverdueInvoiceJobService, OverdueInvoiceJobService>();
builder.Services.AddScoped<IReminderJobService, ReminderJobService>();
builder.Services.AddScoped<IPdfGenerationJobService, PdfGenerationJobService>();
builder.Services.AddScoped<IEmailNotificationJobService, EmailNotificationJobService>();
builder.Services.AddScoped<IWebhookDeliveryJobService, WebhookDeliveryJobService>();
builder.Services.AddScoped<IExportJobService, ExportJobService>();
builder.Services.AddScoped<IOperationalCleanupJobService, OperationalCleanupJobService>();
builder.Services.AddScoped<IBackgroundJobCoordinator, BackgroundJobCoordinator>();

// Repositories
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IRoleRepository, RoleRepository>();
builder.Services.AddScoped<IUserSessionRepository, UserSessionRepository>();
builder.Services.AddScoped<ITenantRepository, TenantRepository>();
builder.Services.AddScoped<ICustomerRepository, CustomerRepository>();
builder.Services.AddScoped<IProductRepository, ProductRepository>();
builder.Services.AddScoped<ICategoryRepository, CategoryRepository>();
builder.Services.AddScoped<IDiscountRuleRepository, DiscountRuleRepository>();
builder.Services.AddScoped<IDiscountSettingRepository, DiscountSettingRepository>();
builder.Services.AddScoped<IAuditLogRepository, AuditLogRepository>();
builder.Services.AddScoped<ITaxRepository, TaxRepository>();
builder.Services.AddScoped<IChargeRepository, ChargeRepository>();
builder.Services.AddScoped<INumberingRepository, NumberingRepository>();
builder.Services.AddScoped<IQuotationRepository, QuotationRepository>();
builder.Services.AddScoped<IInvoiceRepository, InvoiceRepository>();
builder.Services.AddScoped<IInvoiceCommunicationRepository, InvoiceCommunicationRepository>();
builder.Services.AddScoped<IPaymentRepository, PaymentRepository>();
builder.Services.AddScoped<IInvoiceTemplateRepository, InvoiceTemplateRepository>();
builder.Services.AddScoped<IInvoiceSnapshotRepository, InvoiceSnapshotRepository>();
builder.Services.AddScoped<IGeneratedDocumentRepository, GeneratedDocumentRepository>();
builder.Services.AddScoped<ICreditNoteRepository, CreditNoteRepository>();
builder.Services.AddScoped<INotificationTemplateRepository, NotificationTemplateRepository>();
builder.Services.AddScoped<INotificationLogRepository, NotificationLogRepository>();
builder.Services.AddScoped<IWebhookRepository, WebhookRepository>();
builder.Services.AddScoped<IWebhookDeliveryRepository, WebhookDeliveryRepository>();
builder.Services.AddScoped<IIntegrationApplicationRepository, IntegrationApplicationRepository>();
builder.Services.AddScoped<IOutboxRepository, OutboxRepository>();
builder.Services.AddScoped<IExportJobRepository, ExportJobRepository>();
builder.Services.AddScoped<IOperationalCleanupRepository, OperationalCleanupRepository>();
builder.Services.AddScoped<IUnitOfWork, UnitOfWork>();

// Hosted Worker
builder.Services.AddHostedService<Worker>();

var host = builder.Build();
host.Run();
