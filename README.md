# MIMIPOP

MIMIPOP is a single-page game site with an ASP.NET Core authentication API and a MongoDB Atlas user store.

## Requirements

- .NET 10 SDK
- A MongoDB Atlas cluster

## Connect MongoDB Atlas

1. In Atlas, create a database user with `readWrite` access to the MIMIPOP database.
2. Add your development machine's current IP address under **Network Access**.
3. Copy the Atlas application connection string. Replace its username, password, and database name; URL-encode special characters in the credentials.
4. From this repository folder, save the connection string outside the repository with .NET user-secrets:

   ```powershell
   dotnet user-secrets set "MONGODB_URI" "mongodb+srv://<user>:<password>@<cluster>.mongodb.net/"
   dotnet user-secrets set "MONGODB_DATABASE" "mimipop"
   ```

   The app loads this project's user-secrets store explicitly, including when `dotnet run` starts without a Development launch profile. Never paste the connection string into `index.html`, commit it, or share it in chat. The app creates a unique index on account email addresses when it starts.

## Run locally

```powershell
dotnet restore
dotnet run --project Mimipop.csproj
```

The included launch profile runs the local server in Development mode at `http://127.0.0.1:5187`, which permits the development cookies over localhost HTTP. Open that URL and use **Join the club** to create an account, then log in. The backend serves the site and same-origin `/api/auth/*` endpoints.

Passwords are stored as salted PBKDF2-SHA256 hashes, never as plain text. Authentication uses protected, HTTP-only cookies; form submissions use antiforgery tokens, and login/registration attempts are rate-limited. Accounts are created directly on registration.

## Profiles and friends

- Signed-in members can open **My profile** from the account header to edit their display name, avatar, short bio, favorite game, and country.
- Members can search for another account by its exact email address and send a friend request. Search results and friend cards never return or display the other member's email.
- Friend requests can be accepted, declined, or cancelled. Accepted friends can be removed later. Profile and friendship data are stored in the `users` and `friendships` collections.
- The achievements panel is a visual placeholder; game achievements are not stored yet.

## Deployment notes

- Set `MONGODB_URI` and optionally `MONGODB_DATABASE` as server environment variables in production. Do not use a committed `.env` file.
- Serve the app over HTTPS. Production authentication and antiforgery cookies require secure transport.
- Configure `DATA_PROTECTION_KEY_PATH` to a persistent, private location so authentication cookies remain valid across app restarts. Protect and back up those keys.
- Restrict the Atlas database user to the app database and use Atlas Network Access rules appropriate for the deployed host.
- Password reset and email verification are not implemented yet; the frontend says so rather than pretending those flows work.
