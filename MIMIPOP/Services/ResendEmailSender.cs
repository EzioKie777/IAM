using System.Net.Http.Headers;
using System.Net.Http.Json;

namespace Mimipop.Services;

public sealed class ResendEmailSender(
    HttpClient httpClient,
    EmailSettings settings,
    ILogger<ResendEmailSender> logger) : IEmailSender
{
    public async Task SendAsync(
        string recipient,
        string subject,
        string htmlBody,
        string textBody,
        CancellationToken cancellationToken)
    {
        var apiKey = settings.ResendApiKey;
        var sender = settings.Sender;
        if (string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(sender))
        {
            throw new InvalidOperationException("Resend email delivery is not configured.");
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, "emails");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        request.Content = JsonContent.Create(new
        {
            from = sender,
            to = new[] { recipient },
            subject,
            html = htmlBody,
            text = textBody
        });

        try
        {
            using var response = await httpClient.SendAsync(request, cancellationToken);
            if (response.IsSuccessStatusCode)
            {
                return;
            }

            logger.LogError("Resend rejected an email with HTTP status {StatusCode}.", (int)response.StatusCode);
            throw new EmailDeliveryException("The email provider rejected the message.");
        }
        catch (HttpRequestException exception)
        {
            logger.LogError(exception, "The email provider could not be reached.");
            throw new EmailDeliveryException("The email provider could not be reached.", exception);
        }
        catch (OperationCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogError(exception, "The email provider request timed out.");
            throw new EmailDeliveryException("The email provider request timed out.", exception);
        }
    }
}

public sealed class EmailDeliveryException(string message, Exception? innerException = null)
    : Exception(message, innerException);
