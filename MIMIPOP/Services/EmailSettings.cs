namespace Mimipop.Services;

public sealed class EmailSettings(IConfiguration configuration, IWebHostEnvironment environment)
{
    public string? ResendApiKey => configuration["RESEND_API_KEY"];

    public string? Sender => configuration["EMAIL_FROM"];

    public Uri? PublicBaseUri
    {
        get
        {
            var value = configuration["PUBLIC_BASE_URL"]?.Trim();
            if (string.IsNullOrEmpty(value) ||
                !Uri.TryCreate(value, UriKind.Absolute, out var uri) ||
                (uri.Scheme != "https" &&
                    !(environment.IsDevelopment() && uri.Scheme == "http" && uri.IsLoopback)) ||
                !string.IsNullOrEmpty(uri.UserInfo) ||
                !string.IsNullOrEmpty(uri.Query) ||
                !string.IsNullOrEmpty(uri.Fragment))
            {
                return null;
            }

            var baseUrl = uri.AbsoluteUri.EndsWith("/", StringComparison.Ordinal)
                ? uri.AbsoluteUri
                : $"{uri.AbsoluteUri}/";
            return new Uri(baseUrl, UriKind.Absolute);
        }
    }

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(ResendApiKey) &&
        !string.IsNullOrWhiteSpace(Sender) &&
        PublicBaseUri is not null;
}
