using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.RateLimiting;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Driver;

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddUserSecrets<Program>(optional: true);
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 32 * 1024);
var mongoUri = builder.Configuration["MONGODB_URI"];
if (string.IsNullOrWhiteSpace(mongoUri))
{
    throw new InvalidOperationException(
        "MONGODB_URI is not configured. Set it with .NET user-secrets for local development; see README.md.");
}

var mongoClient = new MongoClient(mongoUri);
var mongoDatabase = mongoClient.GetDatabase(builder.Configuration["MONGODB_DATABASE"] ?? "mimipop");
var users = mongoDatabase.GetCollection<UserAccount>("users");
var dummyPasswordHash = PasswordHasher.Hash(Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)));
await mongoDatabase.RunCommandAsync<BsonDocument>(new BsonDocument("ping", 1));
await users.Indexes.CreateOneAsync(new CreateIndexModel<UserAccount>(
    Builders<UserAccount>.IndexKeys.Ascending(user => user.Email),
    new CreateIndexOptions { Unique = true, Name = "unique_email" }));

var keyPath = builder.Configuration["DATA_PROTECTION_KEY_PATH"]
    ?? Path.Combine(builder.Environment.ContentRootPath, ".data-protection-keys");
Directory.CreateDirectory(keyPath);
builder.Services
    .AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(keyPath));

builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-CSRF-TOKEN";
    options.Cookie.Name = "MIMIPOP.Antiforgery";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
        ? CookieSecurePolicy.SameAsRequest
        : CookieSecurePolicy.Always;
});

builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "MIMIPOP.Auth";
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
            ? CookieSecurePolicy.SameAsRequest
            : CookieSecurePolicy.Always;
        options.SlidingExpiration = true;
        options.ExpireTimeSpan = TimeSpan.FromDays(14);
        options.Events.OnRedirectToLogin = context =>
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return Task.CompletedTask;
        };
        options.Events.OnRedirectToAccessDenied = context =>
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return Task.CompletedTask;
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, cancellationToken) =>
    {
        context.HttpContext.Response.ContentType = "application/problem+json";
        await context.HttpContext.Response.WriteAsJsonAsync(
            new { title = "Too many sign-in attempts. Please wait and try again." },
            cancellationToken);
    };
    options.AddPolicy("auth", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(15),
                QueueLimit = 0,
                AutoReplenishment = true
            }));
});
builder.Services.AddSingleton(users);

var app = builder.Build();
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}

app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.UseAntiforgery();
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/api/auth"))
    {
        context.Response.Headers.CacheControl = "no-store";
    }

    await next();
});

var indexPath = Path.Combine(AppContext.BaseDirectory, "index.html");
app.MapGet("/", () => Results.File(indexPath, "text/html; charset=utf-8"));
app.MapGet("/index.html", () => Results.File(indexPath, "text/html; charset=utf-8"));

app.MapGet("/api/auth/csrf", (HttpContext context, IAntiforgery antiforgery) =>
{
    var tokens = antiforgery.GetAndStoreTokens(context);
    return Results.Ok(new { token = tokens.RequestToken });
});

app.MapGet("/api/auth/me", GetCurrentUser).RequireAuthorization();
app.MapPost("/api/auth/register", Register).RequireRateLimiting("auth");
app.MapPost("/api/auth/login", Login).RequireRateLimiting("auth");
app.MapPost("/api/auth/logout", Logout).RequireRateLimiting("auth").RequireAuthorization();

app.Run();

IResult GetCurrentUser(ClaimsPrincipal principal)
{
    return Results.Ok(new
    {
        authenticated = true,
        email = principal.FindFirstValue(ClaimTypes.Email),
        name = principal.FindFirstValue(ClaimTypes.Name)
    });
}

async Task<IResult> Register(RegisterRequest request, HttpContext context, IAntiforgery antiforgery)
{
    if (!await HasValidAntiforgeryToken(context, antiforgery))
    {
        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Refresh the page and try again.");
    }

    var name = request.Name?.Trim();
    var email = NormalizeEmail(request.Email);
    if (string.IsNullOrWhiteSpace(name) || name.Length > 60)
    {
        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Enter a display name up to 60 characters.");
    }

    if (!IsValidEmail(email))
    {
        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Enter a valid email address.");
    }

    if (string.IsNullOrEmpty(request.Password) || request.Password.Length < 12 || request.Password.Length > 128)
    {
        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Use a password between 12 and 128 characters.");
    }

    var user = new UserAccount
    {
        Email = email,
        Name = name,
        PasswordHash = PasswordHasher.Hash(request.Password),
        CreatedAt = DateTime.UtcNow
    };

    try
    {
        await users.InsertOneAsync(user, cancellationToken: context.RequestAborted);
    }
    catch (MongoWriteException exception) when (exception.WriteError?.Category == ServerErrorCategory.DuplicateKey)
    {
        return Results.Problem(statusCode: StatusCodes.Status409Conflict, title: "An account with that email already exists.");
    }

    await SignIn(context, user, request.RememberMe);
    return Results.Ok(new { authenticated = true, email = user.Email, name = user.Name });
}

