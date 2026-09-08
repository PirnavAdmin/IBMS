namespace Billing.Contracts;

public class CustomerDetailsDto
{
    public CustomerDto Customer { get; set; } = new();

    public CustomerAddressDto? BillingAddress { get; set; }

    public CustomerAddressDto? ShippingAddress { get; set; }

    public List<CustomerAddressDto> Addresses { get; set; } = new();

    public CustomerFinancialSummaryDto FinancialSummary { get; set; } = new();

    public List<CustomerInvoiceSummaryDto> Invoices { get; set; } = new();

    public List<CustomerPaymentSummaryDto> Payments { get; set; } = new();
}

public class CustomerFinancialSummaryDto
{
    public decimal TotalInvoiced { get; set; } = 0.00m;

    public decimal TotalPaid { get; set; } = 0.00m;

    public decimal OutstandingBalance { get; set; } = 0.00m;

    public decimal CreditLimit { get; set; } = 0.00m;

    public string Currency { get; set; } = "USD";

    public int TotalInvoicesCount { get; set; } = 0;

    public int OpenInvoicesCount { get; set; } = 0;

    public int OverdueInvoicesCount { get; set; } = 0;
}

public class CustomerInvoiceSummaryDto
{
    public int Id { get; set; }

    public string InvoiceNumber { get; set; } = string.Empty;

    public DateTime IssueDate { get; set; }

    public DateTime DueDate { get; set; }

    public decimal TotalAmount { get; set; }

    public decimal AmountPaid { get; set; }

    public decimal BalanceDue { get; set; }

    public string Status { get; set; } = "Draft";

    public string Currency { get; set; } = "USD";
}

public class CustomerPaymentSummaryDto
{
    public int Id { get; set; }

    public string PaymentNumber { get; set; } = string.Empty;

    public DateTime PaymentDate { get; set; }

    public decimal Amount { get; set; }

    public string PaymentMethod { get; set; } = string.Empty;

    public string ReferenceNumber { get; set; } = string.Empty;

    public string Status { get; set; } = "Completed";
}
