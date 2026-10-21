using Billing.Contracts.InvoiceTemplate;

namespace Billing.Application.Interfaces;

/// <summary>
/// Server-side rendering engine responsible for generating customer-facing PDF documents
/// based on frozen invoice snapshots and template visual styling configurations.
/// </summary>
public interface IInvoicePdfEngine
{
    /// <summary>
    /// Renders a finalized invoice into a production-grade PDF binary using the immutable snapshot and template version.
    /// </summary>
    byte[] GenerateInvoicePdf(InvoiceSnapshotDto snapshot, TemplateVersionDto template);

    /// <summary>
    /// Renders a sample/representative invoice preview PDF binary based on live template configuration before activation.
    /// </summary>
    byte[] GeneratePreviewPdf(TemplatePreviewRequest request);
}
