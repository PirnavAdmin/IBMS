using System.ComponentModel.DataAnnotations;

namespace Billing.Contracts;

public class SendRegistrationOtpRequest
{
    [Required(ErrorMessage = "Email is required.")]
    [EmailAddress(ErrorMessage = "Please enter a valid email address.")]
    public string Email { get; set; } = string.Empty;
}

