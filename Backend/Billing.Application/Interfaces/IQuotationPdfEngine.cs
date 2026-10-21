using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

/// <summary>
/// Server-side rendering engine responsible for generating customer-facing Quotation PDF documents
/// matching the official quotation branding and visual template design.
/// </summary>
public interface IQuotationPdfEngine
{
    /// <summary>
    /// Renders a quotation into a production-grade PDF binary using the official quotation template.
    /// </summary>
    byte[] GenerateQuotationPdf(Quotation quotation, Tenant? tenant = null);
}
