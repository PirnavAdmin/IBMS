using Billing.Application.Interfaces;
using Billing.Contracts.InvoiceTemplate;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Billing.Infrastructure.Services;

/// <summary>
/// High-performance, deterministic C# server-side PDF generation engine using QuestPDF.
/// Implements Standard, Professional, and Compact visual presentations with multi-page pagination,
/// repeating table headers, line-item wrapping, and financial totals precision.
/// </summary>
public class QuestPdfInvoiceEngine : IInvoicePdfEngine
{
    private const string PirnavLogoPath = "/template-assets/pirnav.png";

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

        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                ApplyPageSetup(page, template);
                ComposeHeader(page.Header(), snapshot, template);
                ComposeContent(page.Content(), snapshot, template);
                ComposeFooter(page.Footer(), snapshot, template);
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

        return GenerateInvoicePdf(sampleSnapshot, mockTemplate);
    }

    #region Layout & Page Configuration

    private static void ApplyPageSetup(PageDescriptor page, TemplateVersionDto template)
    {
        page.Size(PageSizes.A4);
        var layout = template.Layout;

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
                    table.Cell().Element(c => CellStyleRow(c, bg)).AlignRight().Text($"{item.Quantity:N0} {item.Unit}");
                    table.Cell().Element(c => CellStyleRow(c, bg)).AlignRight().Text(FormatMoney(item.UnitPrice, snapshot.CurrencySymbol));
                    table.Cell().Element(c => CellStyleRow(c, bg)).AlignRight().Text(item.DiscountAmount > 0 ? FormatMoney(item.DiscountAmount, snapshot.CurrencySymbol) : "-");
                    table.Cell().Element(c => CellStyleRow(c, bg)).AlignRight().Text($"{item.TaxRatePercent:N0}%");
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
                    if (template.Layout.ShowPaymentInstructions && (!string.IsNullOrWhiteSpace(pay.BankName) || !string.IsNullOrWhiteSpace(pay.AccountNumber) || !string.IsNullOrWhiteSpace(pay.UpiId) || !string.IsNullOrWhiteSpace(pay.BankDetails) || !string.IsNullOrWhiteSpace(pay.PaymentNotes)))
                    {
                        c.Item().PaddingBottom(4).Text("PAYMENT INSTRUCTIONS").FontSize(8.5f).Bold().FontColor(secondaryColor);
                        c.Item().Border(0.5f).BorderColor(Colors.Grey.Lighten2).Background(Colors.Grey.Lighten5).Padding(6).Column(b =>
                        {
                            if (!string.IsNullOrWhiteSpace(pay.BankName)) b.Item().Text($"Bank: {pay.BankName}").FontSize(8f);
                            if (!string.IsNullOrWhiteSpace(pay.AccountHolderName)) b.Item().Text($"Account Name: {pay.AccountHolderName}").FontSize(8f);
                            if (!string.IsNullOrWhiteSpace(pay.AccountNumber)) b.Item().Text($"Account #: {pay.AccountNumber}").FontSize(8f).Bold();
                            if (!string.IsNullOrWhiteSpace(pay.IfscCode)) b.Item().Text($"IFSC Code: {pay.IfscCode}").FontSize(8f);
                            if (!string.IsNullOrWhiteSpace(pay.UpiId)) b.Item().Text($"UPI ID: {pay.UpiId}").FontSize(8f);
                            if (!string.IsNullOrWhiteSpace(pay.BankDetails)) b.Item().PaddingTop(2).Text(pay.BankDetails).FontSize(7.5f);
                            if (!string.IsNullOrWhiteSpace(pay.PaymentNotes)) b.Item().PaddingTop(2).Text(pay.PaymentNotes).FontSize(7.5f).Italic();
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
                        SummaryRow(c, $"{tax.TaxName} ({tax.RatePercent:N0}%)", FormatMoney(tax.TaxAmount, snapshot.CurrencySymbol));
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
                PirnavTotalRow(totals, "Subtotal", FormatMoney(snapshot.Subtotal, snapshot.CurrencySymbol));
                PirnavTotalRow(totals, "Total Amount", FormatMoney(snapshot.GrandTotal, snapshot.CurrencySymbol), true, Color.FromHex(primary));
                PirnavTotalRow(totals, "Amount Paid", FormatMoney(snapshot.AmountPaid, snapshot.CurrencySymbol), false, Colors.Green.Darken2);
                totals.Item().Background(primary).PaddingVertical(3).PaddingHorizontal(7).Row(row =>
                {
                    row.RelativeItem().Text("Balance Due").FontSize(10).Bold().FontColor(Colors.White);
                    row.ConstantItem(100).AlignRight().Text(FormatMoney(snapshot.BalanceDue, snapshot.CurrencySymbol)).FontSize(10).Bold().FontColor(Colors.White);
                });
            });

            column.Item().PaddingTop(17).Text("Amount in Words").FontSize(9).Bold();
            column.Item().Text(FormatAmountInWords(snapshot.GrandTotal, snapshot.Currency)).FontSize(8.5f);
            if (template.Layout.ShowTermsAndConditions && !string.IsNullOrWhiteSpace(template.Terms.TermsAndConditions))
            {
                column.Item().PaddingTop(12).Background(primary).PaddingVertical(4).PaddingHorizontal(6).Text("Terms & Conditions").FontSize(9).Bold().FontColor(Colors.White);
                column.Item().Border(0.5f).BorderColor("#D8B9A8").Padding(6).Text(template.Terms.TermsAndConditions).FontSize(8.3f);
            }

            column.Item().PaddingTop(17).AlignCenter().Text(thankYou).FontSize(10).Bold().FontColor(primary);
            column.Item().PaddingTop(3).AlignCenter().Text(systemNote).FontSize(8).Italic().FontColor(Colors.Grey.Darken1);
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
            columns.ConstantColumn(42); columns.RelativeColumn(3); columns.ConstantColumn(92); columns.ConstantColumn(82); columns.ConstantColumn(88);
        });
        table.Header(header =>
        {
            header.Cell().Element(HeaderCell).Text("Item #"); header.Cell().Element(HeaderCell).Text("Description"); header.Cell().Element(HeaderCell).Text("Months / Payment"); header.Cell().Element(HeaderCell).AlignRight().Text("Rate"); header.Cell().Element(HeaderCell).AlignRight().Text("Amount");
        });
        var number = 1;
        foreach (var item in snapshot.Items)
        {
            table.Cell().Element(RowCell).Text(number.ToString());
            table.Cell().Element(RowCell).Column(description =>
            {
                description.Item().Text(item.ItemName).FontSize(8.5f).Bold();
                if (!string.IsNullOrWhiteSpace(item.Description) && !string.Equals(item.ItemName, item.Description, StringComparison.Ordinal)) description.Item().Text(item.Description).FontSize(7.5f).FontColor(Colors.Grey.Darken1);
            });
            table.Cell().Element(RowCell).Text(string.IsNullOrWhiteSpace(item.Unit) ? "-" : item.Unit).FontSize(8.5f);
            table.Cell().Element(RowCell).AlignRight().Text(FormatMoney(item.UnitPrice, snapshot.CurrencySymbol)).FontSize(8.5f);
            table.Cell().Element(RowCell).AlignRight().Text(FormatMoney(item.LineTotal, snapshot.CurrencySymbol)).FontSize(8.5f).Bold();
            number++;
        }
        IContainer HeaderCell(IContainer container) => container.Background(primaryColor).PaddingVertical(5).PaddingHorizontal(6).DefaultTextStyle(style => style.FontSize(8.5f).Bold().FontColor(Colors.White));
        IContainer RowCell(IContainer container) => container.Background(softBackground).PaddingVertical(5).PaddingHorizontal(6);
    }

    private static string FormatAmountInWords(decimal amount, string currency)
    {
        var roundedAmount = Math.Max(0, decimal.ToInt64(decimal.Truncate(amount)));
        var prefix = string.Equals(currency, "INR", StringComparison.OrdinalIgnoreCase) ? "Rupees" : currency;
        return $"{prefix} {IndianNumberWords(roundedAmount)} Only";
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
            columns.ConstantColumn(82);
            columns.ConstantColumn(75);
            columns.ConstantColumn(78);
        });

        table.Header(header =>
        {
            header.Cell().Element(HeaderCell).Text("Item #");
            header.Cell().Element(HeaderCell).Text("Description");
            header.Cell().Element(HeaderCell).Text("Months / Payment");
            header.Cell().Element(HeaderCell).AlignRight().Text("Rate");
            header.Cell().Element(HeaderCell).AlignRight().Text("Amount");
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
            table.Cell().Element(c => RowCell(c, background)).Text(string.IsNullOrWhiteSpace(item.Unit) ? "-" : item.Unit);
            table.Cell().Element(c => RowCell(c, background)).AlignRight().Text(FormatMoney(item.UnitPrice, snapshot.CurrencySymbol));
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

    #endregion
}
