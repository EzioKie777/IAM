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
var friendships = mongoDatabase.GetCollection<Friendship>("friendships");
var dummyPasswordHash = PasswordHasher.Hash(Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)));
await mongoDatabase.RunCommandAsync<BsonDocument>(new BsonDocument("ping", 1));
await users.Indexes.CreateOneAsync(new CreateIndexModel<UserAccount>(
    Builders<UserAccount>.IndexKeys.Ascending(user => user.Email),
    new CreateIndexOptions { Unique = true, Name = "unique_email" }));
await friendships.Indexes.CreateOneAsync(new CreateIndexModel<Friendship>(
    Builders<Friendship>.IndexKeys.Ascending(friendship => friendship.UserLowId)
        .Ascending(friendship => friendship.UserHighId),
    new CreateIndexOptions { Unique = true, Name = "unique_friendship_pair" }));

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
    options.AddPolicy("social", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 30,
                Window = TimeSpan.FromMinutes(15),
                QueueLimit = 0,
                AutoReplenishment = true
            }));
});
builder.Services.AddSingleton(users);
builder.Services.AddSingleton(friendships);

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
    if (context.Request.Path.StartsWithSegments("/api"))
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
app.MapGet("/api/profile", GetProfile).RequireAuthorization().RequireRateLimiting("social");
app.MapPut("/api/profile", UpdateProfile).RequireAuthorization().RequireRateLimiting("auth");
app.MapGet("/api/friends", GetFriends).RequireAuthorization().RequireRateLimiting("social");
app.MapPost("/api/friends/search", SearchFriend).RequireAuthorization().RequireRateLimiting("social");
app.MapPost("/api/friends/requests", SendFriendRequest).RequireAuthorization().RequireRateLimiting("social");
app.MapPost("/api/friends/requests/{requestId}/{action}", RespondToFriendRequest)
    .RequireAuthorization().RequireRateLimiting("social");
app.MapDelete("/api/friends/{friendId}", RemoveFriend).RequireAuthorization().RequireRateLimiting("social");

app.Run();

