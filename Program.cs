using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using System.Text.Json;
using System.Net.WebSockets;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.FileProviders;
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
    options.AddPolicy("matchmaking", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 240,
                Window = TimeSpan.FromMinutes(3),
                QueueLimit = 0,
                AutoReplenishment = true
            }));
});
builder.Services.AddSingleton(users);
builder.Services.AddSingleton(friendships);
builder.Services.AddSingleton<CueMatchmakingService>();
builder.Services.AddHostedService(serviceProvider =>
    serviceProvider.GetRequiredService<CueMatchmakingService>());

var app = builder.Build();
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}

app.UseRateLimiter();
app.UseWebSockets();
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

var webRoot = AppContext.BaseDirectory;
var indexPath = Path.Combine(webRoot, "index.html");
// Serve only the client assets we ship next to index.html (css/, js/).
foreach (var folder in new[] { "css", "js" })
{
    var path = Path.Combine(webRoot, folder);
    if (Directory.Exists(path))
    {
        app.UseStaticFiles(new StaticFileOptions
        {
            FileProvider = new PhysicalFileProvider(path),
            RequestPath = "/" + folder
        });
    }
}
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
app.MapGet("/api/cue/status", (ClaimsPrincipal principal, CueMatchmakingService matchmaker) =>
{
    return TryGetUserId(principal, out var userId)
        ? Results.Ok(matchmaker.GetStatus(userId))
        : Results.Unauthorized();
}).RequireAuthorization().RequireRateLimiting("matchmaking");
app.MapPost("/api/cue/queue", JoinCueQueue).RequireAuthorization().RequireRateLimiting("social");
app.MapDelete("/api/cue/queue", CancelCueQueue).RequireAuthorization().RequireRateLimiting("social");
app.MapPost("/api/cue/invitations", InviteCueFriend).RequireAuthorization().RequireRateLimiting("social");
app.MapPost("/api/cue/invitations/{invitationId}/{action}", RespondToCueInvitation)
    .RequireAuthorization().RequireRateLimiting("social");
app.MapPost("/api/cue/match/leave", LeaveCueMatch).RequireAuthorization().RequireRateLimiting("social");
app.MapGet("/api/cue/live", HandleCueLiveConnection).RequireAuthorization();

app.Run();

async Task<IResult> HandleCueLiveConnection(
    HttpContext context,
    CueMatchmakingService matchmaker,
    CancellationToken cancellationToken)
{
    if (!TryGetUserId(context.User, out var userId))
    {
        return Results.Unauthorized();
    }

    if (!context.WebSockets.IsWebSocketRequest)
    {
        return Results.BadRequest();
    }

    var origin = context.Request.Headers["Origin"].ToString();
    if (!Uri.TryCreate(origin, UriKind.Absolute, out var originUri) ||
        originUri.Scheme is not ("http" or "https") ||
        !string.Equals(originUri.Host, context.Request.Host.Host, StringComparison.OrdinalIgnoreCase) ||
        (context.Request.Host.Port is int requestPort && originUri.Port != requestPort) ||
        (context.Request.Host.Port is null && !originUri.IsDefaultPort))
    {
        return Results.StatusCode(StatusCodes.Status403Forbidden);
    }

    if (!Guid.TryParse(context.Request.Query["matchId"], out var matchId) ||
        !matchmaker.IsLiveParticipant(userId, matchId))
    {
        return Results.NotFound();
    }

    using var socket = await context.WebSockets.AcceptWebSocketAsync();
    await matchmaker.RunLiveConnectionAsync(userId, matchId, socket, cancellationToken);
    return Results.Empty;
}

async Task<IResult> JoinCueQueue(
    ClaimsPrincipal principal,
    HttpContext context,
    IAntiforgery antiforgery,
    CueMatchmakingService matchmaker,
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

    var user = await users.Find(account => account.Id == userId).FirstOrDefaultAsync(cancellationToken);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    var result = matchmaker.JoinQueue(new CuePlayer(user.Id, user.Name, user.Avatar));
    return result.Success
        ? Results.Ok(result.Status)
        : Results.Conflict(new { title = result.Error });
}

