using System;
using System.Text.RegularExpressions;

namespace Billing.Application.Common;

public static class HelpAndContactEmailHelper
{
    private static readonly Regex BodyClosingTagRegex = new(@"</body>", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex DivClosingTagRegex = new(@"</div>\s*$", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public static string GetMailtoLink(string supportEmail, string companyName, string? documentType = null, string? referenceNumber = null)
    {
        var cleanEmail = string.IsNullOrWhiteSpace(supportEmail) ? "support@company.com" : supportEmail.Trim();
        var cleanCompany = string.IsNullOrWhiteSpace(companyName) ? "Our Company" : companyName.Trim();

        var subject = !string.IsNullOrWhiteSpace(documentType) && !string.IsNullOrWhiteSpace(referenceNumber)
            ? $"Support Inquiry - {cleanCompany} ({documentType} {referenceNumber})"
            : (!string.IsNullOrWhiteSpace(documentType)
                ? $"Support Inquiry - {cleanCompany} ({documentType})"
                : $"Support Inquiry - {cleanCompany}");

        return $"mailto:{cleanEmail}?subject={Uri.EscapeDataString(subject)}";
    }

    public static string GetTelLink(string? phone)
    {
        if (string.IsNullOrWhiteSpace(phone))
            return string.Empty;

        var cleaned = Regex.Replace(phone.Trim(), @"[^\d+]", "");
        return string.IsNullOrWhiteSpace(cleaned) ? string.Empty : $"tel:{cleaned}";
    }

    public static string BuildHelpAndContactHtml(
        string companyName,
        string supportEmail,
        string? phone = null,
        string? address = null,
        string? documentType = null,
        string? referenceNumber = null)
    {
        var cleanCompany = string.IsNullOrWhiteSpace(companyName) ? "Our Company" : companyName.Trim();
        var cleanEmail = string.IsNullOrWhiteSpace(supportEmail) ? "support@company.com" : supportEmail.Trim();
        var mailtoLink = GetMailtoLink(cleanEmail, cleanCompany, documentType, referenceNumber);
        var telLink = GetTelLink(phone);

        var docLabel = !string.IsNullOrWhiteSpace(documentType)
            ? documentType.ToLowerInvariant()
            : "document";

        var phoneRow = !string.IsNullOrWhiteSpace(phone) && !string.IsNullOrWhiteSpace(telLink)
            ? $@"<div style=""margin-top:6px;"">
                    &#9742; <span style=""color:#475569;font-weight:600;"">Phone / Helpline:</span> 
                    <a href=""{telLink}"" style=""color:#2563eb;text-decoration:none;font-weight:600;"">{phone.Trim()}</a>
                </div>"
            : string.Empty;

        var addressRow = !string.IsNullOrWhiteSpace(address)
            ? $@"<div style=""margin-top:6px;color:#64748b;font-size:12px;line-height:1.4;"">
                    &#127970; <span style=""font-weight:600;"">Address:</span> {address.Trim()}
                </div>"
            : string.Empty;

        return $@"
<!-- Help & Contact Details -->
<div style=""margin-top:28px;padding:16px 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#334155;"">
    <div style=""font-size:13px;font-weight:700;color:#0f172a;margin-bottom:4px;"">
        &#128172; Need Help or Have Questions?
    </div>
    <div style=""font-size:12px;color:#64748b;margin-bottom:10px;line-height:1.5;"">
        Our team is here to assist you with any questions regarding this {docLabel}, billing details, or payment confirmations.
    </div>
    <div style=""font-size:13px;line-height:1.6;"">
        <div>
            &#9993; <span style=""color:#475569;font-weight:600;"">Email Support:</span> 
            <a href=""{mailtoLink}"" style=""color:#2563eb;text-decoration:none;font-weight:600;"">{cleanEmail}</a>
        </div>
        {phoneRow}
        {addressRow}
    </div>
    <div style=""margin-top:12px;font-size:11px;color:#94a3b8;border-top:1px dashed #e2e8f0;padding-top:8px;"">
        Direct communication from <strong>{cleanCompany}</strong>. You can reply directly to this email or reach out to our team above.
    </div>
</div>";
    }

    public static string BuildHelpAndContactPlainText(
        string companyName,
        string supportEmail,
        string? phone = null,
        string? address = null)
    {
        var cleanCompany = string.IsNullOrWhiteSpace(companyName) ? "Our Company" : companyName.Trim();
        var cleanEmail = string.IsNullOrWhiteSpace(supportEmail) ? "support@company.com" : supportEmail.Trim();

        var phoneLine = !string.IsNullOrWhiteSpace(phone) ? $"\nPhone / Helpline: {phone.Trim()}" : string.Empty;
        var addressLine = !string.IsNullOrWhiteSpace(address) ? $"\nAddress: {address.Trim()}" : string.Empty;

        return $@"
--------------------------------------------------
Need Help or Have Questions?
Contact our team directly:
Email: {cleanEmail}{phoneLine}{addressLine}
--------------------------------------------------";
    }

    public static string EnsureHelpAndContactSection(
        string body,
        string companyName,
        string supportEmail,
        string? phone = null,
        string? address = null,
        string? documentType = null,
        string? referenceNumber = null)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return BuildHelpAndContactHtml(companyName, supportEmail, phone, address, documentType, referenceNumber);
        }

        // Avoid duplicate insertion if already present
        if (body.Contains("Need Help or Have Questions", StringComparison.OrdinalIgnoreCase) ||
            body.Contains("Need help or have questions", StringComparison.OrdinalIgnoreCase) ||
            body.Contains("Help & Contact", StringComparison.OrdinalIgnoreCase))
        {
            return body;
        }

        var isHtml = body.Contains("<html", StringComparison.OrdinalIgnoreCase) ||
                     body.Contains("<div", StringComparison.OrdinalIgnoreCase) ||
                     body.Contains("<p", StringComparison.OrdinalIgnoreCase) ||
                     body.Contains("<table", StringComparison.OrdinalIgnoreCase);

        if (!isHtml)
        {
            return body.TrimEnd() + "\n" + BuildHelpAndContactPlainText(companyName, supportEmail, phone, address);
        }

        var helpCardHtml = BuildHelpAndContactHtml(companyName, supportEmail, phone, address, documentType, referenceNumber);

        // If body has </body>, insert before </body>
        if (BodyClosingTagRegex.IsMatch(body))
        {
            return BodyClosingTagRegex.Replace(body, $"{helpCardHtml}\n</body>", 1);
        }

        // If body ends with </div> (standard container layout), insert right before the last closing </div>
        var lastDivIndex = body.LastIndexOf("</div>", StringComparison.OrdinalIgnoreCase);
        if (lastDivIndex >= 0)
        {
            return body.Substring(0, lastDivIndex) + helpCardHtml + "\n" + body.Substring(lastDivIndex);
        }

        return body + "\n" + helpCardHtml;
    }
}
