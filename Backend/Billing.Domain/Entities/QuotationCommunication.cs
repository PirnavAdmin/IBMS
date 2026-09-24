namespace Billing.Domain.Entities;

public class QuotationCommunication
{
    public int Id { get; set; }

    public int QuotationId { get; set; }
    public Quotation? Quotation { get; set; }

    public string CommunicationType { get; set; } = "Email";

    public string Recipient { get; set; } = string.Empty;

    public string Subject { get; set; } = string.Empty;

    public string Message { get; set; } = string.Empty;

    public string Status { get; set; } = "Sent";

    public DateTime SentAt { get; set; } = DateTime.UtcNow;

    public string SentBy { get; set; } = string.Empty;
}
