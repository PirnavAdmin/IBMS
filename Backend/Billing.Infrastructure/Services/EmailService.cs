using MailKit.Net.Smtp;
using Microsoft.Extensions.Configuration;
using MimeKit;
using Billing.Application.Interfaces;
using System.IO;

namespace Billing.Infrastructure.Services;

public class EmailService : IEmailService
{
    private readonly IConfiguration _configuration;

    public EmailService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public async Task SendEmailAsync(string toEmail, string subject, string body, byte[]? attachmentBytes = null, string? attachmentName = null)
    {
        var email = new MimeMessage();

        var fromEmail = _configuration["EmailSettings:Email"] 
            ?? throw new InvalidOperationException("EmailSettings:Email is not configured.");
        var appPassword = _configuration["EmailSettings:AppPassword"] 
            ?? throw new InvalidOperationException("EmailSettings:AppPassword is not configured.");

        email.From.Add(MailboxAddress.Parse(fromEmail));
        email.To.Add(MailboxAddress.Parse(toEmail));
        email.Subject = subject;

        var builder = new BodyBuilder { TextBody = body };

        if (attachmentBytes != null && !string.IsNullOrWhiteSpace(attachmentName))
        {
            builder.Attachments.Add(attachmentName, attachmentBytes, ContentType.Parse("application/pdf"));
        }

        email.Body = builder.ToMessageBody();

        using var smtp = new SmtpClient();

        await smtp.ConnectAsync(
            "smtp.gmail.com",
            587,
            MailKit.Security.SecureSocketOptions.StartTls
        );

        await smtp.AuthenticateAsync(fromEmail, appPassword);
        await smtp.SendAsync(email);
        await smtp.DisconnectAsync(true);
    }
}
