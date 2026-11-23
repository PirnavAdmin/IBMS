using Billing.Application.Interfaces;
using Billing.Domain.Entities;
using Billing.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Repositories;

public class NotificationTemplateRepository : INotificationTemplateRepository
{
    private readonly BillingDbContext _dbContext;

    public NotificationTemplateRepository(BillingDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<List<NotificationTemplate>> GetAllAsync(int tenantId, string? eventType = null, bool? isActive = null)
    {
        var query = _dbContext.NotificationTemplates
            .AsNoTracking()
            .Where(t => t.TenantId == tenantId);

        if (!string.IsNullOrWhiteSpace(eventType))
        {
            query = query.Where(t => t.EventType == eventType.Trim());
        }

        if (isActive.HasValue)
        {
            query = query.Where(t => t.IsActive == isActive.Value);
        }

        return await query.OrderBy(t => t.EventType).ThenBy(t => t.Name).ToListAsync();
    }

    public async Task<NotificationTemplate?> GetByIdAsync(int id, int tenantId)
    {
        return await _dbContext.NotificationTemplates
            .FirstOrDefaultAsync(t => t.Id == id && t.TenantId == tenantId);
    }

    public async Task<NotificationTemplate?> GetActiveTemplateAsync(int tenantId, string eventType, string channel = "Email")
    {
        return await _dbContext.NotificationTemplates
            .AsNoTracking()
            .Where(t => t.TenantId == tenantId && t.EventType == eventType && t.Channel == channel && t.IsActive)
            .OrderByDescending(t => t.UpdatedAtUtc ?? t.CreatedAtUtc)
            .FirstOrDefaultAsync();
    }

    public async Task<NotificationTemplate> AddAsync(NotificationTemplate template)
    {
        await _dbContext.NotificationTemplates.AddAsync(template);
        await _dbContext.SaveChangesAsync();
        return template;
    }

    public async Task<NotificationTemplate> UpdateAsync(NotificationTemplate template)
    {
        template.UpdatedAtUtc = DateTime.UtcNow;
        _dbContext.NotificationTemplates.Update(template);
        await _dbContext.SaveChangesAsync();
        return template;
    }

    public async Task<bool> DeleteAsync(int id, int tenantId)
    {
        var template = await _dbContext.NotificationTemplates.FirstOrDefaultAsync(t => t.Id == id && t.TenantId == tenantId);
        if (template == null) return false;

        _dbContext.NotificationTemplates.Remove(template);
        await _dbContext.SaveChangesAsync();
        return true;
    }

    public async Task SeedDefaultTemplatesAsync(int tenantId, string createdBy = "System")
    {
        var existingTypes = await _dbContext.NotificationTemplates
            .Where(t => t.TenantId == tenantId)
            .Select(t => t.EventType)
            .Distinct()
            .ToListAsync();

        const string helpAndContactSnippet = @"
<div style=""margin-top:24px;padding:14px 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;color:#334155;"">
    <div style=""font-weight:700;color:#0f172a;margin-bottom:4px;"">&#128172; Need Help or Have Questions?</div>
    <div style=""margin:2px 0 8px;font-size:12px;color:#64748b;"">Our support team is here to help you. Reach out to us directly:</div>
    <div>&#9993; <strong>Email:</strong> <a href=""{{HelpEmailLink}}"" style=""color:#2563eb;text-decoration:none;font-weight:600;"">{{SupportEmail}}</a></div>
    <div>&#9742; <strong>Phone / Helpline:</strong> <a href=""{{HelpPhoneLink}}"" style=""color:#2563eb;text-decoration:none;font-weight:600;"">{{SupportPhone}}</a></div>
    <div style=""margin-top:4px;font-size:12px;color:#64748b;"">&#127970; <strong>Address:</strong> {{CompanyAddress}}</div>
</div>";

        var defaults = new List<NotificationTemplate>
        {
            new()
            {
                TenantId = tenantId,
                EventType = "InvoiceIssued",
                Channel = "Email",
                Name = "Default Invoice Issued Template",
                Description = "Triggered when an invoice is issued and finalized in the system",
                SubjectTemplate = "Invoice {{InvoiceNumber}} Issued from {{CompanyName}}",
                BodyTemplate = "<p>Dear {{CustomerName}},</p><p>An invoice with reference <strong>{{InvoiceNumber}}</strong> has been generated for <strong>{{Currency}} {{TotalAmount}}</strong>. Payment is due by <strong>{{DueDate}}</strong>.</p><p>Thank you for choosing {{CompanyName}}!</p>" + helpAndContactSnippet + "<p>Warm regards,<br>{{CompanyName}}<br>{{SupportEmail}}</p>",
                IsActive = true,
                CreatedBy = createdBy
            },
            new()
            {
                TenantId = tenantId,
                EventType = "InvoiceSent",
                Channel = "Email",
                Name = "Default Invoice Delivery Dispatch",
                Description = "Triggered when an invoice is sent directly to customer with PDF attached",
                SubjectTemplate = "Invoice {{InvoiceNumber}} from {{CompanyName}}",
                BodyTemplate = "<p>Dear {{CustomerName}},</p><p>Please find attached invoice <strong>{{InvoiceNumber}}</strong> for <strong>{{Currency}} {{TotalAmount}}</strong>.</p><p>Total Amount Due: <strong>{{Currency}} {{BalanceAmount}}</strong> payable by <strong>{{DueDate}}</strong>.</p><p><a href=\"{{PaymentLink}}\" style=\"display:inline-block;padding:10px 18px;background:#5A2508;color:#ffffff;text-decoration:none;border-radius:6px;\">Click Here to Pay Online</a></p>" + helpAndContactSnippet + "<p>Thank you,<br>{{CompanyName}}</p>",
                IsActive = true,
                CreatedBy = createdBy
            },
            new()
            {
                TenantId = tenantId,
                EventType = "PaymentReceived",
                Channel = "Email",
                Name = "Default Payment Receipt",
                Description = "Triggered when customer payment is successfully posted",
                SubjectTemplate = "Payment Receipt: {{PaymentNumber}} for Invoice {{InvoiceNumber}}",
                BodyTemplate = "<p>Dear {{CustomerName}},</p><p>Thank you! We have received your payment of <strong>{{Currency}} {{AmountPaid}}</strong> on {{PaymentDate}} via {{PaymentMethod}}.</p><p><strong>Transaction Ref:</strong> {{PaymentNumber}}<br><strong>Invoice Number:</strong> {{InvoiceNumber}}<br><strong>Remaining Balance:</strong> {{Currency}} {{RemainingBalance}}</p>" + helpAndContactSnippet + "<p>We appreciate your business.</p><p>Warm regards,<br>{{CompanyName}}</p>",
                IsActive = true,
                CreatedBy = createdBy
            },
            new()
            {
                TenantId = tenantId,
                EventType = "PaymentFailed",
                Channel = "Email",
                Name = "Default Payment Failed Alert",
                Description = "Triggered when an automated or online transaction fails",
                SubjectTemplate = "Payment Failed for Invoice {{InvoiceNumber}} - {{CompanyName}}",
                BodyTemplate = "<p>Dear {{CustomerName}},</p><p>We were unable to process your payment for invoice <strong>{{InvoiceNumber}}</strong>.</p><p><strong>Reason:</strong> {{FailureReason}}</p><p>To prevent service interruption, please retry your payment: <a href=\"{{PaymentLink}}\">Retry Payment</a></p>" + helpAndContactSnippet + "<p>Regards,<br>{{CompanyName}}</p>",
                IsActive = true,
                CreatedBy = createdBy
            },
            new()
            {
                TenantId = tenantId,
                EventType = "InvoiceOverdue",
                Channel = "Email",
                Name = "Default Overdue Reminder",
                Description = "Scheduled notification sent when an invoice passes its due date",
                SubjectTemplate = "URGENT REMINDER: Invoice {{InvoiceNumber}} is Overdue",
                BodyTemplate = "<p>Dear {{CustomerName}},</p><p>This is a formal reminder that invoice <strong>{{InvoiceNumber}}</strong> was due on {{DueDate}} and is now <strong>{{DaysOverdue}} days overdue</strong>.</p><p><strong>Total Outstanding Balance:</strong> {{Currency}} {{BalanceAmount}}</p><p>Please arrange payment at your earliest convenience: <a href=\"{{PaymentLink}}\">Pay Outstanding Balance</a></p>" + helpAndContactSnippet + "<p>If payment has already been sent, kindly disregard this notice.</p><p>Sincerely,<br>{{CompanyName}} Accounts Dept</p>",
                IsActive = true,
                CreatedBy = createdBy
            },
            new()
            {
                TenantId = tenantId,
                EventType = "QuotationSent",
                Channel = "Email",
                Name = "Default Quotation Delivery",
                Description = "Triggered when a price quotation is dispatched to a prospective client",
                SubjectTemplate = "Quotation {{QuotationNumber}} from {{CompanyName}}",
                BodyTemplate = "<p>Dear {{CustomerName}},</p><p>Thank you for considering {{CompanyName}}. Please find attached formal quotation <strong>{{QuotationNumber}}</strong> for <strong>{{Currency}} {{TotalAmount}}</strong>.</p><p>This quotation is valid until <strong>{{ExpiryDate}}</strong>.</p><p>Please review and let us know if you approve or require any revisions.</p>" + helpAndContactSnippet + "<p>Best regards,<br>{{CompanyName}}<br>{{SupportEmail}}</p>",
                IsActive = true,
                CreatedBy = createdBy
            },
            new()
            {
                TenantId = tenantId,
                EventType = "CreditNoteIssued",
                Channel = "Email",
                Name = "Default Credit Note Delivery",
                Description = "Triggered when an official credit adjustment is generated",
                SubjectTemplate = "Credit Note {{CreditNoteNumber}} for Invoice {{InvoiceNumber}}",
                BodyTemplate = "<p>Dear {{CustomerName}},</p><p>Please find attached Credit Note <strong>{{CreditNoteNumber}}</strong> for the amount of <strong>{{Currency}} {{CreditAmount}}</strong> applied to invoice {{InvoiceNumber}}.</p><p><strong>Reason:</strong> {{Reason}}</p><p>This amount has been credited to your account.</p>" + helpAndContactSnippet + "<p>Regards,<br>{{CompanyName}}</p>",
                IsActive = true,
                CreatedBy = createdBy
            }
        };

        var toAdd = defaults.Where(d => !existingTypes.Contains(d.EventType, StringComparer.OrdinalIgnoreCase)).ToList();
        if (toAdd.Count > 0)
        {
            await _dbContext.NotificationTemplates.AddRangeAsync(toAdd);
            await _dbContext.SaveChangesAsync();
        }
    }
}
