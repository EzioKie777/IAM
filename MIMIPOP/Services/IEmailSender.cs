namespace Mimipop.Services;

public interface IEmailSender
{
    Task SendAsync(
        string recipient,
        string subject,
        string htmlBody,
        string textBody,
        CancellationToken cancellationToken);
}
