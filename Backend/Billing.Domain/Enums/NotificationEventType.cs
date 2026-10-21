namespace Billing.Domain.Enums;

public enum NotificationEventType
{
    InvoiceIssued = 1,
    InvoiceSent = 2,
    PaymentReceived = 3,
    PaymentFailed = 4,
    InvoiceOverdue = 5,
    QuotationSent = 6,
    CreditNoteIssued = 7
}
