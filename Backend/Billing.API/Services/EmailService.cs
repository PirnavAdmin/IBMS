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

        email.From.Add(
            MailboxAddress.Parse(
                _configuration["EmailSettings:Email"]
            )
        );

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
            _configuration["EmailSettings:Email"],
            _configuration["EmailSettings:AppPassword"]
        );

        await smtp.SendAsync(email);

        await smtp.DisconnectAsync(true);
    }
}