async Task<IResult> CancelCueQueue(
    ClaimsPrincipal principal,
    HttpContext context,
    IAntiforgery antiforgery,
    CueMatchmakingService matchmaker)
{
    if (!await HasValidAntiforgeryToken(context, antiforgery))
    {
        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Refresh the page and try again.");
    }

    if (!TryGetUserId(principal, out var userId))
    {
        return Results.Unauthorized();
    }

    return Results.Ok(matchmaker.CancelQueue(userId));
}

async Task<IResult> InviteCueFriend(
    CueInviteRequest request,
    ClaimsPrincipal principal,
    HttpContext context,
    IAntiforgery antiforgery,
    CueMatchmakingService matchmaker,
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

    if (!ObjectId.TryParse(request.FriendId, out var friendId) || friendId == userId)
    {
        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Choose a valid friend.");
    }

    var (lowId, highId) = OrderIds(userId, friendId);
    var friendship = await friendships.Find(item =>
        item.UserLowId == lowId &&
        item.UserHighId == highId &&
        item.Status == FriendshipStatus.Accepted).FirstOrDefaultAsync(cancellationToken);
    if (friendship is null)
    {
        return Results.NotFound(new { title = "Cue The Fun challenges are only available with accepted friends." });
    }

    var usersToInvite = await users.Find(account => account.Id == friendId || account.Id == userId)
        .ToListAsync(cancellationToken);
    var caller = usersToInvite.FirstOrDefault(account => account.Id == userId);
    var target = usersToInvite.FirstOrDefault(account => account.Id == friendId);
    if (caller is null || target is null)
    {
        return Results.NotFound(new { title = "That friend could not be found." });
    }

    var result = matchmaker.Invite(
        new CuePlayer(caller.Id, caller.Name, caller.Avatar),
        new CuePlayer(target.Id, target.Name, target.Avatar));
    return result.Success
        ? Results.Ok(result.Status)
        : Results.Conflict(new { title = result.Error });
}

async Task<IResult> RespondToCueInvitation(
    string invitationId,
    string action,
    ClaimsPrincipal principal,
    HttpContext context,
    IAntiforgery antiforgery,
    CueMatchmakingService matchmaker)
{
    if (!await HasValidAntiforgeryToken(context, antiforgery))
    {
        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Refresh the page and try again.");
    }

    if (!TryGetUserId(principal, out var userId))
    {
        return Results.Unauthorized();
    }

    if (action is not ("accept" or "decline" or "cancel"))
    {
        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Choose a valid invitation action.");
    }

    var result = matchmaker.RespondToInvitation(userId, invitationId, action);
    if (!result.Success)
    {
        return Results.Conflict(new { title = result.Error });
    }

    return Results.Ok(result.Status);
}

async Task<IResult> LeaveCueMatch(
    ClaimsPrincipal principal,
    HttpContext context,
    IAntiforgery antiforgery,
    CueMatchmakingService matchmaker)
{
    if (!await HasValidAntiforgeryToken(context, antiforgery))
    {
        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Refresh the page and try again.");
    }

    if (!TryGetUserId(principal, out var userId))
    {
        return Results.Unauthorized();
    }

    return Results.Ok(matchmaker.LeaveMatch(userId));
}

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

