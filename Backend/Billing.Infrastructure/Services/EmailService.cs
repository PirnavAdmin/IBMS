using MailKit.Net.Smtp;
using Microsoft.Extensions.Configuration;
using MimeKit;

namespace Billing.Infrastructure.Services;

public class EmailService
{
    private readonly IConfiguration _configuration;

    public EmailService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public async Task SendEmailAsync(string toEmail, string subject, string body)
    {
        var senderEmail = _configuration["EmailSettings:Email"] ?? "";
        var appPassword = _configuration["EmailSettings:AppPassword"] ?? "";

        var email = new MimeMessage();

        email.From.Add(MailboxAddress.Parse(senderEmail));
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

        await smtp.AuthenticateAsync(senderEmail, appPassword);
        await smtp.SendAsync(email);
        await smtp.DisconnectAsync(true);
    }
}
