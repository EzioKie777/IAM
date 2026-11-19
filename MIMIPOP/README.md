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
   dotnet user-secrets set "RESEND_API_KEY" "<your-resend-api-key>"
   dotnet user-secrets set "EMAIL_FROM" "MIMIPOP <noreply@your-verified-domain>"
   dotnet user-secrets set "PUBLIC_BASE_URL" "http://127.0.0.1:5187"
   ```

   The app loads this project's user-secrets store explicitly, including when `dotnet run` starts without a Development launch profile. Never paste credentials into a frontend file or commit them. The app creates unique account/token indexes and a TTL index for expired action tokens when it starts.

## Run locally

```powershell
dotnet restore
dotnet run --project Mimipop.csproj
```

The included launch profile runs the local server in Development mode at `http://127.0.0.1:5187`, which permits the development cookies over localhost HTTP. Configure a Resend API key, verified sender, and this public base URL before testing account emails. Create an account, verify its email from the message, then sign in. The backend serves the site and same-origin `/api/auth/*` endpoints.

Passwords are stored as salted PBKDF2-SHA256 hashes, never as plain text. Authentication uses protected, HTTP-only cookies; form submissions use antiforgery tokens, and account actions are rate-limited. New accounts must verify their email before signing in. Verification links expire after 24 hours; password reset links expire after one hour and can only be used once. Existing accounts remain verified for compatibility.

## Project structure

The frontend lives in `wwwroot/` and is served as static files by ASP.NET Core. There is no build step: the JavaScript uses native ES modules, so edit a file and refresh the browser.

```
wwwroot/
  index.html          page markup only
  css/                base, home, one file per game, games (shared), auth, profile, responsive
  js/
    main.js           entry point: page routing, Escape key handler
    ui.js             toast notifications
    page.js           ?game= / ?page= URL state
    api.js            CSRF token + apiRequest()
    auth.js           login, registration, verification, password recovery, account header
    profile.js        profile page and friends
    games/            modals.js, cue.js, cue-match.js, tongits.js, fourplay.js, bubbly.js, swapper.js
Services/
  IEmailSender.cs    email delivery abstraction
  ResendEmailSender.cs
  EmailSettings.cs
```

CSS files are linked in `index.html` in a fixed order (`responsive.css` last) because later rules override earlier ones. Add a new game by creating `js/games/<name>.js` and `css/<name>.css`, then importing it from `main.js` and linking the stylesheet.

## Deploying to Render

1. Push this repo to GitHub (never commit secrets; `.gitignore` already excludes keys and build output).
2. In MongoDB Atlas, open **Network Access** and allow Render to connect. Render has no fixed IP on the free plan, so the usual choice is `0.0.0.0/0` together with a long random database password.
3. In Render choose **New > Web Service**, pick the repo, and set the language to **Docker** (the `Dockerfile` is detected). Or choose **New > Blueprint** to use `render.yaml`.
4. Add environment variables: `MONGODB_URI` (your Atlas connection string), optionally `MONGODB_DATABASE` (defaults to `mimipop`), `RESEND_API_KEY`, `EMAIL_FROM` (a sender address verified with Resend), and `PUBLIC_BASE_URL` (the public HTTPS URL of the deployed app, without a query or fragment).
5. Set the health check path to `/healthz`, then deploy. Render supplies the `PORT` variable and HTTPS.

Notes:
- Matchmaking and live matches are held in memory, so run exactly **one instance**. On the free plan the server sleeps after about 15 minutes idle, which drops live matches; the paid Starter plan stays awake.
- In production the login/CSRF key ring is stored in the `dataProtectionKeys` MongoDB collection so users stay signed in across deploys. Anyone with database access could use those keys, so keep the Atlas credentials private.
- Behind Render's proxy the app trusts `X-Forwarded-For`/`-Proto` so rate limits count each visitor separately. Do not expose the container directly to the internet without that proxy.
- Configure and verify a sending domain with Resend before accepting registrations. Keep the API key in Render environment variables; never commit it. The app does not create new accounts when email delivery is unconfigured.

## Profiles and friends

- Signed-in members can open **My profile** from the account header to edit their display name, avatar, short bio, favorite game, and country.
- Members can search for another account by its exact email address and send a friend request. Search results and friend cards never return or display the other member's email.
- Friend requests can be accepted, declined, or cancelled. Accepted friends can be removed later. Profile and friendship data are stored in the `users` and `friendships` collections.
- The achievements panel is a visual placeholder; game achievements are not stored yet.

## Cue The Fun matchmaking

- Cue The Fun requires players to choose a mode before entering the table: **Practice** for solo play, **Classic · Find a Match** for the public queue, or **Custom** to challenge an accepted friend.
- Signed-in players can join a public queue or challenge an accepted friend from the Cue The Fun page. Challenges can be accepted, declined, or cancelled; queue entries expire after three minutes and challenges after two minutes.
- Matchmaking state currently lives in the web server's memory. It is suitable for local testing and a single app instance, but restarts clear queues and matches; it is not yet a durable or multi-instance production service.
- After a match is found or a friend accepts a challenge, both players can enter the shared live table. The server simulates shots, alternates turns, and streams table and score updates to both players over an authenticated WebSocket connection.
- Live matches are also held in server memory and end when a player leaves, the rack is cleared, or the match expires. Deployments must support WebSockets and use HTTPS so browsers can connect securely.

## Deployment notes

- Set `MONGODB_URI` and optionally `MONGODB_DATABASE` as server environment variables in production. Do not use a committed `.env` file.
- Serve the app over HTTPS. Production authentication and antiforgery cookies require secure transport.
- Configure `DATA_PROTECTION_KEY_PATH` to a persistent, private location so authentication cookies remain valid across app restarts. Protect and back up those keys.
- Restrict the Atlas database user to the app database and use Atlas Network Access rules appropriate for the deployed host.
- Verification and password-reset tokens are random, one-time values; only their SHA-256 hashes are stored in MongoDB. A TTL index removes expired tokens. Password-reset requests use a generic response so they do not reveal whether an email belongs to an account.