async Task<IResult> GetCurrentUser(ClaimsPrincipal principal, CancellationToken cancellationToken)
{
    if (!TryGetUserId(principal, out var userId))
    {
        return Results.Unauthorized();
    }

    var user = await users.Find(account => account.Id == userId).FirstOrDefaultAsync(cancellationToken);
    return user is null ? Results.Unauthorized() : Results.Ok(ToAccountResponse(user));
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
        CreatedAt = DateTime.UtcNow,
        Avatar = "✨",
        Bio = string.Empty,
        FavoriteGame = string.Empty,
        Country = string.Empty
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
    return Results.Ok(ToAccountResponse(user));
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
    return Results.Ok(ToAccountResponse(user));
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

async Task<IResult> GetProfile(ClaimsPrincipal principal, CancellationToken cancellationToken)
{
    if (!TryGetUserId(principal, out var userId))
    {
        return Results.Unauthorized();
    }

    var user = await users.Find(account => account.Id == userId).FirstOrDefaultAsync(cancellationToken);
    return user is null ? Results.Unauthorized() : Results.Ok(ToProfileResponse(user));
}

async Task<IResult> UpdateProfile(
    ProfileUpdateRequest request,
    ClaimsPrincipal principal,
    HttpContext context,
    IAntiforgery antiforgery,
    CancellationToken cancellationToken)
{
    if (!await HasValidAntiforgeryToken(context, antiforgery))
    {
        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Refresh the page and try again.");
    }

    if (!TryGetUserId(principal, out var userId))
    {
        return Results.Unauthorized();
    }

    var name = request.Name?.Trim();
    var avatar = request.Avatar?.Trim();
    var bio = request.Bio?.Trim();
    var favoriteGame = request.FavoriteGame?.Trim();
    var country = request.Country?.Trim();
    if (string.IsNullOrWhiteSpace(name) || name.Length > 60)
    {
        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Display name must be between 1 and 60 characters.");
    }

    if (!ProfileOptions.Avatars.Contains(avatar, StringComparer.Ordinal))
    {
        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Choose an available avatar.");
    }

    if (bio is null || bio.Length > 180)
    {
        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Bio must be 180 characters or fewer.");
    }

    if (favoriteGame is null || !ProfileOptions.FavoriteGames.Contains(favoriteGame, StringComparer.Ordinal))
    {
        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Choose an available favorite game.");
    }

    if (country is null || country.Length > 56)
    {
        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Country must be 56 characters or fewer.");
    }

    var update = Builders<UserAccount>.Update
        .Set(user => user.Name, name)
        .Set(user => user.Avatar, avatar)
        .Set(user => user.Bio, bio)
        .Set(user => user.FavoriteGame, favoriteGame)
        .Set(user => user.Country, country);
    var result = await users.UpdateOneAsync(account => account.Id == userId, update, cancellationToken: cancellationToken);
    if (result.MatchedCount == 0)
    {
        return Results.Unauthorized();
    }

    var updatedUser = await users.Find(account => account.Id == userId).FirstOrDefaultAsync(cancellationToken);
    return updatedUser is null ? Results.Unauthorized() : Results.Ok(ToProfileResponse(updatedUser));
}

async Task<IResult> SearchFriend(
    FriendRequestCreate request,
    ClaimsPrincipal principal,
    HttpContext context,
    IAntiforgery antiforgery,
    CancellationToken cancellationToken)
{
    if (!await HasValidAntiforgeryToken(context, antiforgery))
    {
        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Refresh the page and try again.");
    }

    if (!TryGetUserId(principal, out var userId))
    {
        return Results.Unauthorized();
    }

    var normalizedEmail = NormalizeEmail(request.Email);
    if (!IsValidEmail(normalizedEmail))
    {
        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Enter a valid email address.");
    }

    var target = await users.Find(user => user.Email == normalizedEmail).FirstOrDefaultAsync(cancellationToken);
    if (target is null || target.Id == userId)
    {
        return Results.NotFound(new { title = "No other MIMIPOP member was found with that email." });
    }

    var (lowId, highId) = OrderIds(userId, target.Id);
    var friendship = await friendships.Find(item => item.UserLowId == lowId && item.UserHighId == highId)
        .FirstOrDefaultAsync(cancellationToken);
    return Results.Ok(new
    {
        target = ToPublicProfile(target),
        relationship = GetRelationship(friendship, userId)
    });
}

async Task<IResult> SendFriendRequest(
    FriendRequestCreate request,
    ClaimsPrincipal principal,
    HttpContext context,
    IAntiforgery antiforgery,
    CancellationToken cancellationToken)
{
    if (!await HasValidAntiforgeryToken(context, antiforgery))
    {
        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Refresh the page and try again.");
    }

    if (!TryGetUserId(principal, out var userId))
    {
        return Results.Unauthorized();
    }

    var email = NormalizeEmail(request.Email);
    if (!IsValidEmail(email))
    {
        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Enter a valid email address.");
    }

    var target = await users.Find(user => user.Email == email).FirstOrDefaultAsync(cancellationToken);
    if (target is null || target.Id == userId)
    {
        return Results.NotFound(new { title = "No other MIMIPOP member was found with that email." });
    }

    var (lowId, highId) = OrderIds(userId, target.Id);
    var existing = await friendships.Find(item => item.UserLowId == lowId && item.UserHighId == highId)
        .FirstOrDefaultAsync(cancellationToken);
    if (existing is not null)
    {
        return Results.Conflict(new { title = "A friend request or friendship already exists." });
    }

    try
    {
        await friendships.InsertOneAsync(new Friendship
        {
            UserLowId = lowId,
            UserHighId = highId,
            RequestedBy = userId,
            Status = FriendshipStatus.Pending,
            CreatedAt = DateTime.UtcNow
        }, cancellationToken: cancellationToken);
    }
    catch (MongoWriteException exception) when (exception.WriteError?.Category == ServerErrorCategory.DuplicateKey)
    {
        return Results.Conflict(new { title = "A friend request or friendship already exists." });
    }

    return Results.Ok(new { relationship = "outgoing" });
}

async Task<IResult> RespondToFriendRequest(
    string requestId,
    string action,
    ClaimsPrincipal principal,
    HttpContext context,
    IAntiforgery antiforgery,
    CancellationToken cancellationToken)
{
    if (!await HasValidAntiforgeryToken(context, antiforgery))
    {
        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Refresh the page and try again.");
    }

    if (!TryGetUserId(principal, out var userId))
    {
        return Results.Unauthorized();
    }

    if (!ObjectId.TryParse(requestId, out var friendshipId) ||
        action is not ("accept" or "decline" or "cancel"))
    {
        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Invalid friend request action.");
    }

    var friendship = await friendships.Find(item => item.Id == friendshipId).FirstOrDefaultAsync(cancellationToken);
    if (friendship is null || friendship.Status != FriendshipStatus.Pending)
    {
        return Results.NotFound(new { title = "That pending friend request no longer exists." });
    }

    var isParticipant = friendship.UserLowId == userId || friendship.UserHighId == userId;
    var isRecipient = friendship.RequestedBy != userId && isParticipant;
    var isRequester = friendship.RequestedBy == userId && isParticipant;
    if ((action is "accept" or "decline") && !isRecipient ||
        action == "cancel" && !isRequester)
    {
        return Results.NotFound(new { title = "That pending friend request no longer exists." });
    }

    if (action == "accept")
    {
        var updateResult = await friendships.UpdateOneAsync(
            item => item.Id == friendshipId && item.Status == FriendshipStatus.Pending,
            Builders<Friendship>.Update.Set(item => item.Status, FriendshipStatus.Accepted),
            cancellationToken: cancellationToken);
        return updateResult.ModifiedCount == 1
            ? Results.Ok(new { relationship = "friends" })
            : Results.Conflict(new { title = "That friend request has already changed." });
    }

    var deleteFilter = action == "cancel"
        ? Builders<Friendship>.Filter.Where(item =>
            item.Id == friendshipId && item.RequestedBy == userId && item.Status == FriendshipStatus.Pending)
        : Builders<Friendship>.Filter.Where(item =>
            item.Id == friendshipId && item.RequestedBy != userId && item.Status == FriendshipStatus.Pending);
    var deleteResult = await friendships.DeleteOneAsync(deleteFilter, cancellationToken);
    return deleteResult.DeletedCount == 1
        ? Results.NoContent()
        : Results.Conflict(new { title = "That friend request has already changed." });
}

async Task<IResult> RemoveFriend(
    string friendId,
    ClaimsPrincipal principal,
    HttpContext context,
    IAntiforgery antiforgery,
    CancellationToken cancellationToken)
{
    if (!await HasValidAntiforgeryToken(context, antiforgery))
    {
        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Refresh the page and try again.");
    }

    if (!TryGetUserId(principal, out var userId))
    {
        return Results.Unauthorized();
    }

    if (!ObjectId.TryParse(friendId, out var otherUserId) || otherUserId == userId)
    {
        return Results.NotFound(new { title = "Friend not found." });
    }

    var (lowId, highId) = OrderIds(userId, otherUserId);
    var result = await friendships.DeleteOneAsync(
        item => item.UserLowId == lowId && item.UserHighId == highId && item.Status == FriendshipStatus.Accepted,
        cancellationToken);
    return result.DeletedCount == 1
        ? Results.NoContent()
        : Results.NotFound(new { title = "Friend not found." });
}

async Task<IResult> GetFriends(ClaimsPrincipal principal, CancellationToken cancellationToken)
{
    if (!TryGetUserId(principal, out var userId))
    {
        return Results.Unauthorized();
    }

    var relations = await friendships.Find(item => item.UserLowId == userId || item.UserHighId == userId)
        .ToListAsync(cancellationToken);
    var relatedIds = relations
        .Select(item => item.UserLowId == userId ? item.UserHighId : item.UserLowId)
        .Distinct()
        .ToArray();
    var relatedUsers = relatedIds.Length == 0
        ? new List<UserAccount>()
        : await users.Find(user => relatedIds.Contains(user.Id)).ToListAsync(cancellationToken);
    var profiles = relatedUsers.ToDictionary(user => user.Id, ToPublicProfile);
    var items = relations
        .Where(item => profiles.ContainsKey(item.UserLowId == userId ? item.UserHighId : item.UserLowId))
        .Select(item => new
        {
            id = item.Id.ToString(),
            relationship = GetRelationship(item, userId),
            other = profiles[item.UserLowId == userId ? item.UserHighId : item.UserLowId],
            createdAt = item.CreatedAt
        });

    return Results.Ok(items);
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

static bool TryGetUserId(ClaimsPrincipal principal, out ObjectId userId) =>
    ObjectId.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out userId);

static (ObjectId LowId, ObjectId HighId) OrderIds(ObjectId first, ObjectId second) =>
    string.CompareOrdinal(first.ToString(), second.ToString()) < 0 ? (first, second) : (second, first);

static string GetRelationship(Friendship? friendship, ObjectId viewerId)
{
    if (friendship is null)
    {
        return "none";
    }

    if (friendship.Status == FriendshipStatus.Accepted)
    {
        return "friends";
    }

    return friendship.RequestedBy == viewerId ? "outgoing" : "incoming";
}

static object ToAccountResponse(UserAccount user) => new
{
    authenticated = true,
    email = user.Email,
    id = user.Id.ToString(),
    name = user.Name,
    avatar = user.Avatar,
    bio = user.Bio,
    favoriteGame = user.FavoriteGame,
    country = user.Country
};

static object ToProfileResponse(UserAccount user) => new
{
    id = user.Id.ToString(),
    name = user.Name,
    email = user.Email,
    avatar = user.Avatar,
    bio = user.Bio,
    favoriteGame = user.FavoriteGame,
    country = user.Country,
    createdAt = user.CreatedAt
};

static object ToPublicProfile(UserAccount user) => new
{
    id = user.Id.ToString(),
    name = user.Name,
    avatar = user.Avatar,
    bio = user.Bio,
    favoriteGame = user.FavoriteGame,
    country = user.Country
};

static bool IsValidEmail(string email) =>
    email.Length <= 254 &&
    Regex.IsMatch(email, @"^[^@\s]+@[^@\s]+\.[^@\s]+$", RegexOptions.CultureInvariant);

public static class ProfileOptions
{
    public static readonly string[] Avatars = ["✨", "🌟", "🎱", "🂡", "🟡", "🍾", "💎", "🍒", "🦋", "🐱"];
    public static readonly string[] FavoriteGames = ["", "Cue The Fun", "Tongits Trio", "Four Play", "Pop The Bubbly", "Swapper"];
}

public sealed record RegisterRequest(string? Name, string? Email, string? Password, bool RememberMe);
public sealed record LoginRequest(string? Email, string? Password, bool RememberMe);
public sealed record ProfileUpdateRequest(string? Name, string? Avatar, string? Bio, string? FavoriteGame, string? Country);
public sealed record FriendRequestCreate(string? Email);

public enum FriendshipStatus
{
    Pending,
    Accepted
}

public sealed class Friendship
{
    [BsonId]
    public ObjectId Id { get; set; } = ObjectId.GenerateNewId();

    [BsonElement("userLowId")]
    public ObjectId UserLowId { get; set; }

    [BsonElement("userHighId")]
    public ObjectId UserHighId { get; set; }

    [BsonElement("requestedBy")]
    public ObjectId RequestedBy { get; set; }

    [BsonElement("status")]
    [BsonRepresentation(BsonType.String)]
    public FriendshipStatus Status { get; set; }

    [BsonElement("createdAt")]
    public DateTime CreatedAt { get; set; }
}

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

    [BsonElement("avatar")]
    public string Avatar { get; set; } = "✨";

    [BsonElement("bio")]
    public string Bio { get; set; } = string.Empty;

    [BsonElement("favoriteGame")]
    public string FavoriteGame { get; set; } = string.Empty;

    [BsonElement("country")]
    public string Country { get; set; } = string.Empty;
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