async Task<IResult> Login(LoginRequest request, HttpContext context, IAntiforgery antiforgery)
{
    if (!await HasValidAntiforgeryToken(context, antiforgery))
    {
        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Refresh the page and try again.");
    }

    var email = NormalizeEmail(request.Email);
    if (!IsValidEmail(email) || string.IsNullOrEmpty(request.Password) || request.Password.Length > 128)
    {
        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Enter your email and password.");
    }

    var user = await users.Find(account => account.Email == email)
        .FirstOrDefaultAsync(context.RequestAborted);
    var passwordHash = user?.PasswordHash ?? dummyPasswordHash;
    var passwordIsValid = PasswordHasher.Verify(request.Password, passwordHash);
    if (user is null || !passwordIsValid)
    {
        return Results.Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Email or password is incorrect.");
    }

    await SignIn(context, user, request.RememberMe);
    return Results.Ok(new { authenticated = true, email = user.Email, name = user.Name });
}

async Task<IResult> Logout(HttpContext context, IAntiforgery antiforgery)
{
    if (!await HasValidAntiforgeryToken(context, antiforgery))
    {
        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Refresh the page and try again.");
    }

    await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    return Results.NoContent();
}

async Task SignIn(HttpContext context, UserAccount user, bool rememberMe)
{
    var identity = new ClaimsIdentity(
    [
        new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
        new Claim(ClaimTypes.Name, user.Name),
        new Claim(ClaimTypes.Email, user.Email)
    ],
    CookieAuthenticationDefaults.AuthenticationScheme);

    await context.SignInAsync(
        CookieAuthenticationDefaults.AuthenticationScheme,
        new ClaimsPrincipal(identity),
        new AuthenticationProperties
        {
            IsPersistent = rememberMe,
            ExpiresUtc = rememberMe ? DateTimeOffset.UtcNow.AddDays(14) : null,
            AllowRefresh = true
        });
}

static async Task<bool> HasValidAntiforgeryToken(HttpContext context, IAntiforgery antiforgery)
{
    try
    {
        await antiforgery.ValidateRequestAsync(context);
        return true;
    }
    catch (AntiforgeryValidationException)
    {
        return false;
    }
}

static string NormalizeEmail(string? email) => email?.Trim().ToLowerInvariant() ?? string.Empty;

static bool IsValidEmail(string email) =>
    email.Length <= 254 &&
    Regex.IsMatch(email, @"^[^@\s]+@[^@\s]+\.[^@\s]+$", RegexOptions.CultureInvariant);

public sealed record RegisterRequest(string? Name, string? Email, string? Password, bool RememberMe);
public sealed record LoginRequest(string? Email, string? Password, bool RememberMe);

public sealed class UserAccount
{
    [BsonId]
    public ObjectId Id { get; set; } = ObjectId.GenerateNewId();

    [BsonElement("email")]
    public string Email { get; set; } = string.Empty;

    [BsonElement("name")]
    public string Name { get; set; } = string.Empty;

    [BsonElement("passwordHash")]
    public string PasswordHash { get; set; } = string.Empty;

    [BsonElement("createdAt")]
    public DateTime CreatedAt { get; set; }
}

public static class PasswordHasher
{
    private const int Iterations = 600_000;
    private const int SaltSize = 16;
    private const int HashSize = 32;

    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, HashSize);
        return $"pbkdf2-sha256${Iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
    }

    public static bool Verify(string password, string encodedHash)
    {
        var parts = encodedHash.Split('$');
        if (parts.Length != 4 ||
            parts[0] != "pbkdf2-sha256" ||
            !int.TryParse(parts[1], out var iterations) ||
            iterations < 100_000 ||
            iterations > 1_000_000)
        {
            return false;
        }

        try
        {
            var salt = Convert.FromBase64String(parts[2]);
            var expectedHash = Convert.FromBase64String(parts[3]);
            if (salt.Length != SaltSize || expectedHash.Length != HashSize)
            {
                return false;
            }

            var actualHash = Rfc2898DeriveBytes.Pbkdf2(
                password, salt, iterations, HashAlgorithmName.SHA256, expectedHash.Length);
            return CryptographicOperations.FixedTimeEquals(actualHash, expectedHash);
        }
        catch (FormatException)
        {
            return false;
        }
    }
}
