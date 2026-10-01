namespace Billing.Domain.Enums;

public enum PaymentMethod
{
    Cash = 1,
    BankTransfer = 2,
    UPI = 3,
    Card = 4,
    Cheque = 5,
    Gateway = 6,
    Custom = 7
}
