namespace Billing.Domain.Entities;

public class InvoiceCommunication
{
    public int Id { get; set; }

    public int TenantId { get; set; } = 1;

    public int InvoiceId { get; set; }
    public Invoice? Invoice { get; set; }

    public string CommunicationType { get; set; } = "Email";

    public string Recipient { get; set; } = string.Empty;

    public string Subject { get; set; } = string.Empty;

    public string Message { get; set; } = string.Empty;

    public string Status { get; set; } = "Sent";

    public DateTime SentAtUtc { get; set; } = DateTime.UtcNow;

    public string SentBy { get; set; } = string.Empty;
}
