using Billing.Application.Interfaces;
using Billing.Domain.Entities;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using System.Text;

namespace Billing.Infrastructure.Services;

/// <summary>
/// High-performance C# server-side PDF generation engine using QuestPDF for Quotations.
/// Implements the official quotation visual design template matching the front-end design sheet.
/// </summary>
public class QuestPdfQuotationEngine : IQuotationPdfEngine
{
    private const string PrimaryBrown = "#5A2508";
    private const string TerracottaOrange = "#C4693A";
    private const string SampleBeige = "#F3E7D7";
    private const string CreamBackground = "#FBF7F2";
    private const string BorderLineColor = "#D8B9A8";
    private const string DarkTextColor = "#222222";
    private const string MutedTextColor = "#666666";

    static QuestPdfQuotationEngine()
    {
        QuestPDF.Settings.License = LicenseType.Community;
        QuestPDF.Settings.UseSystemFonts = true;
        QuestPDF.Settings.ThrowOnMissingFontFamilies = false;
    }

    public byte[] GenerateQuotationPdf(Quotation quotation, Tenant? tenant = null)
    {
        ArgumentNullException.ThrowIfNull(quotation);

        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                ApplyPageSetup(page);
                ComposeHeader(page.Header(), quotation, tenant);
                ComposeContent(page.Content(), quotation, tenant);
                ComposeFooter(page.Footer(), quotation, tenant);
            });
        });

        return document.GeneratePdf();
    }

    private static void ApplyPageSetup(PageDescriptor page)
    {
        page.Size(PageSizes.A4);
        page.MarginTop(10, Unit.Millimetre);
        page.MarginBottom(10, Unit.Millimetre);
        page.MarginLeft(12, Unit.Millimetre);
        page.MarginRight(12, Unit.Millimetre);
        page.PageColor(Colors.White);
        page.DefaultTextStyle(x => x.FontFamily("Segoe UI").FontSize(8.5f).FontColor(DarkTextColor));
    }

    private static void ComposeHeader(IContainer header, Quotation quotation, Tenant? tenant)
    {
        var (brandName, brandSubtitle, brandTagline) = ResolveBrandDetails(tenant);
        var companyName = $"{brandName} {brandSubtitle}".Trim();
        var address = !string.IsNullOrWhiteSpace(tenant?.Address) ? tenant.Address : "Hyderabad, Telangana";
        var phone = !string.IsNullOrWhiteSpace(tenant?.Phone) ? tenant.Phone : "+91 9876543210";
        var email = !string.IsNullOrWhiteSpace(tenant?.CompanyEmail) ? tenant.CompanyEmail : "info@acmetech.com";
        var taxId = !string.IsNullOrWhiteSpace(tenant?.TaxId) ? tenant.TaxId : "GSTIN12345";
        const string website = "https://www.pirnav.com/";

        header.Column(col =>
        {
            // 1. Stylized Brand Header with 112-degree angled diagonal ribbon and beige contact zone
            col.Item().PaddingBottom(8).Height(85).Layers(layers =>
            {
                // Background Layer: SVG with left white, middle diagonal orange stripe, right sample beige
                const string headerBgSvg =
                    "<svg viewBox=\"0 0 527 85\" width=\"527\" height=\"85\" xmlns=\"http://www.w3.org/2000/svg\" preserveAspectRatio=\"none\">" +
                    "  <polygon points=\"0,0 250,0 216,85 0,85\" fill=\"#FFFFFF\"/>" +
                    "  <polygon points=\"250,0 274,0 240,85 216,85\" fill=\"#C4693A\"/>" +
                    "  <polygon points=\"274,0 527,0 527,85 240,85\" fill=\"#F3E7D7\"/>" +
                    "  <line x1=\"0\" y1=\"84.5\" x2=\"527\" y2=\"84.5\" stroke=\"#C4693A\" stroke-width=\"1\"/>" +
                    "</svg>";

                layers.Layer().Svg(headerBgSvg);

                // Foreground Content Layer
                layers.PrimaryLayer().PaddingVertical(6).PaddingHorizontal(8).Row(row =>
                {
                    // Left Brand Block
                    row.ConstantItem(210).Row(leftRow =>
                    {
                        var initial = !string.IsNullOrWhiteSpace(brandName) ? brandName[0].ToString().ToUpperInvariant() : "A";

                        leftRow.ConstantItem(46).Height(46).Background("#F5EBE1").Border(1).BorderColor(BorderLineColor).AlignCenter().AlignMiddle()
                            .Text(initial).FontSize(24).Bold().FontColor(TerracottaOrange);

                        leftRow.RelativeItem().PaddingLeft(10).Column(brandCol =>
                        {
                            brandCol.Item().Text(brandName).FontSize(17).Bold().FontColor(DarkTextColor);
                            brandCol.Item().Text(brandSubtitle).FontSize(9).Bold().LetterSpacing(0.25f).FontColor(DarkTextColor);
                            brandCol.Item().PaddingTop(3).Text(brandTagline).FontSize(7.2f).FontColor(MutedTextColor);
                        });
                    });

                    // Spacer across the diagonal slant
                    row.ConstantItem(60);

                    // Right Contact Card (over the beige polygon)
                    row.RelativeItem().PaddingLeft(6).Column(contactCol =>
                    {
                        contactCol.Item().Text(companyName).FontSize(9.5f).Bold().FontColor(DarkTextColor);
                        contactCol.Item().Text($"●  {address}").FontSize(7.8f).FontColor(DarkTextColor);
                        contactCol.Item().Text($"☎  Ph: {phone}").FontSize(7.8f).FontColor(DarkTextColor);
                        contactCol.Item().Text($"✉  Email: {email}").FontSize(7.8f).FontColor(DarkTextColor);
                        contactCol.Item().Text($"▣  GSTIN: {taxId}").FontSize(7.8f).FontColor(DarkTextColor);
                        contactCol.Item().Text($"◎  {website}").FontSize(7.8f).FontColor(DarkTextColor);
                    });
                });
            });

            // 2. Title, Barcode & Quotation Meta Row
            col.Item().PaddingVertical(6).Row(titleRow =>
            {
                // Title
                titleRow.RelativeItem().Column(c =>
                {
                    c.Item().Text("QUOTATION").FontSize(20).ExtraBold().FontColor(PrimaryBrown);
                    c.Item().Text("Quality Products | Best Prices | Trusted Always").FontSize(7.5f).FontColor(MutedTextColor);
                });

                // Barcode Box
                titleRow.ConstantItem(155).Border(0.6f).BorderColor("#C4693A").Background("#FFFFFF").Padding(4).Column(barcodeCol =>
                {
                    barcodeCol.Item().AlignCenter().Element(c => RenderBarcodeLines(c, quotation.QuoteNumber, TerracottaOrange));
                    barcodeCol.Item().PaddingTop(2).AlignCenter().Text(quotation.QuoteNumber).FontSize(7.5f).Bold().FontColor(DarkTextColor);
                });

                // Meta Box (with plenty of width to guarantee single-line fit)
                titleRow.ConstantItem(165).PaddingLeft(8).Border(0.6f).BorderColor(BorderLineColor).Background("#F7FBFF").Padding(6).Column(metaCol =>
                {
                    metaCol.Item().Row(r =>
                    {
                        r.ConstantItem(65).Text("Quotation No").FontSize(7.5f).FontColor(MutedTextColor);
                        r.ConstantItem(8).Text(":").FontSize(7.5f);
                        r.RelativeItem().AlignRight().Text(quotation.QuoteNumber).FontSize(7.5f).Bold().FontColor(DarkTextColor);
                    });
                    metaCol.Item().Row(r =>
                    {
                        r.ConstantItem(65).Text("Quotation Date").FontSize(7.5f).FontColor(MutedTextColor);
                        r.ConstantItem(8).Text(":").FontSize(7.5f);
                        r.RelativeItem().AlignRight().Text(quotation.QuotationDate.ToString("dd-MM-yyyy")).FontSize(7.5f).Bold().FontColor(DarkTextColor);
                    });
                    if (quotation.ValidUntil > DateTime.MinValue)
                    {
                        metaCol.Item().Row(r =>
                        {
                            r.ConstantItem(65).Text("Valid Until").FontSize(7.5f).FontColor(MutedTextColor);
                            r.ConstantItem(8).Text(":").FontSize(7.5f);
                            r.RelativeItem().AlignRight().Text(quotation.ValidUntil.ToString("dd-MM-yyyy")).FontSize(7.5f).Bold().FontColor(DarkTextColor);
                        });
                    }
                });
            });
        });
    }

    private static void ComposeContent(IContainer content, Quotation quotation, Tenant? tenant)
    {
        var (brandName, _, _) = ResolveBrandDetails(tenant);
        var customer = quotation.Customer;
        var customerName = customer?.Name ?? "Customer";

        var addressParts = new List<string>();
        if (!string.IsNullOrWhiteSpace(customer?.Address)) addressParts.Add(customer.Address.Trim());
        if (!string.IsNullOrWhiteSpace(customer?.City)) addressParts.Add(customer.City.Trim());
        if (!string.IsNullOrWhiteSpace(customer?.State)) addressParts.Add(customer.State.Trim());
        if (!string.IsNullOrWhiteSpace(customer?.PostalCode)) addressParts.Add(customer.PostalCode.Trim());
        if (!string.IsNullOrWhiteSpace(customer?.Country)) addressParts.Add(customer.Country.Trim());
        var billingAddress = string.Join(", ", addressParts);

        var customerTaxId = !string.IsNullOrWhiteSpace(customer?.TaxId) ? customer.TaxId : "—";
        var customerPhone = !string.IsNullOrWhiteSpace(customer?.Phone) ? customer.Phone : "—";
        var customerEmail = !string.IsNullOrWhiteSpace(customer?.Email) ? customer.Email : "—";

        content.Column(col =>
        {
            // Bill To Box (Matching Image 2 clean card design)
            col.Item().PaddingBottom(10).Border(0.6f).BorderColor(BorderLineColor).Padding(8).Column(c =>
            {
                c.Item().Row(r =>
                {
                    r.ConstantItem(16).Text("👤").FontSize(9).FontColor(PrimaryBrown);
                    r.RelativeItem().Text("Bill To").FontSize(9.5f).Bold().FontColor(PrimaryBrown);
                });

                c.Item().PaddingTop(4).Text(customerName).FontSize(11).Bold().FontColor(DarkTextColor);
                if (!string.IsNullOrWhiteSpace(billingAddress))
                {
                    c.Item().PaddingTop(1).Text(billingAddress).FontSize(8f).FontColor(DarkTextColor);
                }
                c.Item().PaddingTop(3).Row(r =>
                {
                    r.ConstantItem(55).Text("GSTIN").FontSize(8f).FontColor(MutedTextColor);
                    r.RelativeItem().Text(customerTaxId).FontSize(8f).Bold().FontColor(DarkTextColor);
                });
                c.Item().Row(r =>
                {
                    r.ConstantItem(55).Text("Mobile").FontSize(8f).FontColor(MutedTextColor);
                    r.RelativeItem().Text(customerPhone).FontSize(8f).Bold().FontColor(DarkTextColor);
                });
                c.Item().Row(r =>
                {
                    r.ConstantItem(55).Text("Email").FontSize(8f).FontColor(MutedTextColor);
                    r.RelativeItem().Text(customerEmail).FontSize(8f).Bold().FontColor(DarkTextColor);
                });
            });

            // Items Table
            col.Item().PaddingBottom(10).Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    columns.ConstantColumn(28); // No.
                    columns.RelativeColumn(3);  // Item Description
                    columns.ConstantColumn(42); // Qty
                    columns.ConstantColumn(75); // Unit Price
                    columns.ConstantColumn(68); // Discount
                    columns.ConstantColumn(52); // Tax (%)
                    columns.ConstantColumn(78); // Amount
                });

                table.Header(h =>
                {
                    h.Cell().Element(HeaderStyle).AlignCenter().Text("No.");
                    h.Cell().Element(HeaderStyle).Text("Item Description");
                    h.Cell().Element(HeaderStyle).AlignCenter().Text("Qty");
                    h.Cell().Element(HeaderStyle).AlignRight().Text("Unit Price (Rs)");
                    h.Cell().Element(HeaderStyle).AlignRight().Text("Discount (Rs)");
                    h.Cell().Element(HeaderStyle).AlignCenter().Text("Tax (%)");
                    h.Cell().Element(HeaderStyle).AlignRight().Text("Amount (Rs)");
                });

                var index = 1;
                foreach (var item in quotation.Items)
                {
                    var isEven = index % 2 == 0;
                    var rowBg = isEven ? CreamBackground : "#FFFFFF";

                    table.Cell().Element(c => RowStyle(c, rowBg)).AlignCenter().Text(index.ToString());
                    table.Cell().Element(c => RowStyle(c, rowBg)).Column(descCol =>
                    {
                        var productName = item.Product?.Name ?? item.Description;
                        descCol.Item().Text(productName).FontSize(8.5f).Bold();
                        if (!string.IsNullOrWhiteSpace(item.Description) && !string.Equals(productName, item.Description, StringComparison.OrdinalIgnoreCase))
                        {
                            descCol.Item().Text(item.Description).FontSize(7.5f).FontColor(MutedTextColor);
                        }
                    });
                    table.Cell().Element(c => RowStyle(c, rowBg)).AlignCenter().Text(item.Quantity.ToString("0.####"));
                    table.Cell().Element(c => RowStyle(c, rowBg)).AlignRight().Text(item.UnitPrice.ToString("N2"));
                    table.Cell().Element(c => RowStyle(c, rowBg)).AlignRight().Text(item.DiscountAmount.ToString("N2"));
                    var taxLabel = item.TaxRate.HasValue && item.TaxRate.Value > 0 ? $"{item.TaxRate.Value:0.#}%" : (string.IsNullOrWhiteSpace(item.TaxType) ? "0%" : item.TaxType);
                    table.Cell().Element(c => RowStyle(c, rowBg)).AlignCenter().Text(taxLabel);
                    table.Cell().Element(c => RowStyle(c, rowBg)).AlignRight().Text(item.TotalAmount.ToString("N2")).Bold();

                    index++;
                }

                static IContainer HeaderStyle(IContainer container) =>
                    container.Background(SampleBeige).BorderBottom(1).BorderColor(TerracottaOrange).PaddingVertical(5).PaddingHorizontal(4)
                        .DefaultTextStyle(t => t.FontSize(8f).Bold().FontColor(PrimaryBrown));

                static IContainer RowStyle(IContainer container, string bgColor) =>
                    container.Background(bgColor).BorderBottom(0.5f).BorderColor("#E8DDD5").PaddingVertical(4).PaddingHorizontal(4);
            });

            // Summary & Totals Box
            col.Item().PaddingBottom(10).AlignRight().Width(260).Border(0.5f).BorderColor(BorderLineColor).Background(CreamBackground).Column(summary =>
            {
                var taxable = Math.Max(0, quotation.Subtotal - quotation.DiscountAmount);

                SummaryRow(summary, "Sub Total", quotation.Subtotal.ToString("N2"));
                SummaryRow(summary, "Total Discount", quotation.DiscountAmount.ToString("N2"));
                SummaryRow(summary, "Taxable Amount", taxable.ToString("N2"));
                SummaryRow(summary, "Tax (GST)", quotation.TaxAmount.ToString("N2"));

                if (quotation.ChargesAmount > 0)
                {
                    SummaryRow(summary, "Additional Charges", quotation.ChargesAmount.ToString("N2"));
                }

                // Grand Total
                summary.Item().Background(SampleBeige).BorderTop(1).BorderBottom(1).BorderColor(TerracottaOrange).PaddingVertical(4).PaddingHorizontal(8).Row(r =>
                {
                    r.RelativeItem().Text("Total Payable").FontSize(9.5f).Bold().FontColor(PrimaryBrown);
                    r.ConstantItem(110).AlignRight().Text($"Rs {quotation.TotalAmount:N2}").FontSize(11f).Bold().FontColor(PrimaryBrown);
                });

                // Amount in Words
                summary.Item().Padding(6).Column(w =>
                {
                    w.Item().Text("Amount in Words:").FontSize(7.5f).Bold().FontColor(PrimaryBrown);
                    w.Item().Text(FormatAmountInWords(quotation.TotalAmount)).FontSize(7.5f).Italic().FontColor(DarkTextColor);
                });
            });

            // Terms & Conditions and Signature Section
            col.Item().Row(row =>
            {
                // Terms
                row.RelativeItem(3).Border(0.5f).BorderColor(BorderLineColor).Padding(6).Column(termsCol =>
                {
                    termsCol.Item().Text("Terms & Conditions").FontSize(8f).Bold().FontColor(PrimaryBrown);

                    if (!string.IsNullOrWhiteSpace(quotation.TermsAndConditions))
                    {
                        termsCol.Item().PaddingTop(3).Text(quotation.TermsAndConditions).FontSize(7.5f).FontColor(DarkTextColor);
                    }
                    else
                    {
                        termsCol.Item().PaddingTop(2).Text("1. Goods once sold are subject to store policy.").FontSize(7.2f).FontColor(MutedTextColor);
                        termsCol.Item().Text("2. Please check quantity and products before leaving the store.").FontSize(7.2f).FontColor(MutedTextColor);
                        termsCol.Item().Text("3. GST is applicable as per product category.").FontSize(7.2f).FontColor(MutedTextColor);
                        termsCol.Item().Text("4. Keep this quotation for future reference and orders.").FontSize(7.2f).FontColor(MutedTextColor);
                        termsCol.Item().Text("5. No exchange or refund on opened products.").FontSize(7.2f).FontColor(MutedTextColor);
                    }

                    if (!string.IsNullOrWhiteSpace(quotation.Notes))
                    {
                        termsCol.Item().PaddingTop(4).Text($"Notes: {quotation.Notes}").FontSize(7.2f).Italic().FontColor(DarkTextColor);
                    }
                });

                // Signature Box
                row.ConstantItem(170).PaddingLeft(10).Border(0.5f).BorderColor(BorderLineColor).Padding(6).Column(signCol =>
                {
                    signCol.Item().AlignCenter().Text($"For {brandName} STORE").FontSize(8f).Bold().FontColor(PrimaryBrown);
                    signCol.Item().Height(34); // Space for authorized signature
                    signCol.Item().LineHorizontal(0.5f).LineColor("#A0A0A0");
                    signCol.Item().PaddingTop(2).AlignCenter().Text("Authorized Signatory").FontSize(7.5f).FontColor(MutedTextColor);
                });
            });
        });
    }

    private static void ComposeFooter(IContainer footer, Quotation quotation, Tenant? tenant)
    {
        var (brandName, _, _) = ResolveBrandDetails(tenant);
        var initial = !string.IsNullOrWhiteSpace(brandName) ? brandName[0].ToString().ToUpperInvariant() : "A";

        footer.Column(col =>
        {
            col.Item().Background(SampleBeige).BorderTop(1).BorderBottom(3).BorderColor(TerracottaOrange).PaddingVertical(4).PaddingHorizontal(8).Row(r =>
            {
                r.RelativeItem(2).Row(brandRow =>
                {
                    brandRow.ConstantItem(18).Height(18).Background("#F5EBE1").Border(0.5f).BorderColor(BorderLineColor).AlignCenter().AlignMiddle()
                        .Text(initial).FontSize(10).Bold().FontColor(TerracottaOrange);

                    brandRow.RelativeItem().PaddingLeft(6).Column(bc =>
                    {
                        bc.Item().Text($"{brandName} STORE").FontSize(8f).Bold().FontColor(DarkTextColor);
                    });
                });

                r.RelativeItem(2).AlignCenter().Text("★ Wholesale Prices").FontSize(7.5f).FontColor(DarkTextColor);
                r.RelativeItem(2).AlignCenter().Text("★ Quality Products").FontSize(7.5f).FontColor(DarkTextColor);
                r.RelativeItem(2).AlignCenter().Text("★ Bulk Purchasing").FontSize(7.5f).FontColor(DarkTextColor);
                r.RelativeItem(2).AlignRight().Text("Thank You for shopping with us!").FontSize(7.5f).Bold().Italic().FontColor(PrimaryBrown);
            });
        });
    }

    private static void SummaryRow(ColumnDescriptor col, string label, string value)
    {
        col.Item().PaddingVertical(2).PaddingHorizontal(8).Row(r =>
        {
            r.RelativeItem().Text(label).FontSize(8f).FontColor(MutedTextColor);
            r.ConstantItem(90).AlignRight().Text($"Rs {value}").FontSize(8f).FontColor(DarkTextColor);
        });
    }

    private static (string BrandName, string Subtitle, string Tagline) ResolveBrandDetails(Tenant? tenant)
    {
        var rawName = !string.IsNullOrWhiteSpace(tenant?.Name) ? tenant.Name : "Acme";
        var cleaned = rawName
            .Replace("technologies", "", StringComparison.OrdinalIgnoreCase)
            .Replace("STORE", "", StringComparison.OrdinalIgnoreCase)
            .Trim();

        var brand = string.IsNullOrWhiteSpace(cleaned) ? "Acme" : cleaned;
        return (brand, "STORE", "Wholesale * Retail * Bulk Supply");
    }

    private static void RenderBarcodeLines(IContainer container, string quoteNumber, string colorHex)
    {
        var pattern = CreateBarcodePattern(quoteNumber);

        container.Height(18).Row(row =>
        {
            var step = Math.Max(1, pattern.Length / 75);
            for (int i = 0; i < pattern.Length && i < 150; i += step)
            {
                if (pattern[i] == '1')
                    row.ConstantItem(1f).Background(colorHex);
                else
                    row.ConstantItem(1f);
            }
        });
    }

    private static string CreateBarcodePattern(string value)
    {
        var text = string.IsNullOrWhiteSpace(value) ? "QUOTATION" : value;
        var sb = new StringBuilder("101");
        foreach (var ch in text)
        {
            sb.Append(Convert.ToString(ch, 2).PadLeft(8, '0')).Append('0');
        }
        sb.Append("101");
        return sb.ToString();
    }

    private static string FormatAmountInWords(decimal amount)
    {
        var rounded = Math.Max(0, decimal.ToInt64(decimal.Truncate(amount)));
        return $"Rupees {IndianNumberWords(rounded)} Only";
    }

    private static string IndianNumberWords(long value)
    {
        if (value == 0) return "Zero";
        var ones = new[] { "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen" };
        var tens = new[] { "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety" };

        string BelowThousand(long n) => n switch
        {
            < 20 => ones[n],
            < 100 => tens[n / 10] + (n % 10 > 0 ? " " + ones[n % 10] : ""),
            _ => ones[n / 100] + " Hundred" + (n % 100 > 0 ? " " + BelowThousand(n % 100) : "")
        };

        string JoinPart(long n, long divisor, string unit) =>
            IndianNumberWords(n / divisor) + " " + unit + (n % divisor > 0 ? " " + IndianNumberWords(n % divisor) : "");

        return value >= 10_000_000 ? JoinPart(value, 10_000_000, "Crore")
             : value >= 100_000 ? JoinPart(value, 100_000, "Lakh")
             : value >= 1_000 ? JoinPart(value, 1_000, "Thousand")
             : BelowThousand(value);
    }
}
