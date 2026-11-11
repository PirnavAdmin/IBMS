namespace Billing.Contracts;

public class SendInvoiceRequest
{
    public bool? AllowPartialPayments { get; set; }
    public bool? IncludePayOnlineButton { get; set; }
}
