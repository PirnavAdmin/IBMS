using MailKit.Net.Smtp;
using MimeKit;

namespace Billing.API.Services;

public class EmailService
{
    private readonly IConfiguration _configuration;

    public EmailService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public async Task SendEmailAsync(string toEmail, string subject, string body)
    {
        var email = new MimeMessage();

        var fromEmail = _configuration["EmailSettings:Email"] 
            ?? throw new InvalidOperationException("EmailSettings:Email is not configured.");
        var appPassword = _configuration["EmailSettings:AppPassword"] 
            ?? throw new InvalidOperationException("EmailSettings:AppPassword is not configured.");

        email.From.Add(MailboxAddress.Parse(fromEmail));

        email.To.Add(MailboxAddress.Parse(toEmail));

        email.Subject = subject;

        email.Body = new TextPart("plain")
        {
            Text = body
        };

        using var smtp = new SmtpClient();

        await smtp.ConnectAsync(
            "smtp.gmail.com",
            587,
            MailKit.Security.SecureSocketOptions.StartTls
        );

        await smtp.AuthenticateAsync(
            fromEmail,
            appPassword
        );

        await smtp.SendAsync(email);

        await smtp.DisconnectAsync(true);
    }
}