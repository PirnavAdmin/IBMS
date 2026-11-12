using Billing.Application.Interfaces;
using Billing.Contracts.InvoiceTemplate;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using QRCoder;

namespace Billing.Infrastructure.Services;

/// <summary>
/// High-performance, deterministic C# server-side PDF generation engine using QuestPDF.
/// Implements Standard, Professional, and Compact visual presentations with multi-page pagination,
/// repeating table headers, line-item wrapping, and financial totals precision.
/// </summary>
public class QuestPdfInvoiceEngine : IInvoicePdfEngine
{
    private const string PirnavLogoPath = "/template-assets/pirnav.png";
    private const string PrimaryBrown = "#6B2D0C";
    private const string TanFill = "#F6EBE3";
    private const string LightLine = "#E8C4AE";
    private const string AccentTan = "#D9A57F";
    private const string TextDark = "#333333";
    private const string TextMuted = "#555555";
    private const string PaidGreen = "#2E8B3D";

    static QuestPdfInvoiceEngine()
    {
        // QuestPDF Community License registration
        QuestPDF.Settings.License = LicenseType.Community;
        QuestPDF.Settings.UseSystemFonts = true;
        QuestPDF.Settings.ThrowOnMissingFontFamilies = false;
    }

    public byte[] GenerateInvoicePdf(InvoiceSnapshotDto snapshot, TemplateVersionDto template)
    {
        ArgumentNullException.ThrowIfNull(snapshot);
        ArgumentNullException.ThrowIfNull(template);

        var design = ResolveDesign(template);

        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                if (design == "Corner")
                {
                    ComposeCornerDocument(page, snapshot, template);
                }
                else if (design == "WaveClean")
                {
                    ComposeWaveCleanDocument(page, snapshot, template);
                }
                else
                {
                    ApplyPageSetup(page, template);
                    ComposeHeader(page.Header(), snapshot, template);
                    ComposeContent(page.Content(), snapshot, template);
                    ComposeFooter(page.Footer(), snapshot, template);
                }
            });
        });

        return document.GeneratePdf();
    }

    public byte[] GeneratePreviewPdf(TemplatePreviewRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        var sampleSnapshot = request.CustomSampleData ?? CreateDefaultSampleSnapshot(request);
        var mockTemplate = new TemplateVersionDto
        {
            VersionNumber = 1,
            Branding = request.Branding,
            CompanyDetails = request.CompanyDetails,
            Layout = request.Layout,
            PaymentInstructions = request.PaymentInstructions,
            Terms = request.Terms
        };

        if (string.IsNullOrWhiteSpace(mockTemplate.Layout.TemplateDesign))
        {
            if (request.Name?.Contains("Template 4", StringComparison.OrdinalIgnoreCase) == true) mockTemplate.Layout.TemplateDesign = "Corner";
            else if (request.Name?.Contains("Wave", StringComparison.OrdinalIgnoreCase) == true ||
                     request.Name?.Contains("Custom", StringComparison.OrdinalIgnoreCase) == true) mockTemplate.Layout.TemplateDesign = "WaveClean";
        }

        return GenerateInvoicePdf(sampleSnapshot, mockTemplate);
    }

    private static string ResolveDesign(TemplateVersionDto template)
    {
        var design = template.Layout.TemplateDesign;
        if (string.Equals(design, "Corner", StringComparison.OrdinalIgnoreCase)) return "Corner";
        if (string.Equals(design, "WaveClean", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(design, "Wave", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(design, "CustomUploaded", StringComparison.OrdinalIgnoreCase)) return "WaveClean";

        if (template.VersionDescription?.Contains("Template 4", StringComparison.OrdinalIgnoreCase) == true) return "Corner";
        if (template.VersionDescription?.Contains("Wave", StringComparison.OrdinalIgnoreCase) == true) return "WaveClean";

        return "Standard";
    }

    #region Layout & Page Configuration

    private static void ApplyPageSetup(PageDescriptor page, TemplateVersionDto template)
    {
        page.Size(PageSizes.A4);
        var layout = template.Layout;

        if (layout.UsePirnavSidebarLayout)
        {
            page.MarginTop(0, Unit.Millimetre);
            page.MarginBottom(0, Unit.Millimetre);
            page.MarginLeft(0, Unit.Millimetre);
            page.MarginRight(0, Unit.Millimetre);
            page.PageColor(Colors.White);
            page.DefaultTextStyle(x => x.FontFamily(template.Branding.FontFamily ?? "Segoe UI").FontSize(9.5f).FontColor(Colors.Grey.Darken3));
            return;
        }

        var top = layout.MarginTopMm > 0 ? layout.MarginTopMm : 12;
        var bottom = layout.MarginBottomMm > 0 ? layout.MarginBottomMm : 12;
        var left = layout.MarginLeftMm > 0 ? layout.MarginLeftMm : 14;
        var right = layout.MarginRightMm > 0 ? layout.MarginRightMm : 14;

        page.MarginTop(top, Unit.Millimetre);
        page.MarginBottom(bottom, Unit.Millimetre);
        page.MarginLeft(left, Unit.Millimetre);
        page.MarginRight(right, Unit.Millimetre);
        page.PageColor(Colors.White);

        page.DefaultTextStyle(x => x.FontFamily(template.Branding.FontFamily ?? "Segoe UI").FontSize(9.5f).FontColor(Colors.Grey.Darken3));
    }

    #endregion

    #region Header Composition

    private static void ComposeHeader(IContainer header, InvoiceSnapshotDto snapshot, TemplateVersionDto template)
    {
        if (template.Layout.UsePirnavSidebarLayout) return;
        var primaryColor = template.Layout.UsePirnavStandardLayout ? "#6B2E0C" : template.Branding.PrimaryColor ?? "#0f2942";
        var company = template.CompanyDetails;
        var logoBytes = TryGetLogoBytes(template.Branding.LogoUrl);
        var usePirnavLayout = template.Layout.UsePirnavStandardLayout;

        header.Column(col =>
        {
            // Logo files are stored by the template API as data URIs.  Decode the selected
            // template logo here so preview PDFs and generated invoice PDFs use the same
            // saved branding.
            if (template.Layout.ShowLogo && logoBytes is not null && !usePirnavLayout)
            {
                var logoPosition = (template.Branding.LogoPosition ?? "left").Trim().ToLowerInvariant();
                var logoWidth = Math.Clamp(template.Branding.LogoWidth, 48, 240);
                var logoContainer = logoPosition switch
                {
                    "center" => col.Item().AlignCenter(),
                    "right" => col.Item().AlignRight(),
                    _ => col.Item().AlignLeft()
                };

                logoContainer
                    .Width(logoWidth)
                    .Height(Math.Min(logoWidth * 0.6f, 96))
                    .Image(logoBytes)
                    .FitArea();

                col.Item().PaddingBottom(6);
            }

            col.Item().Row(row =>
            {
                // Left: Company Info & Branding
                row.RelativeItem().Column(c =>
                {
                    var companyName = string.IsNullOrWhiteSpace(company.CompanyName) ? "IBMS Solutions Pvt Ltd" : company.CompanyName;
                    c.Item().Text(companyName).FontSize(usePirnavLayout ? 20 : 16).Bold().FontColor(primaryColor);

                    if (!string.IsNullOrWhiteSpace(company.LegalName) && company.LegalName != companyName)
                    {
                        c.Item().Text(company.LegalName).FontSize(8.5f).FontColor(Colors.Grey.Darken1);
                    }

                    if (!string.IsNullOrWhiteSpace(company.TaxId))
                    {
                        c.Item().Text($"GSTIN / Tax ID: {company.TaxId}").FontSize(8.5f).FontColor(Colors.Grey.Darken2);
                    }

                    var addressLine = $"{company.AddressLine1} {company.AddressLine2}, {company.City} {company.State} {company.PostalCode}".Trim().Trim(',').Trim();
                    if (usePirnavLayout)
                    {
                        addressLine = BreakPirnavAddressBeforeTelangana(addressLine);
                    }
                    if (!string.IsNullOrWhiteSpace(addressLine))
                    {
                        c.Item().Text(addressLine).FontSize(8.5f).FontColor(Colors.Grey.Darken2);
                    }

                    if (!string.IsNullOrWhiteSpace(company.Email) || !string.IsNullOrWhiteSpace(company.Phone))
                    {
                        c.Item().Text($"Email: {company.Email} | Phone: {company.Phone}").FontSize(8f).FontColor(Colors.Grey.Darken1);
                    }

                    if (!string.IsNullOrWhiteSpace(company.Website))
                    {
                        c.Item().Text(company.Website).FontSize(8f).FontColor(Colors.Grey.Darken1);
                    }
                });

                // The Pirnav layout reserves the top-right position for the saved
                // branding logo. Existing layouts keep their invoice title unchanged.
                row.ConstantItem(usePirnavLayout ? 220 : 180).AlignRight().Column(c =>
                {
                    if (usePirnavLayout && template.Layout.ShowLogo && logoBytes is not null)
                    {
                        var pirnavLogoWidth = Math.Clamp(Math.Max(template.Branding.LogoWidth, 180), 120, 210);
                        c.Item().AlignRight().Width(pirnavLogoWidth).Height(88).Image(logoBytes).FitArea();
                    }
                    else if (!usePirnavLayout)
                    {
                        c.Item().Text("TAX INVOICE").FontSize(18).ExtraBold().FontColor(primaryColor);
                        c.Item().Text($"# {snapshot.InvoiceNumber}").FontSize(11).Bold().FontColor(Colors.Grey.Darken3);
                        c.Item().PaddingTop(2).Text($"Status: {snapshot.Status}").FontSize(9).Bold().FontColor(snapshot.Status.Equals("Paid", StringComparison.OrdinalIgnoreCase) ? Colors.Green.Darken2 : Colors.Blue.Darken2);
                    }
                });
            });

            col.Item().PaddingTop(8).PaddingBottom(6).LineHorizontal(1).LineColor(Colors.Grey.Lighten2);
        });
    }

    private static string BreakPirnavAddressBeforeTelangana(string address)
    {
        var telanganaIndex = address.IndexOf("Telangana", StringComparison.OrdinalIgnoreCase);
        if (telanganaIndex <= 0) return address;

        var firstLine = address[..telanganaIndex].TrimEnd().TrimEnd(',');
        return $"{firstLine},{Environment.NewLine}{address[telanganaIndex..].TrimStart()}";
    }

    private static byte[]? TryGetLogoBytes(string? logoUrl)
    {
        if (string.Equals(logoUrl, PirnavLogoPath, StringComparison.OrdinalIgnoreCase))
        {
            using var stream = typeof(QuestPdfInvoiceEngine).Assembly
                .GetManifestResourceStream("Billing.Infrastructure.Assets.pirnav.png");
            if (stream == null) return null;

            using var buffer = new MemoryStream();
            stream.CopyTo(buffer);
            return buffer.ToArray();
        }

        if (string.IsNullOrWhiteSpace(logoUrl) ||
            !logoUrl.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        const string base64Marker = ";base64,";
        var markerIndex = logoUrl.IndexOf(base64Marker, StringComparison.OrdinalIgnoreCase);
        if (markerIndex < 0)
        {
            return null;
        }

        try
        {
            return Convert.FromBase64String(logoUrl[(markerIndex + base64Marker.Length)..]);
        }
        catch (FormatException)
        {
            return null;
        }
    }

    #endregion

    #region Content & Items Composition

    private static void ComposeContent(IContainer content, InvoiceSnapshotDto snapshot, TemplateVersionDto template)
    {
        if (template.Layout.UsePirnavSidebarLayout)
        {
            ComposePirnavSidebarContent(content, snapshot, template);
            return;
        }
        if (template.Layout.UsePirnavStandardLayout)
        {
            ComposePirnavContent(content, snapshot, template);
            return;
        }

        var primaryColor = template.Branding.PrimaryColor ?? "#0f2942";
        var secondaryColor = template.Branding.SecondaryColor ?? "#0284c7";
        var usePirnavLayout = template.Layout.UsePirnavStandardLayout;

        content.Column(col =>
        {
            // 1. Invoice Meta & Customer Details Row
            col.Item().PaddingBottom(10).Row(row =>
            {
                // Customer Bill To
                row.RelativeItem().Column(c =>
                {
                    c.Item().Text("BILLED TO:").FontSize(8.5f).Bold().FontColor(secondaryColor);
                    c.Item().Text(snapshot.Customer.CustomerName).FontSize(11).Bold().FontColor(Colors.Grey.Darken4);
                    if (!string.IsNullOrWhiteSpace(snapshot.Customer.CustomerCode))
                    {
                        c.Item().Text($"Customer Code: {snapshot.Customer.CustomerCode}").FontSize(8.5f);
                    }
                    if (!string.IsNullOrWhiteSpace(snapshot.Customer.TaxId))
                    {
                        c.Item().Text($"Tax / GSTIN: {snapshot.Customer.TaxId}").FontSize(8.5f);
                    }
                    if (!string.IsNullOrWhiteSpace(snapshot.Customer.BillingAddress))
                    {
                        c.Item().Text(snapshot.Customer.BillingAddress).FontSize(8.5f);
                    }
                    if (!string.IsNullOrWhiteSpace(snapshot.Customer.Email))
                    {
                        c.Item().Text($"Email: {snapshot.Customer.Email}").FontSize(8.5f);
                    }
                });

                // Invoice Meta (Dates & Terms)
                row.ConstantItem(180).AlignRight().Column(c =>
                {
                    if (usePirnavLayout)
                    {
                        MetaRow(c, "Invoice #:", snapshot.InvoiceNumber);
                        MetaRow(c, "Customer Code:", snapshot.Customer.CustomerCode ?? "-");
                        MetaRow(c, "Status:", snapshot.Status);
                    }
                    c.Item().Row(r =>
                    {
                        r.RelativeItem().Text("Invoice Date:").FontSize(8.5f).Bold();
                        r.ConstantItem(85).AlignRight().Text(snapshot.IssueDate.ToString("dd MMM yyyy")).FontSize(8.5f);
                    });
                    c.Item().Row(r =>
                    {
                        r.RelativeItem().Text("Due Date:").FontSize(8.5f).Bold();
                        r.ConstantItem(85).AlignRight().Text(snapshot.DueDate.ToString("dd MMM yyyy")).FontSize(8.5f);
                    });
                    c.Item().Row(r =>
                    {
                        r.RelativeItem().Text("Currency:").FontSize(8.5f).Bold();
                        r.ConstantItem(85).AlignRight().Text(snapshot.Currency).FontSize(8.5f);
                    });
                });
            });

            // 2. Line Items Table (with Repeating Header for Multi-Page support)
            col.Item().PaddingBottom(10).Table(table =>
            {
                if (usePirnavLayout)
                {
                    ComposePirnavItemsTable(table, snapshot, primaryColor);
                    return;
                }
                table.ColumnsDefinition(columns =>
                {
                    columns.ConstantColumn(24);  // #
                    columns.RelativeColumn(3);   // Description
                    columns.ConstantColumn(55);  // HSN/SAC
                    columns.ConstantColumn(45);  // Qty
                    columns.ConstantColumn(65);  // Unit Price
                    columns.ConstantColumn(50);  // Disc
                    columns.ConstantColumn(45);  // Tax %
                    columns.ConstantColumn(70);  // Total
                });

                // Repeating Table Header
                table.Header(header =>
                {
                    header.Cell().Element(CellStyleHeader).Text("#");
                    header.Cell().Element(CellStyleHeader).Text("Item & Description");
                    header.Cell().Element(CellStyleHeader).Text("HSN/SAC");
                    header.Cell().Element(CellStyleHeader).AlignRight().Text("Qty");
                    header.Cell().Element(CellStyleHeader).AlignRight().Text("Rate");
                    header.Cell().Element(CellStyleHeader).AlignRight().Text("Disc");
                    header.Cell().Element(CellStyleHeader).AlignRight().Text("Tax%");
                    header.Cell().Element(CellStyleHeader).AlignRight().Text("Amount");

                    static IContainer CellStyleHeader(IContainer c) =>
                        c.Background(Colors.Grey.Lighten3).BorderBottom(1).BorderColor(Colors.Grey.Darken1).PaddingVertical(4).PaddingHorizontal(3);
                });

                // Line Items Rows
                var index = 1;
                foreach (var item in snapshot.Items)
                {
                    var isEven = index % 2 == 0;
                    var bg = isEven ? Colors.Grey.Lighten5 : Colors.White;

                    table.Cell().Element(c => CellStyleRow(c, bg)).Text(index.ToString());
                    table.Cell().Element(c => CellStyleRow(c, bg)).Column(colItem =>
                    {
                        colItem.Item().Text(item.ItemName).Bold().FontColor(Colors.Grey.Darken4);
                        if (!string.IsNullOrWhiteSpace(item.Description))
                        {
                            colItem.Item().Text(item.Description).FontSize(8f).FontColor(Colors.Grey.Darken1);
                        }
                    });
                    table.Cell().Element(c => CellStyleRow(c, bg)).Text(item.HsnSacCode ?? "-");
                    table.Cell().Element(c => CellStyleRow(c, bg)).AlignRight().Text($"{item.Quantity:0.##} {item.Unit}");
                    table.Cell().Element(c => CellStyleRow(c, bg)).AlignRight().Text(FormatMoney(item.UnitPrice, snapshot.CurrencySymbol));
                    table.Cell().Element(c => CellStyleRow(c, bg)).AlignRight().Text(item.DiscountAmount > 0 ? FormatMoney(item.DiscountAmount, snapshot.CurrencySymbol) : "-");
                    table.Cell().Element(c => CellStyleRow(c, bg)).AlignRight().Text($"{item.TaxRatePercent:0.##}%");
                    table.Cell().Element(c => CellStyleRow(c, bg)).AlignRight().Text(FormatMoney(item.LineTotal, snapshot.CurrencySymbol)).Bold();

                    index++;
                }

                static IContainer CellStyleRow(IContainer c, string bg) =>
                    c.Background(bg).BorderBottom(0.5f).BorderColor(Colors.Grey.Lighten2).PaddingVertical(4).PaddingHorizontal(3);
            });

            // 3. Totals Breakdown & Payment Instructions Section
            col.Item().Row(row =>
            {
                // Left: Bank & Payment Instructions
                row.RelativeItem(3).Column(c =>
                {
                    var pay = template.PaymentInstructions;
                    if (template.Layout.ShowPaymentInstructions && (!string.IsNullOrWhiteSpace(pay.BankName) || !string.IsNullOrWhiteSpace(pay.AccountNumber) || !string.IsNullOrWhiteSpace(pay.UpiId) || !string.IsNullOrWhiteSpace(pay.BankDetails) || !string.IsNullOrWhiteSpace(pay.PaymentNotes) || !string.IsNullOrWhiteSpace(pay.NetBankingProvider) || !string.IsNullOrWhiteSpace(pay.NetBankingBanks) || !string.IsNullOrWhiteSpace(pay.NetBankingInstructions)))
                    {
                        c.Item().PaddingBottom(4).Text("PAYMENT INSTRUCTIONS").FontSize(8.5f).Bold().FontColor(secondaryColor);
                        c.Item().Border(0.5f).BorderColor(Colors.Grey.Lighten2).Background(Colors.Grey.Lighten5).Padding(6).Row(payRow =>
                        {
                            payRow.RelativeItem().Column(b =>
                            {
                                if (!string.IsNullOrWhiteSpace(pay.BankName)) b.Item().Text($"Bank: {pay.BankName}").FontSize(8f);
                                if (!string.IsNullOrWhiteSpace(pay.AccountHolderName)) b.Item().Text($"Account Name: {pay.AccountHolderName}").FontSize(8f);
                                if (!string.IsNullOrWhiteSpace(pay.AccountNumber)) b.Item().Text($"Account #: {pay.AccountNumber}").FontSize(8f).Bold();
                                if (!string.IsNullOrWhiteSpace(pay.IfscCode)) b.Item().Text($"IFSC Code: {pay.IfscCode}").FontSize(8f);
                                if (!string.IsNullOrWhiteSpace(pay.UpiId)) b.Item().Text($"UPI ID: {pay.UpiId}").FontSize(8f);
                                if (pay.NetBankingEnabled && (!string.IsNullOrWhiteSpace(pay.NetBankingProvider) || !string.IsNullOrWhiteSpace(pay.NetBankingBanks))) b.Item().Text($"Internet Banking: {pay.NetBankingProvider ?? "NetBanking"}{(!string.IsNullOrWhiteSpace(pay.NetBankingBanks) ? $" ({pay.NetBankingBanks})" : "")}").FontSize(7.5f);
                                if (pay.NetBankingEnabled && !string.IsNullOrWhiteSpace(pay.NetBankingInstructions)) b.Item().PaddingTop(1).Text(pay.NetBankingInstructions).FontSize(7.5f).Italic();
                                if (!string.IsNullOrWhiteSpace(pay.BankDetails)) b.Item().PaddingTop(2).Text(pay.BankDetails).FontSize(7.5f);
                                if (!string.IsNullOrWhiteSpace(pay.PaymentNotes)) b.Item().PaddingTop(2).Text(pay.PaymentNotes).FontSize(7.5f).Italic();
                                if (snapshot.IncludePayOnlineLink)
                                {
                                    var baseUrl = Billing.Application.Common.AppUrlResolver.GetFrontendBaseUrl();
                                    var payOnlineUrl = snapshot.TenantId.HasValue
                                        ? $"{baseUrl}/pay/{snapshot.InvoiceId}?tenantId={snapshot.TenantId.Value}"
                                        : $"{baseUrl}/pay/{snapshot.InvoiceId}";
                                    b.Item().PaddingTop(3).Hyperlink(payOnlineUrl).Text("💳 Click Here to Pay Online").FontSize(7.5f).Bold().FontColor(Colors.Blue.Darken2).Underline();
                                }
                            });

                            try
                            {
                                var upiId = !string.IsNullOrWhiteSpace(pay.UpiId) ? pay.UpiId : "ibms-billing@upi";
                                var amount = snapshot.BalanceDue > 0 ? snapshot.BalanceDue : snapshot.GrandTotal;
                                var upiPayload = $"upi://pay?pa={upiId}&pn=IBMS&am={amount:F2}&cu=INR&tn=Invoice_{snapshot.InvoiceNumber}";
                                using var qrGenerator = new QRCodeGenerator();
                                using var qrCodeData = qrGenerator.CreateQrCode(upiPayload, QRCodeGenerator.ECCLevel.Q);
                                using var qrCode = new PngByteQRCode(qrCodeData);
                                byte[] qrBytes = qrCode.GetGraphic(2);

                                payRow.ConstantItem(60).AlignRight().Column(q =>
                                {
                                    q.Item().Width(55).Height(55).Image(qrBytes);
                                    q.Item().PaddingTop(1).AlignCenter().Text("Scan to Pay").FontSize(6.5f).FontColor(Colors.Grey.Darken2);
                                });
                            }
                            catch
                            {
                                // Fail-safe fallback if QR rendering fails
                            }
                        });
                    }

                    if (template.Layout.ShowTermsAndConditions && !string.IsNullOrWhiteSpace(template.Terms.TermsAndConditions))
                    {
                        c.Item().PaddingTop(6).Text("TERMS & CONDITIONS").FontSize(8f).Bold().FontColor(Colors.Grey.Darken2);
                        c.Item().Text(template.Terms.TermsAndConditions).FontSize(7.5f).FontColor(Colors.Grey.Darken1);
                    }
                });

                // Right: Financial Totals Summary
                row.RelativeItem(2).PaddingLeft(15).Column(c =>
                {
                    SummaryRow(c, "Subtotal", FormatMoney(snapshot.Subtotal, snapshot.CurrencySymbol));

                    if (snapshot.TotalDiscount > 0)
                    {
                        SummaryRow(c, "Discount", $"-{FormatMoney(snapshot.TotalDiscount, snapshot.CurrencySymbol)}", Colors.Red.Darken1);
                    }

                    // Taxes
                    foreach (var tax in snapshot.TaxBreakdowns)
                    {
                        SummaryRow(c, $"{tax.TaxName} ({tax.RatePercent:0.##}%)", FormatMoney(tax.TaxAmount, snapshot.CurrencySymbol));
                    }

                    // Additional Charges
                    foreach (var charge in snapshot.AdditionalCharges)
                    {
                        SummaryRow(c, charge.ChargeName, FormatMoney(charge.Amount, snapshot.CurrencySymbol));
                    }

                    c.Item().PaddingVertical(2).LineHorizontal(1).LineColor(Colors.Grey.Lighten1);

                    // Grand Total
                    c.Item().Row(r =>
                    {
                        r.RelativeItem().Text("Total Amount:").FontSize(11).Bold().FontColor(primaryColor);
                        r.ConstantItem(85).AlignRight().Text(FormatMoney(snapshot.GrandTotal, snapshot.CurrencySymbol)).FontSize(12).ExtraBold().FontColor(primaryColor);
                    });

                    if (snapshot.AmountPaid > 0 || usePirnavLayout)
                    {
                        SummaryRow(c, "Amount Paid", FormatMoney(snapshot.AmountPaid, snapshot.CurrencySymbol), Colors.Green.Darken2);
                        c.Item().Row(r =>
                        {
                            r.RelativeItem().Text("Balance Due:").FontSize(9.5f).Bold().FontColor(Colors.Red.Darken2);
                            r.ConstantItem(85).AlignRight().Text(FormatMoney(snapshot.BalanceDue, snapshot.CurrencySymbol)).FontSize(9.5f).Bold().FontColor(Colors.Red.Darken2);
                        });
                    }
                });
            });
        });
    }

    private static void ComposePirnavContent(IContainer content, InvoiceSnapshotDto snapshot, TemplateVersionDto template)
    {
        const string primary = "#6B2E0C";
        const string softBackground = "#F7EDE5";
        var footerNote = string.IsNullOrWhiteSpace(template.Terms.FooterNote)
            ? "Thank you for choosing us! This is a system-generated invoice and does not require a physical signature."
            : template.Terms.FooterNote;
        var footerSeparator = footerNote.IndexOf(" This is", StringComparison.OrdinalIgnoreCase);
        var thankYou = footerSeparator > 0 ? footerNote[..footerSeparator].Trim() : footerNote;
        var systemNote = footerSeparator > 0 ? footerNote[footerSeparator..].Trim() : "This is a system-generated invoice and does not require a physical signature.";

        content.Column(column =>
        {
            column.Item().PaddingBottom(16).Row(row =>
            {
                row.RelativeItem(3).Column(customer =>
                {
                    customer.Item().Background(primary).PaddingVertical(3).PaddingHorizontal(6).Text("Bill To:").FontSize(9).Bold().FontColor(Colors.White);
                    customer.Item().PaddingTop(5).Text(snapshot.Customer.CustomerName).FontSize(11).Bold();
                    if (!string.IsNullOrWhiteSpace(snapshot.Customer.CustomerCode)) customer.Item().Text($"Customer Code: {snapshot.Customer.CustomerCode}").FontSize(8.5f);
                    if (!string.IsNullOrWhiteSpace(snapshot.Customer.BillingAddress)) customer.Item().Text(snapshot.Customer.BillingAddress).FontSize(8.5f);
                    if (!string.IsNullOrWhiteSpace(snapshot.Customer.TaxId)) customer.Item().Text($"GSTIN / Tax ID: {snapshot.Customer.TaxId}").FontSize(8.5f);
                    if (!string.IsNullOrWhiteSpace(snapshot.Customer.Phone)) customer.Item().Text($"Phone: {snapshot.Customer.Phone}").FontSize(8.5f);
                    if (!string.IsNullOrWhiteSpace(snapshot.Customer.Email)) customer.Item().Text($"Email: {snapshot.Customer.Email}").FontSize(8.5f);
                });

                row.ConstantItem(250).PaddingLeft(18).Column(meta =>
                {
                    PirnavMetaRow(meta, "Invoice #:", snapshot.InvoiceNumber);
                    PirnavMetaRow(meta, "Invoice Date:", snapshot.IssueDate.ToString("dd MMM yyyy"));
                    PirnavMetaRow(meta, "Customer Code:", snapshot.Customer.CustomerCode ?? "-");
                    PirnavMetaRow(meta, "Currency:", snapshot.Currency);
                    Color? statusColor = snapshot.Status.Equals("Pending", StringComparison.OrdinalIgnoreCase)
                        ? Colors.Red.Darken2
                        : snapshot.Status.Equals("Paid", StringComparison.OrdinalIgnoreCase)
                            ? Colors.Green.Darken2
                            : (Color?)null;
                    PirnavMetaRow(meta, "Status:", snapshot.Status, statusColor);
                });
            });

            column.Item().Table(table => ComposePirnavReferenceItemsTable(table, snapshot, primary, softBackground));
            column.Item().PaddingTop(16).AlignRight().Width(260).Column(totals =>
            {
                ComposePirnavTotalsBlock(totals, snapshot, primary);
            });

            column.Item().PaddingTop(17).Text("Amount in Words").FontSize(9).Bold();
            column.Item().Text(FormatAmountInWords(snapshot.GrandTotal, snapshot.Currency)).FontSize(8.5f);

            if (!string.IsNullOrWhiteSpace(snapshot.Notes))
            {
                column.Item().PaddingTop(12).Background(primary).PaddingVertical(4).PaddingHorizontal(6).Text("Notes").FontSize(9).Bold().FontColor(Colors.White);
                column.Item().Border(0.5f).BorderColor("#D8B9A8").Padding(6).Text(snapshot.Notes).FontSize(8.3f);
            }

            var termsText = !string.IsNullOrWhiteSpace(snapshot.TermsAndConditions)
                ? snapshot.TermsAndConditions
                : template.Terms.TermsAndConditions;
            if (template.Layout.ShowTermsAndConditions && !string.IsNullOrWhiteSpace(termsText))
            {
                column.Item().PaddingTop(12).Background(primary).PaddingVertical(4).PaddingHorizontal(6).Text("Terms & Conditions").FontSize(9).Bold().FontColor(Colors.White);
                column.Item().Border(0.5f).BorderColor("#D8B9A8").Padding(6).Text(termsText).FontSize(8.3f);
            }

            column.Item().PaddingTop(17).AlignCenter().Text(thankYou).FontSize(10).Bold().FontColor(primary);
            column.Item().PaddingTop(3).AlignCenter().Text(systemNote).FontSize(8).Italic().FontColor(Colors.Grey.Darken1);
        });
    }

    private static void ComposePirnavTotalsBlock(ColumnDescriptor totals, InvoiceSnapshotDto snapshot, string primary)
    {
        PirnavTotalRow(totals, "Sub Total", FormatMoney(snapshot.Subtotal, snapshot.CurrencySymbol));
        PirnavTotalRow(totals, "Total Discount", FormatMoney(snapshot.TotalDiscount, snapshot.CurrencySymbol));

        var taxableAmount = Math.Max(0m, snapshot.Subtotal - snapshot.TotalDiscount);
        PirnavTotalRow(totals, "Taxable Amount", FormatMoney(taxableAmount, snapshot.CurrencySymbol));

        if (snapshot.TaxBreakdowns.Count > 0)
        {
            foreach (var tax in snapshot.TaxBreakdowns)
            {
                var rateLabel = tax.RatePercent > 0 ? $" ({tax.RatePercent:0.##}%)" : string.Empty;
                PirnavTotalRow(totals, $"{tax.TaxName}{rateLabel}", FormatMoney(tax.TaxAmount, snapshot.CurrencySymbol));
            }
        }
        else if (snapshot.TotalTax > 0)
        {
            PirnavTotalRow(totals, "Tax", FormatMoney(snapshot.TotalTax, snapshot.CurrencySymbol));
        }

        if (snapshot.AdditionalCharges.Count > 0)
        {
            foreach (var charge in snapshot.AdditionalCharges)
            {
                PirnavTotalRow(totals, charge.ChargeName, FormatMoney(charge.Amount, snapshot.CurrencySymbol));
            }
        }
        else if (snapshot.TotalAdditionalCharges > 0)
        {
            PirnavTotalRow(totals, "Other Charges", FormatMoney(snapshot.TotalAdditionalCharges, snapshot.CurrencySymbol));
        }

        if (snapshot.RoundingAmount != 0m)
        {
            PirnavTotalRow(totals, "Round Off", FormatMoney(snapshot.RoundingAmount, snapshot.CurrencySymbol));
        }

        PirnavTotalRow(totals, "Total Amount", FormatMoney(snapshot.GrandTotal, snapshot.CurrencySymbol), true, Color.FromHex(primary));
        PirnavTotalRow(totals, "Amount Paid", FormatMoney(snapshot.AmountPaid, snapshot.CurrencySymbol), false, Colors.Green.Darken2);
        totals.Item().Background(primary).PaddingVertical(3).PaddingHorizontal(7).Row(row =>
        {
            row.RelativeItem().Text("Balance Due").FontSize(10).Bold().FontColor(Colors.White);
            row.ConstantItem(100).AlignRight().Text(FormatMoney(snapshot.BalanceDue, snapshot.CurrencySymbol)).FontSize(10).Bold().FontColor(Colors.White);
        });
    }

    private static void PirnavMetaRow(ColumnDescriptor column, string label, string value, Color? valueColor = null)
    {
        column.Item().PaddingBottom(1).Row(row =>
        {
            row.ConstantItem(96).Text(label).FontSize(8.5f);
            row.RelativeItem().Border(0.5f).BorderColor("#D8B9A8").PaddingVertical(3).PaddingHorizontal(5).Text(value).FontSize(8.5f).FontColor(valueColor ?? Colors.Grey.Darken4);
        });
    }

    private static void PirnavTotalRow(ColumnDescriptor column, string label, string value, bool bold = false, Color? color = null)
    {
        column.Item().PaddingVertical(3).PaddingHorizontal(7).BorderBottom(0.5f).BorderColor("#D8B9A8").Row(row =>
        {
            var left = row.RelativeItem().Text(label).FontSize(bold ? 10 : 9);
            var right = row.ConstantItem(100).AlignRight().Text(value).FontSize(bold ? 10 : 9);
            if (bold) { left.Bold(); right.Bold(); }
            if (color.HasValue) { left.FontColor(color.Value); right.FontColor(color.Value); }
        });
    }

    private static void ComposePirnavReferenceItemsTable(TableDescriptor table, InvoiceSnapshotDto snapshot, string primaryColor, string softBackground)
    {
        table.ColumnsDefinition(columns =>
        {
            columns.ConstantColumn(38);
            columns.RelativeColumn();
            columns.ConstantColumn(38);
            columns.ConstantColumn(76);
            columns.ConstantColumn(70);
            columns.ConstantColumn(44);
            columns.ConstantColumn(80);
        });
        table.Header(header =>
        {
            header.Cell().Element(HeaderCell).Text("Item #");
            header.Cell().Element(HeaderCell).Text("Description");
            header.Cell().Element(HeaderCell).AlignCenter().Text("Qty");
            header.Cell().Element(HeaderCell).AlignRight().Text($"Unit Price ({snapshot.CurrencySymbol})");
            header.Cell().Element(HeaderCell).AlignRight().Text($"Discount ({snapshot.CurrencySymbol})");
            header.Cell().Element(HeaderCell).AlignCenter().Text("Tax (%)");
            header.Cell().Element(HeaderCell).AlignRight().Text($"Amount ({snapshot.CurrencySymbol})");
        });
        var number = 1;
        foreach (var item in snapshot.Items)
        {
            table.Cell().Element(RowCell).Text(number.ToString());
            table.Cell().Element(RowCell).Column(description =>
            {
                description.Item().Text(item.ItemName).FontSize(8.5f).Bold();
                if (!string.IsNullOrWhiteSpace(item.Description) && !string.Equals(item.ItemName, item.Description, StringComparison.Ordinal))
                    description.Item().Text(item.Description).FontSize(7.5f).FontColor(Colors.Grey.Darken1);
                if (!string.IsNullOrWhiteSpace(item.HsnSacCode))
                    description.Item().Text($"HSN/SAC: {item.HsnSacCode}").FontSize(7f).FontColor(Colors.Grey.Darken1);
            });
            table.Cell().Element(RowCell).AlignCenter().Text(item.Quantity.ToString("0.##")).FontSize(8.5f);
            table.Cell().Element(RowCell).AlignRight().Text(item.UnitPrice.ToString("N2")).FontSize(8.5f);
            table.Cell().Element(RowCell).AlignRight().Text(item.DiscountAmount.ToString("N2")).FontSize(8.5f);
            table.Cell().Element(RowCell).AlignCenter().Text($"{item.TaxRatePercent:0.##}%").FontSize(8.5f);
            table.Cell().Element(RowCell).AlignRight().Text(FormatMoney(item.LineTotal, snapshot.CurrencySymbol)).FontSize(8.5f).Bold();
            number++;
        }
        IContainer HeaderCell(IContainer container) => container.Background(primaryColor).PaddingVertical(5).PaddingHorizontal(5).DefaultTextStyle(style => style.FontSize(8.5f).Bold().FontColor(Colors.White));
        IContainer RowCell(IContainer container) => container.Background(softBackground).PaddingVertical(5).PaddingHorizontal(5);
    }

    private static void ComposePirnavSidebarContent(IContainer content, InvoiceSnapshotDto snapshot, TemplateVersionDto template)
    {
        const string primary = "#5A2D16";
        const string accent = "#C98A5E";
        const string rowBackground = "#F7EDE5";

        content.Row(row =>
        {
            // Left sidebar: Colored container with company, recipient, and invoice details
            row.ConstantItem(185).Background(primary).PaddingTop(22).PaddingHorizontal(14).PaddingBottom(20).Column(sidebar =>
            {
                // 1. Logo Card
                sidebar.Item().Background(Colors.White).CornerRadius(8).PaddingVertical(6).PaddingHorizontal(10).AlignCenter().Width(128).Height(38).Element(imgContainer =>
                {
                    var logoBytes = TryGetLogoBytes(template.Branding.LogoUrl);
                    if (logoBytes != null)
                    {
                        imgContainer.Image(logoBytes).FitArea();
                    }
                });

                // 2. FROM Section
                sidebar.Item().PaddingTop(24).Text("FROM").FontSize(8f).Bold().FontColor("#D5C0B0");
                sidebar.Item().PaddingTop(4).Text(string.IsNullOrWhiteSpace(template.CompanyDetails.CompanyName) ? "Pirnav Software Solutions Pvt. Ltd." : template.CompanyDetails.CompanyName)
                    .FontSize(9.5f).Bold().FontColor(Colors.White);

                var address = template.CompanyDetails.AddressLine1 ?? "Capital Park Road, Cyber Hills Colony,\nVIP Hills,";
                sidebar.Item().PaddingTop(2).Text(address).FontSize(7.5f).FontColor("#F4ECE6");

                var location = !string.IsNullOrWhiteSpace(template.CompanyDetails.City)
                    ? $"{template.CompanyDetails.City},\n{template.CompanyDetails.State}, {template.CompanyDetails.PostalCode}"
                    : "Madhapur, Hitech City, Hyderabad,\nTelangana, 500081";
                sidebar.Item().Text(location).FontSize(7.5f).FontColor("#F4ECE6");

                var email = template.CompanyDetails.Email ?? "pradeep@pirnav.com";
                var phone = template.CompanyDetails.Phone ?? "+91 8121076485";
                sidebar.Item().PaddingTop(3).Text($"Email: {email} | Phone:\n{phone}").FontSize(7.5f).FontColor("#F4ECE6");

                var website = template.CompanyDetails.Website ?? "https://www.pirnav.com/";
                sidebar.Item().PaddingTop(2).Text(website).FontSize(7.5f).FontColor("#F4ECE6");

                // 3. BILL TO Section
                sidebar.Item().PaddingTop(24).Text("BILL TO").FontSize(8f).Bold().FontColor("#D5C0B0");
                sidebar.Item().PaddingTop(4).Text(snapshot.Customer.CustomerName).FontSize(9.5f).Bold().FontColor(Colors.White);
                if (!string.IsNullOrWhiteSpace(snapshot.Customer.CustomerCode))
                {
                    sidebar.Item().Text($"Customer Code: {snapshot.Customer.CustomerCode}").FontSize(7.5f).FontColor("#F4ECE6");
                }
                if (!string.IsNullOrWhiteSpace(snapshot.Customer.BillingAddress))
                {
                    sidebar.Item().Text(snapshot.Customer.BillingAddress).FontSize(7.5f).FontColor("#F4ECE6");
                }
                if (!string.IsNullOrWhiteSpace(snapshot.Customer.Email))
                {
                    sidebar.Item().Text($"Email: {snapshot.Customer.Email}").FontSize(7.5f).FontColor("#F4ECE6");
                }

                // 4. INVOICE DETAILS Section
                sidebar.Item().PaddingTop(24).Text("INVOICE DETAILS").FontSize(8f).Bold().FontColor("#D5C0B0");

                sidebar.Item().PaddingTop(6).Text("Invoice Date").FontSize(7.5f).FontColor("#C5B0A0");
                sidebar.Item().Text(snapshot.IssueDate.ToString("dd MMM yyyy")).FontSize(8.5f).Bold().FontColor(Colors.White);

                sidebar.Item().PaddingTop(6).Text("Customer Code").FontSize(7.5f).FontColor("#C5B0A0");
                sidebar.Item().Text(snapshot.Customer.CustomerCode ?? "-").FontSize(8.5f).Bold().FontColor(Colors.White);

                sidebar.Item().PaddingTop(6).Text("Currency").FontSize(7.5f).FontColor("#C5B0A0");
                sidebar.Item().Text(snapshot.Currency).FontSize(8.5f).Bold().FontColor(Colors.White);

                sidebar.Item().PaddingTop(6).Text("Status").FontSize(7.5f).FontColor("#C5B0A0");
                sidebar.Item().Text(snapshot.Status).FontSize(8.5f).Bold().FontColor(Colors.White);
            });

            // Right column: Main content
            row.RelativeItem().PaddingTop(22).PaddingLeft(20).PaddingRight(20).Column(main =>
            {
                // Top Header Row
                main.Item().Row(headerRow =>
                {
                    headerRow.RelativeItem().Column(titleCol =>
                    {
                        titleCol.Item().Text("INVOICE").FontSize(24).Bold().FontColor("#4A200E");
                        titleCol.Item().PaddingTop(2).Text(snapshot.InvoiceNumber).FontSize(10.5f).FontColor("#70472F");
                        titleCol.Item().PaddingTop(5).Width(65).Height(3).Background(accent).CornerRadius(1.5f);
                    });

                    headerRow.ConstantItem(90).AlignRight().AlignTop().Element(badgeContainer =>
                    {
                        badgeContainer.Border(1).BorderColor("#70472F").CornerRadius(12).PaddingVertical(3).PaddingHorizontal(14)
                            .Text(snapshot.Status.ToUpperInvariant()).FontSize(8.5f).Bold().FontColor("#70472F");
                    });
                });

                // Items Table
                main.Item().PaddingTop(24).Table(table =>
                {
                    table.ColumnsDefinition(cols =>
                    {
                        cols.ConstantColumn(38);
                        cols.RelativeColumn(3);
                        cols.ConstantColumn(65);
                        cols.ConstantColumn(75);
                        cols.ConstantColumn(80);
                    });

                    table.Header(header =>
                    {
                        header.Cell().Element(HeaderStyle).Text("ITEM #");
                        header.Cell().Element(HeaderStyle).Text("DESCRIPTION");
                        header.Cell().Element(HeaderStyle).AlignCenter().Text("MONTHS");
                        header.Cell().Element(HeaderStyle).AlignRight().Text("RATE");
                        header.Cell().Element(HeaderStyle).AlignRight().Text("AMOUNT");
                    });

                    var idx = 1;
                    foreach (var item in snapshot.Items)
                    {
                        table.Cell().Element(RowStyle).Text(idx.ToString()).FontSize(8.5f);
                        table.Cell().Element(RowStyle).Column(dc =>
                        {
                            dc.Item().Text(item.ItemName).FontSize(8.5f).Bold().FontColor("#2F2523");
                            if (!string.IsNullOrWhiteSpace(item.Description) && item.Description != item.ItemName)
                            {
                                dc.Item().Text(item.Description).FontSize(7.5f).FontColor(Colors.Grey.Darken1);
                            }
                        });
                        table.Cell().Element(RowStyle).AlignCenter().Text(item.Quantity.ToString("0.##")).FontSize(8.5f);
                        table.Cell().Element(RowStyle).AlignRight().Text(FormatMoney(item.UnitPrice, snapshot.CurrencySymbol)).FontSize(8.5f);
                        table.Cell().Element(RowStyle).AlignRight().Text(FormatMoney(item.LineTotal, snapshot.CurrencySymbol)).FontSize(8.5f).Bold().FontColor("#2F2523");
                        idx++;
                    }

                    static IContainer HeaderStyle(IContainer container) =>
                        container.PaddingBottom(6).DefaultTextStyle(s => s.FontSize(8).Bold().FontColor("#5A2D16"));

                    static IContainer RowStyle(IContainer container) =>
                        container.Background(rowBackground).PaddingVertical(6).PaddingHorizontal(5);
                });

                // Financial Totals
                main.Item().PaddingTop(16).AlignRight().Width(235).Column(totals =>
                {
                    totals.Item().BorderBottom(0.5f).BorderColor("#E0D2C7").PaddingVertical(3).Row(r =>
                    {
                        r.RelativeItem().Text("Subtotal").FontSize(9).FontColor("#555");
                        r.ConstantItem(90).AlignRight().Text(FormatMoney(snapshot.Subtotal, snapshot.CurrencySymbol)).FontSize(9).FontColor("#333");
                    });

                    totals.Item().BorderBottom(0.5f).BorderColor("#E0D2C7").PaddingVertical(3).Row(r =>
                    {
                        r.RelativeItem().Text("Total Amount").FontSize(9.5f).Bold().FontColor("#333");
                        r.ConstantItem(90).AlignRight().Text(FormatMoney(snapshot.GrandTotal, snapshot.CurrencySymbol)).FontSize(9.5f).Bold().FontColor("#333");
                    });

                    totals.Item().BorderBottom(0.5f).BorderColor("#E0D2C7").PaddingVertical(3).Row(r =>
                    {
                        r.RelativeItem().Text("Amount Paid").FontSize(9).FontColor("#166534");
                        r.ConstantItem(90).AlignRight().Text(FormatMoney(snapshot.AmountPaid, snapshot.CurrencySymbol)).FontSize(9).FontColor("#166534");
                    });

                    totals.Item().PaddingTop(4).Background(primary).PaddingVertical(4).PaddingHorizontal(8).Row(r =>
                    {
                        r.RelativeItem().Text("Balance Due").FontSize(9.5f).Bold().FontColor(Colors.White);
                        r.ConstantItem(95).AlignRight().Text(FormatMoney(snapshot.BalanceDue, snapshot.CurrencySymbol)).FontSize(9.5f).Bold().FontColor(Colors.White);
                    });
                });

                // AMOUNT IN WORDS
                main.Item().PaddingTop(18).Text("AMOUNT IN WORDS").FontSize(8.5f).Bold().FontColor("#4A200E");
                main.Item().PaddingTop(2).Text(FormatAmountInWords(snapshot.GrandTotal, snapshot.Currency)).FontSize(8.5f).FontColor("#333");

                // TERMS & CONDITIONS
                if (template.Layout.ShowTermsAndConditions && !string.IsNullOrWhiteSpace(template.Terms.TermsAndConditions))
                {
                    main.Item().PaddingTop(16).Text("TERMS & CONDITIONS").FontSize(8.5f).Bold().FontColor("#4A200E");
                    main.Item().PaddingTop(4).Text(template.Terms.TermsAndConditions).FontSize(8).FontColor(Colors.Grey.Darken2);
                }

                // Signoff
                main.Item().PaddingTop(22).Column(signoff =>
                {
                    signoff.Item().Text("Thank you for choosing us!").FontSize(11).Bold().FontColor("#4A200E");
                    signoff.Item().PaddingTop(2).Text("This is a system-generated invoice and does not require a physical signature.").FontSize(7.5f).Italic().FontColor(Colors.Grey.Darken1);
                });
            });
        });
    }

    private static void ComposePirnavSidebarFooter(IContainer footer, InvoiceSnapshotDto snapshot, TemplateVersionDto template)
    {
        var company = template.CompanyDetails;
        var address = !string.IsNullOrWhiteSpace(company.City)
            ? $"{company.City}, {company.State}, {company.PostalCode}"
            : "Hyderabad, Telangana, 500081";
        var companyName = string.IsNullOrWhiteSpace(company.CompanyName)
            ? "Pirnav Software Solutions Pvt. Ltd."
            : company.CompanyName;
        var email = string.IsNullOrWhiteSpace(company.Email) ? "pradeep@pirnav.com" : company.Email;
        var phone = string.IsNullOrWhiteSpace(company.Phone) ? "+91 8121076485" : company.Phone;

        footer.PaddingBottom(8, Unit.Millimetre).Column(col =>
        {
            col.Item().LineHorizontal(0.5f).LineColor("#D8B9A8");
            col.Item().PaddingTop(4).AlignCenter().Text($"{companyName} | {address}").FontSize(8).FontColor(Colors.Grey.Darken1);
            col.Item().AlignCenter().Text($"{email} | {phone}").FontSize(8).FontColor(Colors.Grey.Darken1);
        });
    }

    private static string FormatAmountInWords(decimal amount, string currency)
    {
        var normalized = Math.Round(Math.Max(0m, amount), 2, MidpointRounding.AwayFromZero);
        var wholeUnits = decimal.ToInt64(decimal.Truncate(normalized));
        var fractionUnits = decimal.ToInt64(decimal.Round((normalized - wholeUnits) * 100m, 0, MidpointRounding.AwayFromZero));
        if (fractionUnits >= 100)
        {
            wholeUnits += 1;
            fractionUnits -= 100;
        }

        var isInr = string.Equals(currency, "INR", StringComparison.OrdinalIgnoreCase);
        var prefix = isInr ? "Rupees" : currency;
        var fractionLabel = isInr ? "Paise" : "Cents";

        return fractionUnits > 0
            ? $"{prefix} {IndianNumberWords(wholeUnits)} and {IndianNumberWords(fractionUnits)} {fractionLabel} Only"
            : $"{prefix} {IndianNumberWords(wholeUnits)} Only";
    }

    private static string IndianNumberWords(long value)
    {
        if (value == 0) return "Zero";
        var words = new[] { "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen" };
        var tens = new[] { "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety" };
        string BelowThousand(long number) => number switch { < 20 => words[number], < 100 => tens[number / 10] + (number % 10 > 0 ? " " + words[number % 10] : string.Empty), _ => words[number / 100] + " Hundred" + (number % 100 > 0 ? " " + BelowThousand(number % 100) : string.Empty) };
        string Join(long number, long divisor, string unit) => IndianNumberWords(number / divisor) + " " + unit + (number % divisor > 0 ? " " + IndianNumberWords(number % divisor) : string.Empty);
        return value >= 10_000_000 ? Join(value, 10_000_000, "Crore") : value >= 100_000 ? Join(value, 100_000, "Lakh") : value >= 1_000 ? Join(value, 1_000, "Thousand") : BelowThousand(value);
    }

    private static void SummaryRow(ColumnDescriptor col, string label, string value, string? fontColor = null)
    {
        col.Item().PaddingVertical(1).Row(r =>
        {
            r.RelativeItem().Text(label).FontSize(8.5f).FontColor(Colors.Grey.Darken2);
            r.ConstantItem(85).AlignRight().Text(value).FontSize(8.5f).FontColor(fontColor ?? Colors.Grey.Darken3);
        });
    }

    private static void MetaRow(ColumnDescriptor column, string label, string value)
    {
        column.Item().Row(row =>
        {
            row.RelativeItem().Text(label).FontSize(8.5f).Bold();
            row.ConstantItem(85).AlignRight().Text(value).FontSize(8.5f);
        });
    }

    private static void ComposePirnavItemsTable(TableDescriptor table, InvoiceSnapshotDto snapshot, string primaryColor)
    {
        table.ColumnsDefinition(columns =>
        {
            columns.ConstantColumn(32);
            columns.RelativeColumn(3);
            columns.ConstantColumn(40);
            columns.ConstantColumn(72);
            columns.ConstantColumn(65);
            columns.ConstantColumn(44);
            columns.ConstantColumn(78);
        });

        table.Header(header =>
        {
            header.Cell().Element(HeaderCell).Text("Item #");
            header.Cell().Element(HeaderCell).Text("Description");
            header.Cell().Element(HeaderCell).AlignCenter().Text("Qty");
            header.Cell().Element(HeaderCell).AlignRight().Text($"Unit Price ({snapshot.CurrencySymbol})");
            header.Cell().Element(HeaderCell).AlignRight().Text($"Discount ({snapshot.CurrencySymbol})");
            header.Cell().Element(HeaderCell).AlignCenter().Text("Tax (%)");
            header.Cell().Element(HeaderCell).AlignRight().Text($"Amount ({snapshot.CurrencySymbol})");
        });

        var index = 1;
        foreach (var item in snapshot.Items)
        {
            var background = index % 2 == 0 ? Colors.Grey.Lighten5 : Colors.White;
            table.Cell().Element(c => RowCell(c, background)).Text(index.ToString());
            table.Cell().Element(c => RowCell(c, background)).Column(itemColumn =>
            {
                itemColumn.Item().Text(item.ItemName).Bold().FontColor(Colors.Grey.Darken4);
                if (!string.IsNullOrWhiteSpace(item.Description) && !string.Equals(item.Description, item.ItemName, StringComparison.Ordinal))
                    itemColumn.Item().Text(item.Description).FontSize(8).FontColor(Colors.Grey.Darken1);
            });
            table.Cell().Element(c => RowCell(c, background)).AlignCenter().Text(item.Quantity.ToString("0.##"));
            table.Cell().Element(c => RowCell(c, background)).AlignRight().Text(item.UnitPrice.ToString("N2"));
            table.Cell().Element(c => RowCell(c, background)).AlignRight().Text(item.DiscountAmount.ToString("N2"));
            table.Cell().Element(c => RowCell(c, background)).AlignCenter().Text($"{item.TaxRatePercent:0.##}%");
            table.Cell().Element(c => RowCell(c, background)).AlignRight().Text(FormatMoney(item.LineTotal, snapshot.CurrencySymbol)).Bold().FontColor(primaryColor);
            index++;
        }

        static IContainer HeaderCell(IContainer container) => container.Background(Colors.Grey.Lighten3).BorderBottom(1).BorderColor(Colors.Grey.Darken1).PaddingVertical(4).PaddingHorizontal(3);
        static IContainer RowCell(IContainer container, string background) => container.Background(background).BorderBottom(0.5f).BorderColor(Colors.Grey.Lighten2).PaddingVertical(4).PaddingHorizontal(3);
    }

    #endregion

    #region Footer Composition

    private static void ComposeFooter(IContainer footer, InvoiceSnapshotDto snapshot, TemplateVersionDto template)
    {
        if (template.Layout.UsePirnavSidebarLayout)
        {
            ComposePirnavSidebarFooter(footer, snapshot, template);
            return;
        }
        if (template.Layout.UsePirnavStandardLayout)
        {
            var footerNote = string.IsNullOrWhiteSpace(template.Terms.FooterNote)
                ? "Thank you for choosing us! This is a system-generated invoice and does not require a physical signature."
                : template.Terms.FooterNote;
            var separator = footerNote.IndexOf(" This is", StringComparison.OrdinalIgnoreCase);
            var thankYou = separator > 0 ? footerNote[..separator].Trim() : footerNote;
            var company = template.CompanyDetails;
            var locationParts = new List<string>();
            if (!string.IsNullOrWhiteSpace(company.City)) locationParts.Add(company.City);
            if (!string.IsNullOrWhiteSpace(company.State)) locationParts.Add(company.State);
            if (!string.IsNullOrWhiteSpace(company.PostalCode)) locationParts.Add(company.PostalCode);
            var footerLocation = string.Join(", ", locationParts);
            if (string.IsNullOrWhiteSpace(footerLocation))
            {
                var address = company.AddressLine1 ?? string.Empty;
                var hyderabadIndex = address.IndexOf("Hyderabad", StringComparison.OrdinalIgnoreCase);
                footerLocation = hyderabadIndex >= 0 ? address[hyderabadIndex..].Trim() : address;
            }

            var footerContactParts = new List<string>();
            if (!string.IsNullOrWhiteSpace(company.CompanyName)) footerContactParts.Add(company.CompanyName);
            if (!string.IsNullOrWhiteSpace(footerLocation)) footerContactParts.Add(footerLocation);
            if (!string.IsNullOrWhiteSpace(company.Email)) footerContactParts.Add(company.Email);
            if (!string.IsNullOrWhiteSpace(company.Phone)) footerContactParts.Add(company.Phone);
            var footerContact = string.Join(" | ", footerContactParts);

            footer.Column(column =>
            {
                column.Item().LineHorizontal(0.5f).LineColor("#D8B9A8");
                if (!string.IsNullOrWhiteSpace(footerContact))
                {
                    column.Item().PaddingTop(5).AlignCenter().Text(footerContact).FontSize(8).FontColor(Colors.Grey.Darken1);
                }
                column.Item().PaddingTop(2).AlignCenter().Text(thankYou).FontSize(8).FontColor(Colors.Grey.Darken1);
            });
            return;
        }

        footer.Column(col =>
        {
            col.Item().LineHorizontal(0.5f).LineColor(Colors.Grey.Lighten2);
            col.Item().PaddingTop(3).Row(row =>
            {
                row.RelativeItem().Text(string.IsNullOrWhiteSpace(template.Terms.FooterNote)
                    ? "Thank you for your business! This is a computer-generated invoice."
                    : template.Terms.FooterNote).FontSize(7.5f).FontColor(Colors.Grey.Darken1);

                row.ConstantItem(100).AlignRight().Text(x =>
                {
                    x.Span("Page ");
                    x.CurrentPageNumber();
                    x.Span(" of ");
                    x.TotalPages();
                });
            });
        });
    }

    #endregion

    #region Helpers & Default Sample Data

    private static string FormatMoney(decimal amount, string symbol) => $"{symbol} {amount:N2}";

    private static InvoiceSnapshotDto CreateDefaultSampleSnapshot(TemplatePreviewRequest request)
    {
        var symbol = request.Layout.CurrencySymbol ?? "₹";
        var currency = request.Layout.CurrencyCode ?? "INR";

        return new InvoiceSnapshotDto
        {
            InvoiceId = 999,
            InvoiceNumber = "INV-SAMPLE-001",
            IssueDate = DateTime.Today,
            DueDate = DateTime.Today.AddDays(15),
            Status = "Issued",
            Currency = currency,
            CurrencySymbol = symbol,
            Customer = new CustomerSnapshotDto
            {
                CustomerId = 1,
                CustomerName = "Enterprise Global Corp",
                CustomerCode = "CUST-GLOBAL-01",
                TaxId = "36AAACH7409R1ZZ",
                Email = "billing@enterpriseglobal.com",
                BillingAddress = "Plot 42, Hitech City, Hyderabad, Telangana 500081"
            },
            Items =
            [
                new InvoiceItemSnapshotDto
                {
                    ItemId = 101,
                    ItemName = "Enterprise Cloud Subscription",
                    Description = "Annual platform tier with 99.9% uptime SLA",
                    HsnSacCode = "998313",
                    Quantity = 1,
                    Unit = "Year",
                    UnitPrice = 120000m,
                    DiscountAmount = 10000m,
                    TaxRatePercent = 18m,
                    TaxAmount = 19800m,
                    LineTotal = 129800m
                },
                new InvoiceItemSnapshotDto
                {
                    ItemId = 102,
                    ItemName = "Custom Integration & Consulting",
                    Description = "On-site implementation and workflow training",
                    HsnSacCode = "998314",
                    Quantity = 25,
                    Unit = "Hours",
                    UnitPrice = 2400m,
                    DiscountAmount = 0m,
                    TaxRatePercent = 18m,
                    TaxAmount = 10800m,
                    LineTotal = 70800m
                }
            ],
            Subtotal = 180000m,
            TotalDiscount = 10000m,
            TotalTax = 30600m,
            TotalAdditionalCharges = 1500m,
            GrandTotal = 202100m,
            AmountPaid = 50000m,
            BalanceDue = 152100m,
            TaxBreakdowns =
            [
                new TaxBreakdownSnapshotDto { TaxName = "CGST", RatePercent = 9m, TaxableAmount = 170000m, TaxAmount = 15300m },
                new TaxBreakdownSnapshotDto { TaxName = "SGST", RatePercent = 9m, TaxableAmount = 170000m, TaxAmount = 15300m }
            ],
            AdditionalCharges =
            [
                new ChargeSnapshotDto { ChargeName = "Platform Maintenance Fee", Amount = 1500m }
            ]
        };
    }

    #region Pirnav 4 Design Layout Composers

    private static void ComposeCornerDocument(PageDescriptor page, InvoiceSnapshotDto snapshot, TemplateVersionDto template)
    {
        page.Size(PageSizes.A4);
        page.MarginTop(12, Unit.Millimetre);
        page.MarginBottom(12, Unit.Millimetre);
        page.MarginLeft(14, Unit.Millimetre);
        page.MarginRight(14, Unit.Millimetre);
        page.PageColor(Colors.White);
        page.DefaultTextStyle(x => x.FontFamily(template.Branding.FontFamily ?? "Segoe UI").FontSize(9f).FontColor(Color.FromHex(TextDark)));

        page.Header().Row(h =>
        {
            // Corner Badge holding Title, Number, Date
            h.RelativeItem(3).Background(PrimaryBrown).BorderBottom(2f).BorderRight(2f).BorderColor(AccentTan).CornerRadius(4).Padding(8).Column(badge =>
            {
                badge.Item().Text(snapshot.DocumentTitle).FontSize(19).ExtraBold().FontColor(Colors.White);
                badge.Item().Text($"{snapshot.DocumentNumberLabel}: {snapshot.InvoiceNumber}").FontSize(8.5f).FontColor(Color.FromHex(TanFill));
                badge.Item().Text($"{snapshot.DateLabel}: {snapshot.IssueDate:dd MMM yyyy}").FontSize(8.5f).FontColor(Color.FromHex(TanFill));
            });

            // Company Logo + Details on top right
            h.RelativeItem(4).AlignRight().Column(comp =>
            {
                var logoBytes = TryGetLogoBytes(template.Branding.LogoUrl);
                if (template.Layout.ShowLogo && logoBytes is not null)
                {
                    comp.Item().AlignRight().Width(110).Height(45).Image(logoBytes).FitArea();
                    comp.Item().PaddingBottom(2);
                }
                var companyName = string.IsNullOrWhiteSpace(template.CompanyDetails.CompanyName) ? "IBMS Solutions" : template.CompanyDetails.CompanyName;
                comp.Item().AlignRight().Text(companyName).FontSize(11).Bold().FontColor(PrimaryBrown);
                var address = $"{template.CompanyDetails.AddressLine1} {template.CompanyDetails.AddressLine2}, {template.CompanyDetails.City} {template.CompanyDetails.State} {template.CompanyDetails.PostalCode}".Trim().Trim(',').Trim();
                if (!string.IsNullOrWhiteSpace(address)) comp.Item().AlignRight().Text(address).FontSize(7.5f).FontColor(Color.FromHex(TextMuted));
                if (!string.IsNullOrWhiteSpace(template.CompanyDetails.Email)) comp.Item().AlignRight().Text(template.CompanyDetails.Email).FontSize(7.5f).FontColor(Color.FromHex(TextMuted));
                if (!string.IsNullOrWhiteSpace(template.CompanyDetails.Phone)) comp.Item().AlignRight().Text(template.CompanyDetails.Phone).FontSize(7.5f).FontColor(Color.FromHex(TextMuted));
            });
        });

        page.Footer().Column(f =>
        {
            f.Item().Background(PrimaryBrown).Height(5);
            var footerNote = string.IsNullOrWhiteSpace(template.Terms.FooterNote)
                ? "Thank you for choosing us! This is a system-generated document and does not require a physical signature."
                : template.Terms.FooterNote;
            f.Item().PaddingTop(3).Row(row =>
            {
                row.RelativeItem().Text(footerNote).FontSize(7.5f).FontColor(Color.FromHex(TextMuted));
                row.ConstantItem(80).AlignRight().Text(x =>
                {
                    x.Span("Page ").FontSize(7.5f).FontColor(Color.FromHex(TextMuted));
                    x.CurrentPageNumber().FontSize(7.5f).FontColor(Color.FromHex(TextMuted));
                    x.Span(" of ").FontSize(7.5f).FontColor(Color.FromHex(TextMuted));
                    x.TotalPages().FontSize(7.5f).FontColor(Color.FromHex(TextMuted));
                });
            });
        });

        page.Content().PaddingTop(12).Column(col =>
        {
            // Bill To and Balance Due highlight box
            col.Item().PaddingBottom(12).Row(r =>
            {
                r.RelativeItem().Background(TanFill).Border(0.5f).BorderColor(LightLine).CornerRadius(4).Padding(8).Column(c =>
                {
                    c.Item().Text("BILL TO:").FontSize(8.5f).Bold().FontColor(PrimaryBrown);
                    c.Item().PaddingTop(2).Text(snapshot.Customer.CustomerName).FontSize(10f).Bold().FontColor(Color.FromHex(TextDark));
                    if (!string.IsNullOrWhiteSpace(snapshot.Customer.CustomerCode)) c.Item().Text($"Code: {snapshot.Customer.CustomerCode}").FontSize(8f).FontColor(Color.FromHex(TextMuted));
                    if (!string.IsNullOrWhiteSpace(snapshot.Customer.BillingAddress)) c.Item().Text(snapshot.Customer.BillingAddress).FontSize(8f).FontColor(Color.FromHex(TextMuted));
                    if (!string.IsNullOrWhiteSpace(snapshot.Customer.Email)) c.Item().Text(snapshot.Customer.Email).FontSize(8f).FontColor(Color.FromHex(TextMuted));
                });

                r.ConstantItem(14);

                r.RelativeItem().Background(PrimaryBrown).CornerRadius(6).Padding(10).Column(c =>
                {
                    c.Item().Text("BALANCE DUE").FontSize(9).Bold().FontColor(Color.FromHex(AccentTan));
                    c.Item().PaddingTop(2).Text(FormatMoney(snapshot.BalanceDue, snapshot.CurrencySymbol)).FontSize(16).ExtraBold().FontColor(Colors.White);
                    c.Item().PaddingTop(2).Text($"Due: {snapshot.DueDate:dd MMM yyyy}").FontSize(8).FontColor(Color.FromHex(TanFill));
                });
            });

            // Dashed border details strip
            col.Item().PaddingBottom(12).Border(0.5f).BorderColor(Color.FromHex(AccentTan)).Padding(6).Row(strip =>
            {
                strip.RelativeItem().Column(c => { c.Item().Text(snapshot.DocumentNumberLabel).FontSize(7.5f).FontColor(Color.FromHex(TextMuted)); c.Item().Text(snapshot.InvoiceNumber).FontSize(8.5f).Bold(); });
                strip.RelativeItem().Column(c => { c.Item().Text(snapshot.DateLabel).FontSize(7.5f).FontColor(Color.FromHex(TextMuted)); c.Item().Text(snapshot.IssueDate.ToString("dd MMM yyyy")).FontSize(8.5f); });
                strip.RelativeItem().Column(c => { c.Item().Text(snapshot.DueDateLabel).FontSize(7.5f).FontColor(Color.FromHex(TextMuted)); c.Item().Text(snapshot.DueDate.ToString("dd MMM yyyy")).FontSize(8.5f); });
                strip.RelativeItem().Column(c => { c.Item().Text("Currency").FontSize(7.5f).FontColor(Color.FromHex(TextMuted)); c.Item().Text(snapshot.Currency).FontSize(8.5f); });
                strip.RelativeItem().Column(c => { c.Item().Text("Status").FontSize(7.5f).FontColor(Color.FromHex(TextMuted)); c.Item().Text(snapshot.Status).FontSize(8.5f).Bold().FontColor(PrimaryBrown); });
            });

            // Rounded brown table header with subtle row lines
            col.Item().Table(table => ComposeCornerTable(table, snapshot));

            // Totals and Notes
            col.Item().PaddingTop(12).Row(r =>
            {
                r.RelativeItem(3).Background(TanFill).Border(0.5f).BorderColor(LightLine).CornerRadius(4).Padding(8).Column(notes =>
                {
                    notes.Item().Text("Amount in Words").FontSize(8.5f).Bold().FontColor(PrimaryBrown);
                    notes.Item().Text(FormatAmountInWords(snapshot.GrandTotal, snapshot.Currency)).FontSize(8.5f);

                    if (template.Layout.ShowTermsAndConditions && !string.IsNullOrWhiteSpace(template.Terms.TermsAndConditions))
                    {
                        notes.Item().PaddingTop(8).Text("Terms & Conditions").FontSize(8.5f).Bold().FontColor(PrimaryBrown);
                        notes.Item().Text(template.Terms.TermsAndConditions).FontSize(7.5f).FontColor(Color.FromHex(TextMuted));
                    }
                });

                r.ConstantItem(14);

                r.RelativeItem(2).Column(totals =>
                {
                    ComposeTotalsBreakdown(totals, snapshot);
                });
            });
        });
    }

    private static void ComposeTotalsBreakdown(ColumnDescriptor totals, InvoiceSnapshotDto snapshot)
    {
        PirnavTotalRow(totals, "Subtotal", FormatMoney(snapshot.Subtotal, snapshot.CurrencySymbol));
        if (snapshot.TotalDiscount > 0)
        {
            PirnavTotalRow(totals, "Discount", $"-{FormatMoney(snapshot.TotalDiscount, snapshot.CurrencySymbol)}", false, Colors.Red.Darken1);
        }
        foreach (var tax in snapshot.TaxBreakdowns)
        {
            PirnavTotalRow(totals, $"{tax.TaxName} ({tax.RatePercent:0.##}%)", FormatMoney(tax.TaxAmount, snapshot.CurrencySymbol));
        }
        PirnavTotalRow(totals, "Total Amount", FormatMoney(snapshot.GrandTotal, snapshot.CurrencySymbol), true, Color.FromHex(PrimaryBrown));
        PirnavTotalRow(totals, "Amount Paid", FormatMoney(snapshot.AmountPaid, snapshot.CurrencySymbol), false, Color.FromHex(PaidGreen));
        totals.Item().Background(PrimaryBrown).CornerRadius(3).PaddingVertical(4).PaddingHorizontal(6).Row(row =>
        {
            row.RelativeItem().Text("Balance Due").FontSize(9.5f).Bold().FontColor(Colors.White);
            row.ConstantItem(85).AlignRight().Text(FormatMoney(snapshot.BalanceDue, snapshot.CurrencySymbol)).FontSize(9.5f).Bold().FontColor(Colors.White);
        });
    }

    private static void ComposeCornerTable(TableDescriptor table, InvoiceSnapshotDto snapshot)
    {
        table.ColumnsDefinition(columns =>
        {
            columns.ConstantColumn(36);
            columns.RelativeColumn(3);
            columns.ConstantColumn(95);
            columns.ConstantColumn(80);
            columns.ConstantColumn(85);
        });
        table.Header(header =>
        {
            header.Cell().Element(HeaderCell).Text("Item #");
            header.Cell().Element(HeaderCell).Text("Description");
            header.Cell().Element(HeaderCell).Text("Months / Payment");
            header.Cell().Element(HeaderCell).AlignRight().Text("Rate");
            header.Cell().Element(HeaderCell).AlignRight().Text("Amount");
        });
        var number = 1;
        foreach (var item in snapshot.Items)
        {
            table.Cell().Element(RowCell).Text(number.ToString());
            table.Cell().Element(RowCell).Column(desc =>
            {
                desc.Item().Text(item.ItemName).FontSize(8.5f).Bold().FontColor(Color.FromHex(TextDark));
                if (!string.IsNullOrWhiteSpace(item.Description) && !string.Equals(item.ItemName, item.Description, StringComparison.Ordinal))
                    desc.Item().Text(item.Description).FontSize(7.5f).FontColor(Color.FromHex(TextMuted));
            });
            table.Cell().Element(RowCell).Text(string.IsNullOrWhiteSpace(item.Unit) ? "-" : item.Unit).FontSize(8.5f);
            table.Cell().Element(RowCell).AlignRight().Text(FormatMoney(item.UnitPrice, snapshot.CurrencySymbol)).FontSize(8.5f);
            table.Cell().Element(RowCell).AlignRight().Text(FormatMoney(item.LineTotal, snapshot.CurrencySymbol)).FontSize(8.5f).Bold().FontColor(PrimaryBrown);
            number++;
        }
        static IContainer HeaderCell(IContainer c) => c.Background(PrimaryBrown).CornerRadius(3).PaddingVertical(5).PaddingHorizontal(6).DefaultTextStyle(s => s.FontSize(8.5f).Bold().FontColor(Colors.White));
        static IContainer RowCell(IContainer c) => c.BorderBottom(0.5f).BorderColor(LightLine).PaddingVertical(4).PaddingHorizontal(6);
    }

    private static string ExtractThankYouNote(string? footerNote)
    {
        if (string.IsNullOrWhiteSpace(footerNote)) return "Thank you for choosing us!";
        var sep = footerNote.IndexOf(" This is", StringComparison.OrdinalIgnoreCase);
        return sep > 0 ? footerNote[..sep].Trim() : footerNote;
    }

    #region Wave Clean Layout Implementation

    private static void ComposeWaveCleanDocument(PageDescriptor page, InvoiceSnapshotDto snapshot, TemplateVersionDto template)
    {
        page.Size(PageSizes.A4);
        page.MarginTop(0);
        page.MarginBottom(10, Unit.Millimetre);
        page.MarginLeft(14, Unit.Millimetre);
        page.MarginRight(14, Unit.Millimetre);
        page.PageColor(Colors.White);

        var primaryColorHex = string.IsNullOrWhiteSpace(template.Branding.PrimaryColor) ? "#137E88" : template.Branding.PrimaryColor;
        if (!primaryColorHex.StartsWith('#')) primaryColorHex = "#" + primaryColorHex;
        var primaryColor = Color.FromHex(primaryColorHex);

        var fontFamily = template.Branding.FontFamily ?? "Segoe UI";
        page.DefaultTextStyle(x => x.FontFamily(fontFamily).FontSize(9f).FontColor(Color.FromHex("#111827")));

        page.Header().Column(header =>
        {
            // Top Accent Bar extending full page width
            header.Item().ExtendHorizontal().Height(14).Background(primaryColor);

            // Header content: Left Logo + Bold "Invoice" title; Right Company info
            header.Item().PaddingTop(16).PaddingBottom(12).Row(h =>
            {
                // Left Column: Logo + Bold Invoice
                h.RelativeItem(5).Column(leftCol =>
                {
                    var logoBytes = TryGetLogoBytes(template.Branding.LogoUrl);
                    if (template.Layout.ShowLogo && logoBytes is not null)
                    {
                        var logoWidth = Math.Clamp(template.Branding.LogoWidth, 60, 160);
                        leftCol.Item().Width(logoWidth).Height(45).Image(logoBytes).FitArea();
                        leftCol.Item().PaddingBottom(4);
                    }
                    leftCol.Item().Text(string.IsNullOrWhiteSpace(snapshot.DocumentTitle) ? "Invoice" : snapshot.DocumentTitle)
                        .FontSize(30).Bold().FontColor(Color.FromHex("#111827"));
                });

                // Right Column: Company Name & Address
                h.RelativeItem(6).AlignRight().Column(comp =>
                {
                    var companyName = string.IsNullOrWhiteSpace(template.CompanyDetails.CompanyName) ? "Your Company Name" : template.CompanyDetails.CompanyName;
                    comp.Item().AlignRight().Text(companyName).FontSize(13).Bold().FontColor(Color.FromHex("#111827"));

                    if (!string.IsNullOrWhiteSpace(template.CompanyDetails.AddressLine1))
                        comp.Item().AlignRight().Text(template.CompanyDetails.AddressLine1).FontSize(8.5f).FontColor(Color.FromHex("#4B5563"));

                    var cityStatePostal = $"{template.CompanyDetails.City} {template.CompanyDetails.State} {template.CompanyDetails.PostalCode}".Trim();
                    if (!string.IsNullOrWhiteSpace(cityStatePostal))
                        comp.Item().AlignRight().Text(cityStatePostal).FontSize(8.5f).FontColor(Color.FromHex("#4B5563"));

                    if (!string.IsNullOrWhiteSpace(template.CompanyDetails.Country))
                        comp.Item().AlignRight().Text(template.CompanyDetails.Country).FontSize(8.5f).FontColor(Color.FromHex("#4B5563"));

                    if (!string.IsNullOrWhiteSpace(template.CompanyDetails.Email))
                        comp.Item().AlignRight().Text(template.CompanyDetails.Email).FontSize(8.5f).FontColor(Color.FromHex("#4B5563"));

                    if (!string.IsNullOrWhiteSpace(template.CompanyDetails.Phone))
                        comp.Item().AlignRight().Text(template.CompanyDetails.Phone).FontSize(8.5f).FontColor(Color.FromHex("#4B5563"));
                });
            });

            // Thin divider line
            header.Item().BorderBottom(1f).BorderColor(Color.FromHex("#E5E7EB"));
        });

        page.Footer().Column(f =>
        {
            var footerNote = string.IsNullOrWhiteSpace(template.Terms.FooterNote)
                ? "This invoice was generated by IBMS Solutions. Thank you for your business!"
                : template.Terms.FooterNote;

            f.Item().Background(Color.FromHex("#F0F9FA")).Padding(6).AlignCenter().Text(footerNote).FontSize(8f).FontColor(Color.FromHex("#4B5563"));

            f.Item().PaddingTop(3).Row(row =>
            {
                row.RelativeItem().Text("Thank you for choosing us!").FontSize(7.5f).FontColor(Color.FromHex("#6B7280"));
                row.ConstantItem(80).AlignRight().Text(x =>
                {
                    x.Span("Page ").FontSize(7.5f).FontColor(Color.FromHex("#6B7280"));
                    x.CurrentPageNumber().FontSize(7.5f).FontColor(Color.FromHex("#6B7280"));
                    x.Span(" of ").FontSize(7.5f).FontColor(Color.FromHex("#6B7280"));
                    x.TotalPages().FontSize(7.5f).FontColor(Color.FromHex("#6B7280"));
                });
            });
        });

        page.Content().Column(col =>
        {
            // Bill To & Invoice Meta Row
            col.Item().PaddingTop(12).PaddingBottom(12).Row(r =>
            {
                // Left: BILL TO
                r.RelativeItem(5).Column(billTo =>
                {
                    billTo.Item().Text("BILL TO:").FontSize(8f).Bold().FontColor(Color.FromHex("#6B7280"));
                    billTo.Item().PaddingTop(2).Text(snapshot.Customer.CustomerName).FontSize(11f).Bold().FontColor(Color.FromHex("#111827"));
                    if (!string.IsNullOrWhiteSpace(snapshot.Customer.BillingAddress))
                        billTo.Item().Text(snapshot.Customer.BillingAddress).FontSize(8.5f).FontColor(Color.FromHex("#4B5563"));
                    if (!string.IsNullOrWhiteSpace(snapshot.Customer.Email))
                        billTo.Item().Text(snapshot.Customer.Email).FontSize(8.5f).FontColor(Color.FromHex("#4B5563"));
                    if (!string.IsNullOrWhiteSpace(snapshot.Customer.Phone))
                        billTo.Item().Text(snapshot.Customer.Phone).FontSize(8.5f).FontColor(Color.FromHex("#4B5563"));
                });

                // Right: INVOICE #, DATE, INVOICE DUE DATE
                r.RelativeItem(5).AlignRight().Column(meta =>
                {
                    meta.Item().AlignRight().Text("INVOICE #").FontSize(8f).Bold().FontColor(Color.FromHex("#111827"));
                    meta.Item().AlignRight().Text(snapshot.InvoiceNumber).FontSize(9f).FontColor(Color.FromHex("#374151"));

                    meta.Item().PaddingTop(4).AlignRight().Text("DATE").FontSize(8f).Bold().FontColor(Color.FromHex("#111827"));
                    meta.Item().AlignRight().Text(snapshot.IssueDate.ToString("MM/dd/yy")).FontSize(9f).FontColor(Color.FromHex("#374151"));

                    meta.Item().PaddingTop(4).AlignRight().Text("INVOICE DUE DATE").FontSize(8f).Bold().FontColor(Color.FromHex("#111827"));
                    meta.Item().AlignRight().Text(snapshot.DueDate.ToString("MM/dd/yy")).FontSize(9f).FontColor(Color.FromHex("#374151"));
                });
            });

            // Thin divider before table
            col.Item().BorderBottom(1f).BorderColor(Color.FromHex("#E5E7EB"));

            // Clean Wave Table
            col.Item().PaddingTop(6).Table(table => ComposeWaveCleanTable(table, snapshot));

            // Solid divider after table
            col.Item().PaddingTop(4).BorderBottom(1.5f).BorderColor(Color.FromHex("#D1D5DB"));

            // Bottom row: Notes & Huge Total
            col.Item().PaddingTop(16).Row(bot =>
            {
                bot.RelativeItem(6).Column(notes =>
                {
                    notes.Item().Text("NOTES:").FontSize(8.5f).Bold().FontColor(Color.FromHex("#111827"));
                    var noteText = !string.IsNullOrWhiteSpace(template.Terms.TermsAndConditions)
                        ? template.Terms.TermsAndConditions
                        : !string.IsNullOrWhiteSpace(template.Terms.HeaderText)
                            ? template.Terms.HeaderText
                            : "Payment is due within 30 days of invoice date. Thank you for choosing us.";
                    notes.Item().PaddingTop(4).Text(noteText).FontSize(8.5f).FontColor(Color.FromHex("#4B5563"));

                    if (snapshot.IncludePayOnlineLink)
                    {
                        notes.Item().PaddingTop(6).Text("Pay online at our secure portal.").FontSize(8f).FontColor(primaryColor);
                    }
                });

                bot.RelativeItem(5).AlignRight().Column(tot =>
                {
                    tot.Item().AlignRight().Text("TOTAL").FontSize(9f).Bold().FontColor(Color.FromHex("#111827"));
                    tot.Item().PaddingTop(4).AlignRight().Text(FormatMoney(snapshot.GrandTotal, snapshot.CurrencySymbol))
                        .FontSize(26f).Bold().FontColor(Color.FromHex("#111827"));

                    if (snapshot.AmountPaid > 0)
                    {
                        tot.Item().PaddingTop(4).AlignRight().Text($"Paid: {FormatMoney(snapshot.AmountPaid, snapshot.CurrencySymbol)}")
                            .FontSize(9f).FontColor(Color.FromHex("#166534"));
                        tot.Item().AlignRight().Text($"Balance Due: {FormatMoney(snapshot.BalanceDue, snapshot.CurrencySymbol)}")
                            .FontSize(11f).Bold().FontColor(Color.FromHex("#DC2626"));
                    }
                });
            });
        });
    }

    private static void ComposeWaveCleanTable(TableDescriptor table, InvoiceSnapshotDto snapshot)
    {
        table.ColumnsDefinition(columns =>
        {
            columns.RelativeColumn(2.5f);  // ITEMS
            columns.RelativeColumn(3.5f);  // DESCRIPTION
            columns.ConstantColumn(60);    // QUANTITY
            columns.ConstantColumn(70);    // PRICE
            columns.ConstantColumn(55);    // TAX
            columns.ConstantColumn(80);    // AMOUNT
        });

        table.Header(header =>
        {
            header.Cell().Element(HeaderCell).Text("ITEMS");
            header.Cell().Element(HeaderCell).Text("DESCRIPTION");
            header.Cell().Element(HeaderCell).AlignRight().Text("QUANTITY");
            header.Cell().Element(HeaderCell).AlignRight().Text("PRICE");
            header.Cell().Element(HeaderCell).AlignRight().Text("TAX");
            header.Cell().Element(HeaderCell).AlignRight().Text("AMOUNT");
        });

        foreach (var item in snapshot.Items)
        {
            table.Cell().Element(RowCell).Text(item.ItemName).Bold().FontColor(Color.FromHex("#111827"));
            table.Cell().Element(RowCell).Text(string.IsNullOrWhiteSpace(item.Description) ? "-" : item.Description).FontColor(Color.FromHex("#4B5563"));
            table.Cell().Element(RowCell).AlignRight().Text(item.Quantity.ToString("N0"));
            table.Cell().Element(RowCell).AlignRight().Text(FormatMoney(item.UnitPrice, snapshot.CurrencySymbol));
            table.Cell().Element(RowCell).AlignRight().Text(item.TaxRatePercent > 0 ? $"{item.TaxRatePercent:N0}%" : "0%");
            table.Cell().Element(RowCell).AlignRight().Text(FormatMoney(item.LineTotal, snapshot.CurrencySymbol)).Bold().FontColor(Color.FromHex("#111827"));
        }

        static IContainer HeaderCell(IContainer c) => c.PaddingVertical(6).PaddingHorizontal(4)
            .DefaultTextStyle(s => s.FontSize(8f).Bold().FontColor(Color.FromHex("#111827")));
        static IContainer RowCell(IContainer c) => c.PaddingVertical(6).PaddingHorizontal(4)
            .DefaultTextStyle(s => s.FontSize(8.5f));
    }

    #endregion

    #endregion

    #endregion
}
