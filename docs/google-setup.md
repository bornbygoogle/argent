# Google Cloud setup (one-time, app owner)

The Google Drive backup uses an **OAuth 2.0 authorization-code flow** handled by the serverless
functions in `api/auth/`. The server holds the client secret and a long-lived refresh token; the
browser only ever receives short-lived access tokens.

There are **four** things to configure. Step 1 is the one people skip, and skipping it means being
asked to reconnect every 7 days.

---

## 1. Publish the app — REQUIRED for a permanent connection

**Google Cloud Console → APIs & Services → OAuth consent screen → Publish app**
(publishing status: *Testing* → *In production*).

Why this is not optional:

> "A Google Cloud Platform project with an OAuth consent screen configured for an external user
> type and a **publishing status of 'Testing' is issued a refresh token expiring in 7 days**, unless
> the only OAuth scopes requested are a subset of name, email address, and user profile."
> — [Using OAuth 2.0 to Access Google APIs](https://developers.google.com/identity/protocols/oauth2)

This app requests `drive.file`, which is not in that exempt subset. While the project stays in
Testing, the refresh token dies weekly and you are sent back to the consent screen.

**This does not require a security review.** `drive.file` is listed under
[Non-sensitive scopes](https://developers.google.com/drive/api/guides/api-specific-auth):

> "Non-sensitive: These scopes provide the smallest scope of authorization and only require basic
> OAuth App Verification."

You fill in the branding fields (app name, support email, developer contact). There is no security
assessment and no demo video, as there would be for sensitive or restricted scopes.

---

## 2. Enable APIs

- **Google Drive API**
- **Google Picker API**

---

## 3. OAuth client — redirect URIs

**Credentials → OAuth 2.0 Client IDs → your Web application client.**

**Authorized redirect URIs** — add both:

```
http://localhost:5173/api/auth/callback
https://<production-domain>/api/auth/callback
```

> This client originally registered **no** redirect URIs at all — only a JavaScript origin, which
> was all the old implicit flow needed. The authorization-code flow will fail with
> `redirect_uri_mismatch` until these are added.

**Authorized JavaScript origins** — keep the existing entries (`http://localhost:5173` and your
production origin). Still required by the Picker.

---

## 4. API key (for the Picker)

- Credentials → Create credentials → **API key**
- **Application restrictions**: HTTP referrers → your production origin + `http://localhost:5173/*`
- **API restrictions**: Google Drive API + Google Picker API

---

## 5. Environment variables

Two are public and ship in the browser bundle by design. Three are **server-only**.

| Variable | Where it runs | Notes |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | browser + server | Public. |
| `VITE_GOOGLE_API_KEY` | browser | Public. Restricted by HTTP referrer. |
| `GOOGLE_CLIENT_SECRET` | **server only** | From `client_secret_*.json` → `web.client_secret`. |
| `SESSION_SECRET` | **server only** | 32 random bytes, base64. Encrypts the refresh token in the cookie. |
| `APP_ORIGIN` | **server only** | e.g. `https://your-app.vercel.app`. The redirect URI is built from it. |

> **Never prefix the bottom three with `VITE_`.** Vite inlines every `VITE_`-prefixed variable into
> the browser bundle, which would publish your client secret to anyone who opens DevTools.

Generate a session secret:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

**Local** — put all five in `.env` (gitignored). `APP_ORIGIN=http://localhost:5173`.

**Vercel** — Settings → Environment Variables. Add **all five** to **Production and Preview**: the
two `VITE_` ones are inlined into the browser bundle at build time, and the server functions read
`VITE_GOOGLE_CLIENT_ID` too. Set `APP_ORIGIN` to that environment's own URL — *not* localhost.

Environment variables are applied when a deployment is built, so an existing deployment keeps the
values it was built with. **Redeploy after adding or changing any of them**, or the functions keep
failing exactly as before.

Rotating `SESSION_SECRET` signs every device out; it does not revoke access at Google.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `redirect_uri_mismatch` on sign-in | Step 3 — redirect URI missing, or `APP_ORIGIN` doesn't match it exactly (scheme, port, no trailing slash). |
| Asked to reconnect roughly every 7 days | Step 1 — app still in Testing. |
| `{"error":"not-configured","detail":"Missing server env: …"}` (503) from any `/api/auth/*` | Step 5 — the named variables are absent in that environment. |
| `FUNCTION_INVOCATION_FAILED` (500) from every `/api/auth/*` while the app itself loads | Same cause, but the variables were never added at all *and* the deploy predates the `endpoint()` wrapper. Add them and redeploy. |
| Variables added but the error persists | Vercel applies environment variables at build time — an existing deployment keeps the old ones. **Redeploy** after adding them. |
| Redirected to `/settings?google=norefresh` | Google returned no refresh token. The flow sends `prompt=consent` to prevent this; if it recurs, remove the app at [Google Account permissions](https://myaccount.google.com/permissions) and connect again. |
| `/api/auth/start` returns the app HTML instead of redirecting | The SPA rewrite or the service worker is swallowing `/api`. Check the `api/` exclusion in `vercel.json` and `navigateFallbackDenylist` in `vite.config.ts`. |
| Sign-in works, backups fail | Picker/Drive issue, not auth — check step 4. |
