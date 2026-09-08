namespace Billing.Application.Common;

public class DuplicateCustomerCodeException : Exception
{
    public DuplicateCustomerCodeException(string message) : base(message) { }
    public DuplicateCustomerCodeException(string message, Exception innerException) : base(message, innerException) { }
}