async Task<IResult> Logout(
    HttpContext context,
    IAntiforgery antiforgery,
    CueMatchmakingService matchmaker)
{
    if (!await HasValidAntiforgeryToken(context, antiforgery))
    {
        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Refresh the page and try again.");
    }

    if (TryGetUserId(context.User, out var userId))
    {
        matchmaker.RemoveUser(userId);
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
public sealed record CueInviteRequest(string? FriendId);

public sealed record CuePlayer(ObjectId Id, string Name, string Avatar);
public sealed record CuePlayerResponse(string Id, string Name, string Avatar);
public sealed record CueMatchSummary(string Id, string Mode, CuePlayerResponse Opponent);
public sealed record CueInvitationSummary(string Id, CuePlayerResponse Other);
public sealed record CueMatchmakingStatus(
    string State,
    CueMatchSummary? Match,
    IReadOnlyList<CueInvitationSummary> IncomingInvitations,
    IReadOnlyList<CueInvitationSummary> OutgoingInvitations);
public sealed record CueOperationResult(bool Success, string? Error, CueMatchmakingStatus Status);

public sealed class CueMatchmakingService : BackgroundService
{
    private static readonly JsonSerializerOptions LiveJsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly TimeSpan QueueLifetime = TimeSpan.FromMinutes(3);
    private static readonly TimeSpan InvitationLifetime = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan MatchLifetime = TimeSpan.FromHours(1);
    private readonly object gate = new();
    private readonly Dictionary<ObjectId, CueQueueEntry> queue = [];
    private readonly Dictionary<Guid, CueInvitation> invitations = [];
    private readonly Dictionary<Guid, CueMatch> matches = [];
    private readonly Dictionary<Guid, CueLiveGame> liveGames = [];
    private readonly Dictionary<ObjectId, Guid> activeMatches = [];

    public bool IsLiveParticipant(ObjectId userId, Guid matchId)
    {
        lock (gate)
        {
            CleanupExpired();
            return matches.TryGetValue(matchId, out var match) &&
                liveGames.ContainsKey(matchId) &&
                (match.First.Id == userId || match.Second.Id == userId);
        }
    }

    public async Task RunLiveConnectionAsync(
        ObjectId userId,
        Guid matchId,
        WebSocket socket,
        CancellationToken cancellationToken)
    {
        CueLiveConnection connection;
        List<(CueLiveConnection Connection, object State)> connectionUpdates;
        lock (gate)
        {
            if (!matches.TryGetValue(matchId, out var match) ||
                !liveGames.TryGetValue(matchId, out var game) ||
                (match.First.Id != userId && match.Second.Id != userId))
            {
                socket.Abort();
                return;
            }

            if (game.Connections.Remove(userId, out var previousConnection))
            {
                previousConnection.Socket.Abort();
            }

            connection = new CueLiveConnection(userId, socket);
            game.Connections[userId] = connection;
            connectionUpdates = game.Connections.Values
                .Select(client => (client, CreateLiveState(game, client.UserId)))
                .ToList();
        }

        try
        {
            await Task.WhenAll(connectionUpdates.Select(item =>
                SendLiveMessageAsync(item.Connection, item.State, cancellationToken)));
            var buffer = new byte[2048];
            while (socket.State == WebSocketState.Open && !cancellationToken.IsCancellationRequested)
            {
                using var message = new MemoryStream();
                ValueWebSocketReceiveResult result;
                do
                {
                    result = await socket.ReceiveAsync(buffer.AsMemory(), cancellationToken);
                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        return;
                    }

                    if (result.MessageType != WebSocketMessageType.Text ||
                        message.Length + result.Count > 2048)
                    {
                        await socket.CloseAsync(
                            result.MessageType != WebSocketMessageType.Text
                                ? WebSocketCloseStatus.InvalidMessageType
                                : WebSocketCloseStatus.MessageTooBig,
                            "Only small text messages are supported.",
                            cancellationToken);
                        return;
                    }

                    message.Write(buffer, 0, result.Count);
                }
                while (!result.EndOfMessage);

                await ProcessLiveMessageAsync(userId, matchId, connection, message.ToArray(), cancellationToken);
            }
        }
        catch (WebSocketException)
        {
            if (socket.State == WebSocketState.Open)
            {
                socket.Abort();
            }
        }
        finally
        {
            List<(CueLiveConnection Connection, object State)> presenceUpdates = [];
            lock (gate)
            {
                if (liveGames.TryGetValue(matchId, out var game) &&
                    game.Connections.TryGetValue(userId, out var registered) &&
                    ReferenceEquals(registered, connection))
                {
                    game.Connections.Remove(userId);
                    presenceUpdates = game.Connections.Values
                        .Select(client => (client, CreateLiveState(game, client.UserId)))
                        .ToList();
                }
            }

            if (!cancellationToken.IsCancellationRequested)
            {
                await Task.WhenAll(presenceUpdates.Select(item =>
                    SendLiveMessageAsync(item.Connection, item.State, cancellationToken)));
            }
        }
    }

    private async Task ProcessLiveMessageAsync(
        ObjectId userId,
        Guid matchId,
        CueLiveConnection connection,
        byte[] payload,
        CancellationToken cancellationToken)
    {
        CueLiveClientMessage? message;
        try
        {
            message = JsonSerializer.Deserialize<CueLiveClientMessage>(payload, LiveJsonOptions);
        }
        catch (JsonException)
        {
            await SendLiveErrorAsync(connection, "That game action could not be read.", cancellationToken);
            return;
        }

        if (message?.Type != "shot" ||
            !float.IsFinite(message.AimX) ||
            !float.IsFinite(message.AimY) ||
            message.AimX is < 0 or > 900 ||
            message.AimY is < 0 or > 480 ||
            message.Power is < 15 or > 100)
        {
            await SendLiveErrorAsync(connection, "That shot is invalid.", cancellationToken);
            return;
        }

        string? error = null;
        lock (gate)
        {
            if (!matches.ContainsKey(matchId) ||
                !liveGames.TryGetValue(matchId, out var game) ||
                (game.Match.First.Id != userId && game.Match.Second.Id != userId))
            {
                error = "This billiards match is no longer available.";
            }
            else if (game.Finished)
            {
                error = "This billiards match has finished.";
            }
            else if (game.TurnPlayerId != userId)
            {
                error = "Wait for your turn before shooting.";
            }
            else if (game.Moving)
            {
                error = "Wait for the balls to stop before shooting again.";
            }
            else if (game.Connections.Count < 2)
            {
                error = "Wait for your opponent to reconnect before shooting.";
            }
            else if (DateTime.UtcNow - connection.LastActionAt < TimeSpan.FromMilliseconds(100))
            {
                error = "Wait a moment before sending another game action.";
            }
            else
            {
                connection.LastActionAt = DateTime.UtcNow;
                var cueBall = game.Balls.FirstOrDefault(ball => ball.IsCue);
                if (cueBall is null)
                {
                    error = "The cue ball is unavailable.";
                }
                else
                {
                    var deltaX = message.AimX - cueBall.X;
                    var deltaY = message.AimY - cueBall.Y;
                    var distance = MathF.Sqrt(deltaX * deltaX + deltaY * deltaY);
                    if (distance < 1)
                    {
                        error = "Aim away from the cue ball before shooting.";
                    }
                    else
                    {
                        var speed = 3 + message.Power * .105f;
                        cueBall.VelocityX = deltaX / distance * speed;
                        cueBall.VelocityY = deltaY / distance * speed;
                        game.Moving = true;
                        game.Message = $"{GetPlayerName(game.Match, userId)} took a shot.";
                    }
                }
            }
        }

        if (error is not null)
        {
            await SendLiveErrorAsync(connection, error, cancellationToken);
        }
    }

    private static void AdvanceLiveGame(CueLiveGame game)
    {
        foreach (var ball in game.Balls.ToArray())
            {
                ball.X += ball.VelocityX;
                ball.Y += ball.VelocityY;
                ball.VelocityX *= .986f;
                ball.VelocityY *= .986f;

                var pocketed = LivePockets.Any(pocket =>
                {
                    var dx = ball.X - pocket.X;
                    var dy = ball.Y - pocket.Y;
                    return MathF.Sqrt(dx * dx + dy * dy) < 21;
                });
                if (pocketed)
                {
                    if (ball.IsCue)
                    {
                        ball.X = 278;
                        ball.Y = 240;
                        ball.VelocityX = 0;
                        ball.VelocityY = 0;
                        game.Message = "Scratch! The cue ball is back in play.";
                    }
                    else
                    {
                        game.Balls.Remove(ball);
                        game.Scores[game.TurnPlayerId]++;
                        game.Message = "Nice shot!";
                    }

                    continue;
                }

                if (ball.X < 104)
                {
                    ball.X = 104;
                    ball.VelocityX = MathF.Abs(ball.VelocityX) * .82f;
                }
                else if (ball.X > 796)
                {
                    ball.X = 796;
                    ball.VelocityX = -MathF.Abs(ball.VelocityX) * .82f;
                }

                if (ball.Y < 86)
                {
                    ball.Y = 86;
                    ball.VelocityY = MathF.Abs(ball.VelocityY) * .82f;
                }
                else if (ball.Y > 394)
                {
                    ball.Y = 394;
                    ball.VelocityY = -MathF.Abs(ball.VelocityY) * .82f;
                }
            }

        for (var first = 0; first < game.Balls.Count; first++)
            {
                for (var second = first + 1; second < game.Balls.Count; second++)
                {
                    var a = game.Balls[first];
                    var b = game.Balls[second];
                    var deltaX = b.X - a.X;
                    var deltaY = b.Y - a.Y;
                    var distance = MathF.Sqrt(deltaX * deltaX + deltaY * deltaY);
                    if (distance >= 26 || distance == 0)
                    {
                        continue;
                    }

                    var normalX = deltaX / distance;
                    var normalY = deltaY / distance;
                    var overlap = (26 - distance) / 2;
                    a.X -= normalX * overlap;
                    a.Y -= normalY * overlap;
                    b.X += normalX * overlap;
                    b.Y += normalY * overlap;
                    var approach = (b.VelocityX - a.VelocityX) * normalX +
                        (b.VelocityY - a.VelocityY) * normalY;
                    if (approach < 0)
                    {
                        a.VelocityX += approach * normalX;
                        a.VelocityY += approach * normalY;
                        b.VelocityX -= approach * normalX;
                        b.VelocityY -= approach * normalY;
                    }
                }
            }

        game.Moving = game.Balls.Any(ball =>
                MathF.Abs(ball.VelocityX) > .08f || MathF.Abs(ball.VelocityY) > .08f);
        if (game.Moving)
        {
            return;
        }

        foreach (var ball in game.Balls)
        {
            ball.VelocityX = 0;
            ball.VelocityY = 0;
        }

        if (game.Balls.Count == 1)
        {
            game.Finished = true;
            var firstScore = game.Scores[game.Match.First.Id];
            var secondScore = game.Scores[game.Match.Second.Id];
            game.Message = firstScore == secondScore
                ? "The rack is clear — it’s a tie!"
                : $"{GetPlayerName(game.Match, firstScore > secondScore ? game.Match.First.Id : game.Match.Second.Id)} wins!";
            return;
        }

        game.TurnPlayerId = game.TurnPlayerId == game.Match.First.Id
            ? game.Match.Second.Id
            : game.Match.First.Id;
        game.Message = $"{GetPlayerName(game.Match, game.TurnPlayerId)}’s turn.";
    }

    private static readonly (float X, float Y)[] LivePockets =
    [
        (83, 65), (450, 65), (817, 65),
        (83, 415), (450, 415), (817, 415)
    ];

    private static object CreateLiveState(CueLiveGame game, ObjectId userId)
    {
        var opponent = game.Match.First.Id == userId ? game.Match.Second : game.Match.First;
        return new
        {
                type = "state",
                matchId = game.Match.Id.ToString("D"),
                playerId = userId.ToString(),
                opponent = new CuePlayerResponse(
                    opponent.Id.ToString(),
                    opponent.Name,
                    opponent.Avatar),
                balls = game.Balls.Select(ball => new
                {
                    cue = ball.IsCue,
                    number = ball.Number,
                    x = ball.X,
                    y = ball.Y,
                    vx = ball.VelocityX,
                    vy = ball.VelocityY
                }).ToArray(),
                scores = new Dictionary<string, int>
                {
                    [game.Match.First.Id.ToString()] = game.Scores[game.Match.First.Id],
                    [game.Match.Second.Id.ToString()] = game.Scores[game.Match.Second.Id]
                },
                turnPlayerId = game.TurnPlayerId.ToString(),
                connectedPlayers = game.Connections.Count,
                moving = game.Moving,
                finished = game.Finished,
                message = game.Message
        };
    }

    private static string GetPlayerName(CueMatch match, ObjectId playerId) =>
        match.First.Id == playerId ? match.First.Name : match.Second.Name;

    private static async Task SendLiveErrorAsync(
        CueLiveConnection connection,
        string message,
        CancellationToken cancellationToken) =>
        await SendLiveMessageAsync(connection, new { type = "error", message }, cancellationToken);

    private static async Task SendLiveMessageAsync(
        CueLiveConnection connection,
        object message,
        CancellationToken cancellationToken)
    {
        if (connection.Socket.State != WebSocketState.Open)
        {
            return;
        }

        var payload = JsonSerializer.SerializeToUtf8Bytes(message, LiveJsonOptions);
        await connection.SendLock.WaitAsync(cancellationToken);
        try
        {
            if (connection.Socket.State == WebSocketState.Open)
            {
                await connection.Socket.SendAsync(
                    payload.AsMemory(),
                    WebSocketMessageType.Text,
                    endOfMessage: true,
                    cancellationToken);
            }
        }
        catch (WebSocketException)
        {
            connection.Socket.Abort();
        }
        finally
        {
            connection.SendLock.Release();
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(TimeSpan.FromMilliseconds(16), stoppingToken);
            List<(CueLiveConnection Connection, object State)> broadcasts = [];
            lock (gate)
            {
                foreach (var game in liveGames.Values)
                {
                    if (!game.Moving)
                    {
                        continue;
                    }

                    AdvanceLiveGame(game);
                    game.TickCount++;
                    if (game.TickCount % 3 == 0 || !game.Moving)
                    {
                        foreach (var connection in game.Connections.Values)
                        {
                            broadcasts.Add((connection, CreateLiveState(game, connection.UserId)));
                        }
                    }
                }
            }

            await Task.WhenAll(broadcasts.Select(item =>
                SendLiveMessageAsync(item.Connection, item.State, stoppingToken)));
        }
    }

    public CueMatchmakingStatus GetStatus(ObjectId userId)
    {
        lock (gate)
        {
            CleanupExpired();
            return BuildStatus(userId);
        }
    }

    public CueOperationResult JoinQueue(CuePlayer player)
    {
        lock (gate)
        {
            CleanupExpired();
            if (activeMatches.ContainsKey(player.Id))
            {
                return Failure(player.Id, "You are already in a Cue The Fun match.");
            }

            if (invitations.Values.Any(invitation =>
                invitation.From.Id == player.Id || invitation.To.Id == player.Id))
            {
                return Failure(player.Id, "Resolve your pending friend challenge before joining the queue.");
            }

            if (queue.ContainsKey(player.Id))
            {
                return Success(player.Id);
            }

            var opponent = queue.Values
                .Where(entry => entry.Player.Id != player.Id)
                .OrderBy(entry => entry.QueuedAt)
                .FirstOrDefault();
            if (opponent is null)
            {
                queue[player.Id] = new CueQueueEntry(player, DateTime.UtcNow);
            }
            else
            {
                queue.Remove(opponent.Player.Id);
                CreateMatch(player, opponent.Player, "public");
            }

            return Success(player.Id);
        }
    }

    public CueMatchmakingStatus CancelQueue(ObjectId userId)
    {
        lock (gate)
        {
            CleanupExpired();
            queue.Remove(userId);
            return BuildStatus(userId);
        }
    }

    public CueOperationResult Invite(CuePlayer sender, CuePlayer recipient)
    {
        lock (gate)
        {
            CleanupExpired();
            if (IsBusy(sender.Id) || IsBusy(recipient.Id))
            {
                return Failure(sender.Id, "You or your friend already has an active match, queue spot, or challenge.");
            }

            var invitation = new CueInvitation(Guid.NewGuid(), sender, recipient, DateTime.UtcNow);
            invitations.Add(invitation.Id, invitation);
            return Success(sender.Id);
        }
    }

    public CueOperationResult RespondToInvitation(ObjectId userId, string invitationId, string action)
    {
        lock (gate)
        {
            CleanupExpired();
            if (!Guid.TryParse(invitationId, out var id) || !invitations.TryGetValue(id, out var invitation))
            {
                return Failure(userId, "That challenge has expired or was already handled.");
            }

            if (action == "cancel")
            {
                if (invitation.From.Id != userId)
                {
                    return Failure(userId, "Only the player who sent the challenge can cancel it.");
                }

                invitations.Remove(id);
                return Success(userId);
            }

            if (invitation.To.Id != userId)
            {
                return Failure(userId, "That challenge is not addressed to you.");
            }

            if (action == "decline")
            {
                invitations.Remove(id);
                return Success(userId);
            }

            if (IsBusy(invitation.From.Id, id) || IsBusy(invitation.To.Id, id))
            {
                invitations.Remove(id);
                return Failure(userId, "A player is no longer available for this challenge.");
            }

            invitations.Remove(id);
            CreateMatch(invitation.From, invitation.To, "friends");
            return Success(userId);
        }
    }

    public CueMatchmakingStatus LeaveMatch(ObjectId userId)
    {
        lock (gate)
        {
            CleanupExpired();
            if (activeMatches.TryGetValue(userId, out var matchId) &&
                matches.Remove(matchId, out var match))
            {
                RemoveLiveGame(match);
                activeMatches.Remove(match.First.Id);
                activeMatches.Remove(match.Second.Id);
            }

            return BuildStatus(userId);
        }
    }

    public void RemoveUser(ObjectId userId)
    {
        lock (gate)
        {
            CleanupExpired();
            queue.Remove(userId);
            foreach (var invitationId in invitations.Values
                .Where(invitation => invitation.From.Id == userId || invitation.To.Id == userId)
                .Select(invitation => invitation.Id)
                .ToArray())
            {
                invitations.Remove(invitationId);
            }

            if (activeMatches.TryGetValue(userId, out var matchId) &&
                matches.Remove(matchId, out var match))
            {
                RemoveLiveGame(match);
                activeMatches.Remove(match.First.Id);
                activeMatches.Remove(match.Second.Id);
            }
        }
    }

    private void CreateMatch(CuePlayer first, CuePlayer second, string mode)
    {
        var match = new CueMatch(Guid.NewGuid(), first, second, mode, DateTime.UtcNow);
        matches.Add(match.Id, match);
        liveGames.Add(match.Id, CreateLiveGame(match));
        activeMatches[first.Id] = match.Id;
        activeMatches[second.Id] = match.Id;
    }

    private static CueLiveGame CreateLiveGame(CueMatch match)
    {
        var balls = new List<CueLiveBall>
        {
            new(0, true, 278, 240)
        };
        var number = 0;
        for (var column = 0; column < 4; column++)
        {
            for (var row = 0; row <= column; row++)
            {
                balls.Add(new CueLiveBall(
                    ++number,
                    false,
                    594 + column * 28,
                    240 + (row - column / 2f) * 29));
            }
        }

        return new CueLiveGame(match, balls);
    }

    private void RemoveLiveGame(CueMatch match)
    {
        if (!liveGames.Remove(match.Id, out var game))
        {
            return;
        }

        foreach (var connection in game.Connections.Values)
        {
            connection.Socket.Abort();
        }
    }

    private bool IsBusy(ObjectId userId, Guid? ignoredInvitation = null) =>
        queue.ContainsKey(userId) ||
        activeMatches.ContainsKey(userId) ||
        invitations.Values.Any(invitation =>
            invitation.Id != ignoredInvitation &&
            (invitation.From.Id == userId || invitation.To.Id == userId));

    private CueMatchmakingStatus BuildStatus(ObjectId userId)
    {
        CueMatchSummary? matchSummary = null;
        if (activeMatches.TryGetValue(userId, out var matchId) && matches.TryGetValue(matchId, out var match))
        {
            var opponent = match.First.Id == userId ? match.Second : match.First;
            matchSummary = new CueMatchSummary(
                match.Id.ToString("D"),
                match.Mode,
                ToCuePlayerResponse(opponent));
        }

        var incoming = invitations.Values
            .Where(invitation => invitation.To.Id == userId)
            .OrderBy(invitation => invitation.CreatedAt)
            .Select(invitation => new CueInvitationSummary(
                invitation.Id.ToString("D"),
                ToCuePlayerResponse(invitation.From)))
            .ToArray();
        var outgoing = invitations.Values
            .Where(invitation => invitation.From.Id == userId)
            .OrderBy(invitation => invitation.CreatedAt)
            .Select(invitation => new CueInvitationSummary(
                invitation.Id.ToString("D"),
                ToCuePlayerResponse(invitation.To)))
            .ToArray();
        var state = matchSummary is not null ? "matched" : queue.ContainsKey(userId) ? "queued" : "idle";
        return new CueMatchmakingStatus(state, matchSummary, incoming, outgoing);
    }

    private CueOperationResult Success(ObjectId userId) =>
        new(true, null, BuildStatus(userId));

    private CueOperationResult Failure(ObjectId userId, string error) =>
        new(false, error, BuildStatus(userId));

    private static CuePlayerResponse ToCuePlayerResponse(CuePlayer player) =>
        new(player.Id.ToString(), player.Name, player.Avatar);

    private void CleanupExpired()
    {
        var now = DateTime.UtcNow;
        foreach (var userId in queue
            .Where(item => now - item.Value.QueuedAt > QueueLifetime)
            .Select(item => item.Key)
            .ToArray())
        {
            queue.Remove(userId);
        }

        foreach (var invitationId in invitations
            .Where(item => now - item.Value.CreatedAt > InvitationLifetime)
            .Select(item => item.Key)
            .ToArray())
        {
            invitations.Remove(invitationId);
        }

        foreach (var match in matches.Values
            .Where(item => now - item.CreatedAt > MatchLifetime)
            .ToArray())
        {
            matches.Remove(match.Id);
            RemoveLiveGame(match);
            activeMatches.Remove(match.First.Id);
            activeMatches.Remove(match.Second.Id);
        }
    }

    private sealed record CueQueueEntry(CuePlayer Player, DateTime QueuedAt);
    private sealed record CueInvitation(Guid Id, CuePlayer From, CuePlayer To, DateTime CreatedAt);
    private sealed record CueMatch(Guid Id, CuePlayer First, CuePlayer Second, string Mode, DateTime CreatedAt);
    private sealed record CueLiveClientMessage(string? Type, float AimX, float AimY, int Power);
    private sealed class CueLiveBall(int number, bool isCue, float x, float y)
    {
        public int Number { get; } = number;
        public bool IsCue { get; } = isCue;
        public float X { get; set; } = x;
        public float Y { get; set; } = y;
        public float VelocityX { get; set; }
        public float VelocityY { get; set; }
    }

    private sealed class CueLiveGame(CueMatch match, List<CueLiveBall> balls)
    {
        public CueMatch Match { get; } = match;
        public List<CueLiveBall> Balls { get; } = balls;
        public Dictionary<ObjectId, int> Scores { get; } = new()
        {
            [match.First.Id] = 0,
            [match.Second.Id] = 0
        };
        public Dictionary<ObjectId, CueLiveConnection> Connections { get; } = [];
        public ObjectId TurnPlayerId { get; set; } = match.First.Id;
        public bool Moving { get; set; }
        public bool Finished { get; set; }
        public int TickCount { get; set; }
        public string Message { get; set; } = $"{match.First.Name} breaks.";
    }

    private sealed class CueLiveConnection(ObjectId userId, WebSocket socket)
    {
        public ObjectId UserId { get; } = userId;
        public WebSocket Socket { get; } = socket;
        public SemaphoreSlim SendLock { get; } = new(1, 1);
        public DateTime LastActionAt { get; set; }
    }
}

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
