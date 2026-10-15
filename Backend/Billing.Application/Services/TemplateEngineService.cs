using System.Text.RegularExpressions;
using Billing.Application.Interfaces;
using Billing.Contracts.Notification;

namespace Billing.Application.Services;

public class TemplateEngineService : ITemplateEngineService
{
    private static readonly Regex VariableRegex = new(@"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}", RegexOptions.Compiled);
    private static readonly Regex UnsafeScriptRegex = new(@"<script[^>]*>[\s\S]*?</script>", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public string Render(string template, IDictionary<string, string> variables)
    {
        if (string.IsNullOrWhiteSpace(template)) return string.Empty;

        // Strip dangerous scripts
        var sanitized = UnsafeScriptRegex.Replace(template, string.Empty);

        return VariableRegex.Replace(sanitized, match =>
        {
            var key = match.Groups[1].Value;
            if (variables.TryGetValue(key, out var val))
            {
                return val ?? string.Empty;
            }

            // Case-insensitive fallback
            var matchedKey = variables.Keys.FirstOrDefault(k => string.Equals(k, key, StringComparison.OrdinalIgnoreCase));
            if (matchedKey != null && variables.TryGetValue(matchedKey, out var fallbackVal))
            {
                return fallbackVal ?? string.Empty;
            }

            return match.Value; // Keep unchanged if token not found
        });
    }

    public List<NotificationVariableDefinitionDto> GetAvailableVariables(string eventType)
    {
        var normalized = (eventType ?? string.Empty).Trim();

        var common = new List<NotificationVariableDefinitionDto>
        {
            new() { Name = "Customer Name", Token = "{{CustomerName}}", Description = "Full name of the customer or business", ExampleValue = "Acme Corp" },
            new() { Name = "Customer Email", Token = "{{CustomerEmail}}", Description = "Billing email of the recipient", ExampleValue = "billing@acme.com" },
            new() { Name = "Company Name", Token = "{{CompanyName}}", Description = "Tenant / Sender company name", ExampleValue = "Default Company" },
            new() { Name = "Support Email", Token = "{{SupportEmail}}", Description = "Contact / support email address", ExampleValue = "support@company.com" },
            new() { Name = "Currency", Token = "{{Currency}}", Description = "Transaction currency symbol or code", ExampleValue = "INR" },
        };

        if (normalized.Equals("InvoiceIssued", StringComparison.OrdinalIgnoreCase) ||
            normalized.Equals("InvoiceSent", StringComparison.OrdinalIgnoreCase) ||
            normalized.Equals("InvoiceOverdue", StringComparison.OrdinalIgnoreCase))
        {
            var invoiceVars = new List<NotificationVariableDefinitionDto>
            {
                new() { Name = "Invoice Number", Token = "{{InvoiceNumber}}", Description = "Unique reference number of the invoice", ExampleValue = "INV-2026-0001" },
                new() { Name = "Invoice Date", Token = "{{InvoiceDate}}", Description = "Date the invoice was officially generated", ExampleValue = "14 Oct 2026" },
                new() { Name = "Due Date", Token = "{{DueDate}}", Description = "Payment due date", ExampleValue = "28 Oct 2026" },
                new() { Name = "Total Amount", Token = "{{TotalAmount}}", Description = "Grand total gross amount with taxes", ExampleValue = "15,000.00" },
                new() { Name = "Balance Amount", Token = "{{BalanceAmount}}", Description = "Remaining unpaid balance on invoice", ExampleValue = "15,000.00" },
                new() { Name = "Payment Link", Token = "{{PaymentLink}}", Description = "Secure online customer payment portal URL", ExampleValue = "https://billing.company.com/pay/inv-001" }
            };

            if (normalized.Equals("InvoiceOverdue", StringComparison.OrdinalIgnoreCase))
            {
                invoiceVars.Add(new() { Name = "Days Overdue", Token = "{{DaysOverdue}}", Description = "Elapsed days past invoice due date", ExampleValue = "14" });
            }

            return common.Concat(invoiceVars).ToList();
        }

        if (normalized.Equals("PaymentReceived", StringComparison.OrdinalIgnoreCase) ||
            normalized.Equals("PaymentFailed", StringComparison.OrdinalIgnoreCase))
        {
            var paymentVars = new List<NotificationVariableDefinitionDto>
            {
                new() { Name = "Payment Number", Token = "{{PaymentNumber}}", Description = "Payment transaction receipt reference", ExampleValue = "PAY-2026-0001" },
                new() { Name = "Payment Date", Token = "{{PaymentDate}}", Description = "Timestamp when payment was recorded", ExampleValue = "14 Oct 2026" },
                new() { Name = "Payment Method", Token = "{{PaymentMethod}}", Description = "Card, Bank Transfer, UPI, or Cash", ExampleValue = "Bank Transfer" },
                new() { Name = "Amount Paid", Token = "{{AmountPaid}}", Description = "Processed payment amount", ExampleValue = "15,000.00" },
                new() { Name = "Invoice Number", Token = "{{InvoiceNumber}}", Description = "Associated invoice reference", ExampleValue = "INV-2026-0001" },
                new() { Name = "Remaining Balance", Token = "{{RemainingBalance}}", Description = "Balance remaining on the invoice", ExampleValue = "0.00" }
            };

            if (normalized.Equals("PaymentFailed", StringComparison.OrdinalIgnoreCase))
            {
                paymentVars.Add(new() { Name = "Failure Reason", Token = "{{FailureReason}}", Description = "Gateway error or decline message", ExampleValue = "Insufficient funds" });
                paymentVars.Add(new() { Name = "Payment Link", Token = "{{PaymentLink}}", Description = "URL to retry transaction", ExampleValue = "https://billing.company.com/pay/inv-001" });
            }

            return common.Concat(paymentVars).ToList();
        }

        if (normalized.Equals("QuotationSent", StringComparison.OrdinalIgnoreCase))
        {
            var quoteVars = new List<NotificationVariableDefinitionDto>
            {
                new() { Name = "Quotation Number", Token = "{{QuotationNumber}}", Description = "Quotation reference identifier", ExampleValue = "QT-2026-0001" },
                new() { Name = "Quotation Date", Token = "{{QuotationDate}}", Description = "Quotation creation date", ExampleValue = "14 Oct 2026" },
                new() { Name = "Expiry Date", Token = "{{ExpiryDate}}", Description = "Validity expiration date", ExampleValue = "28 Oct 2026" },
                new() { Name = "Total Amount", Token = "{{TotalAmount}}", Description = "Total estimated quote value", ExampleValue = "25,000.00" }
            };

            return common.Concat(quoteVars).ToList();
        }

        if (normalized.Equals("CreditNoteIssued", StringComparison.OrdinalIgnoreCase))
        {
            var creditVars = new List<NotificationVariableDefinitionDto>
            {
                new() { Name = "Credit Note Number", Token = "{{CreditNoteNumber}}", Description = "Credit note identifier", ExampleValue = "CN-2026-0001" },
                new() { Name = "Credit Note Date", Token = "{{CreditNoteDate}}", Description = "Date credit note was issued", ExampleValue = "14 Oct 2026" },
                new() { Name = "Invoice Number", Token = "{{InvoiceNumber}}", Description = "Original invoice credited", ExampleValue = "INV-2026-0001" },
                new() { Name = "Credit Amount", Token = "{{CreditAmount}}", Description = "Credited adjustment amount", ExampleValue = "3,000.00" },
                new() { Name = "Reason", Token = "{{Reason}}", Description = "Reason for issue (e.g. Return/Damaged)", ExampleValue = "Order cancellation adjustment" }
            };

            return common.Concat(creditVars).ToList();
        }

        return common;
    }

    public Dictionary<string, string> GetSampleVariables(string eventType)
    {
        var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["CustomerName"] = "Global Tech Industries",
            ["CustomerEmail"] = "finance@globaltech.com",
            ["CompanyName"] = "Apex Solutions Pvt Ltd",
            ["SupportEmail"] = "support@apexsolutions.com",
            ["Currency"] = "INR",
            ["InvoiceNumber"] = "INV-2026-0042",
            ["InvoiceDate"] = DateTime.UtcNow.ToString("dd MMM yyyy"),
            ["DueDate"] = DateTime.UtcNow.AddDays(15).ToString("dd MMM yyyy"),
            ["TotalAmount"] = "18,450.00",
            ["BalanceAmount"] = "18,450.00",
            ["PaymentLink"] = "https://apexsolutions.com/portal/invoices/INV-2026-0042/pay",
            ["DaysOverdue"] = "12",
            ["PaymentNumber"] = "PAY-2026-0089",
            ["PaymentDate"] = DateTime.UtcNow.ToString("dd MMM yyyy"),
            ["PaymentMethod"] = "Bank Transfer",
            ["AmountPaid"] = "18,450.00",
            ["RemainingBalance"] = "0.00",
            ["FailureReason"] = "Card transaction declined by issuing bank",
            ["QuotationNumber"] = "QT-2026-0105",
            ["QuotationDate"] = DateTime.UtcNow.ToString("dd MMM yyyy"),
            ["ExpiryDate"] = DateTime.UtcNow.AddDays(30).ToString("dd MMM yyyy"),
            ["CreditNoteNumber"] = "CN-2026-0012",
            ["CreditNoteDate"] = DateTime.UtcNow.ToString("dd MMM yyyy"),
            ["CreditAmount"] = "2,500.00",
            ["Reason"] = "Service tier adjustment rebate"
        };

        return dict;
    }

    public NotificationPreviewResponse Preview(NotificationPreviewRequest request)
    {
        var sampleData = GetSampleVariables(request.EventType);

        if (request.CustomVariables != null)
        {
            foreach (var kvp in request.CustomVariables)
            {
                sampleData[kvp.Key] = kvp.Value;
            }
        }

        var renderedSubject = Render(request.SubjectTemplate, sampleData);
        var renderedBody = Render(request.BodyTemplate, sampleData);

        return new NotificationPreviewResponse
        {
            EventType = request.EventType,
            RenderedSubject = renderedSubject,
            RenderedBody = renderedBody,
            UsedVariables = sampleData
        };
    }
}
