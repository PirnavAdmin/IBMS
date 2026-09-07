using Billing.Contracts;

namespace Billing.Application.Services;

public class LandingPageService
{
    public LandingPageResponse GetLandingPage()
    {
        return new LandingPageResponse
        {
            Title = "Billing Management System",
            Description = "Manage your invoices, customers and payments in one place.",
            WelcomeMessage = "Welcome to our platform"
        };
    }
}
