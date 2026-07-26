# Permanent Google connection — design

**Date:** 2026-07-26
**Status:** approved, ready for implementation planning
**Scope:** Project A of two. Project B (whole-app redesign) gets its own spec.

---

## 1. Problem

The app asks the user to reconnect Google on **every page refresh**. Two independent causes:

### 1.1 A bug that throws away a valid token on every load

`src/App.tsx:80` mounts `<SilentReconnect/>` as a *descendant* of `GoogleAuthProvider`.
React runs child effects before parent effects, so `useSilentReconnect`
(`src/hooks/useSilentReconnect.ts:41`) always observes `status === 'signed-out'` on a fresh
load — even when a valid access token is sitting in `localStorage`.

It therefore enters branch `[1]` (`useSilentReconnect.ts:55`) and calls `signIn()`, which calls
`requestAccessToken({ prompt: '' })`, and `src/lib/google/auth.ts:145` runs `forgetToken()`
**before** attempting the silent call:

```ts
if (!opts.prompt) forgetToken();   // auth.ts:145 — destroys a still-valid token
```

A perfectly good token is discarded, and the app gambles on a silent GIS call.

### 1.2 The silent call is structurally unreliable, and the ceiling is one hour

GIS's implicit token flow (`initTokenClient`) renews silently through a hidden iframe against
`accounts.google.com`, which requires third-party cookies. Under third-party-cookie blocking it
fails; the fallback auto-popup (`useSilentReconnect.ts:78`) is not user-gesture-initiated, so the
browser blocks it too — producing the "Backup paused — reconnect Google" banner.

Even with 1.1 fixed, the implicit flow issues **no refresh token** and tokens live ≤1h. A purely
client-side app therefore cannot avoid periodic re-auth.

### 1.3 Verified external constraints

Both quoted from Google's documentation, checked 2026-07-26:

> "A Google Cloud Platform project with an OAuth consent screen configured for an external user
> type and a publishing status of 'Testing' is issued a refresh token expiring in 7 days, unless
> the only OAuth scopes requested are a subset of name, email address, and user profile."
> — https://developers.google.com/identity/protocols/oauth2

> `https://www.googleapis.com/auth/drive.file` is listed under **Non-sensitive scopes**:
> "These scopes provide the smallest scope of authorization and only require basic OAuth App
> Verification."
> — https://developers.google.com/drive/api/guides/api-specific-auth

`docs/google-setup.md:15` confirms this project's consent screen is in **Testing**.

**Consequence:** the refresh-token architecture only delivers a permanent connection if the
consent screen is published to *In production*. Because `drive.file` is non-sensitive, that
requires only basic branding verification — no security assessment. The user has agreed to do this.

Remaining refresh-token expiry causes, per the same page, and why they do not apply here: user
revokes access (deliberate); unused for six months (daily use); password change with **Gmail**
scopes (not requested); too many live refresh tokens (single user); admin policy (no Workspace).

---

## 2. Goal and success criteria

**Done means:** the user connects Google once and never sees a reconnect prompt again — across
page refreshes, browser restarts, and days of use — while their financial data continues to never
leave their device.

**The check that proves it** (run before claiming done):

1. Connect once. Hard-refresh the app 5 times. **Zero** prompts, **zero** reconnect banners, and
   the sync pill shows `synced` each time.
2. Force the cached access token past its expiry. The next backup succeeds with no user
   interaction (silent server-side refresh).
3. Go offline. No reconnect banner appears; the sync state reads as offline/queued, not revoked.
4. Delete the session cookie. The reconnect affordance appears — **exactly then and not before**.
5. `npm run typecheck` and the Vitest suite pass, with nothing weakened to get there.

---

## 3. Architecture

OAuth 2.0 **authorization-code flow with PKCE**, with the client secret and refresh token held by
serverless functions on the existing Vercel deployment. The SPA holds only short-lived access
tokens, in memory.

### 3.1 Server modules

All logic lives in pure modules; the Vercel function files are thin adapters. This exists so one
implementation serves three consumers — Vitest, Vercel, and the Vite dev server.

```
api/_lib/env.ts        Validate + expose server env. Throws loudly if anything is missing.
api/_lib/oauth.ts      buildAuthorizeUrl · exchangeCode · refreshAccessToken · revokeToken.
                       Pure; `fetch` injected for testability. No cookie/HTTP knowledge.
api/_lib/session.ts    sealSession / openSession. AES-256-GCM via node:crypto.
                       Pure; no HTTP knowledge.
api/_lib/cookies.ts    serializeCookie / parseCookieHeader. Pure.
api/_lib/handlers.ts   handleStart · handleCallback · handleToken · handleSignout.
                       Signature: (req: ApiRequest) => Promise<ApiResponse>
                       where ApiRequest  = { method, url, headers }
                             ApiResponse = { status, headers, body }
                       No framework types — this is what the tests exercise.
api/auth/start.ts      Vercel adapter (~5 lines) → handleStart
api/auth/callback.ts   Vercel adapter → handleCallback
api/auth/token.ts      Vercel adapter → handleToken
api/auth/signout.ts    Vercel adapter → handleSignout
```

`vite-dev-api.ts` — a small Vite plugin using `configureServer` to mount the same four handlers on
the dev server, so `npm run dev` remains one command and needs no `vercel dev`.

### 3.2 Endpoints

| Endpoint | Method | Behaviour |
|---|---|---|
| `/api/auth/start` | GET | Generate `state` (32 random bytes) and PKCE `verifier` (32 random bytes). Set both as httpOnly cookies, `Max-Age=600`, `Path=/api/auth`. 302 to Google's authorize URL. |
| `/api/auth/callback` | GET | Verify `state` against the cookie in constant time. Exchange `code` + `verifier` + client secret for tokens. Fetch the account email once via Drive `about`. Seal `{refreshToken, email}` into the session cookie. Clear the two temp cookies. 302 to `/settings?connected=1`. |
| `/api/auth/token` | POST | Open the session cookie, call Google's token endpoint with `grant_type=refresh_token`, return `{accessToken, expiresAt, email}`. **Never returns the refresh token.** |
| `/api/auth/signout` | POST | Best-effort revoke at Google, clear the session cookie, 204. |

Authorize URL parameters: `client_id`, `redirect_uri`, `response_type=code`,
`scope=https://www.googleapis.com/auth/drive.file`, `access_type=offline`, `prompt=consent`,
`include_granted_scopes=true`, `state`, `code_challenge`, `code_challenge_method=S256`.

`prompt=consent` is deliberate: Google returns a `refresh_token` only on first authorization
unless consent is re-requested. Forcing it makes re-connection reliable rather than
silently token-less.

Google endpoints: authorize `https://accounts.google.com/o/oauth2/v2/auth`,
token `https://oauth2.googleapis.com/token`, revoke `https://oauth2.googleapis.com/revoke`.

### 3.3 Session cookie

- **Name:** `argent_session`
- **Value:** `base64url(iv(12 bytes) ‖ ciphertext ‖ authTag(16 bytes))`
- **Plaintext:** `{"v":1,"rt":"<refresh token>","em":"<email|null>"}`
- **Cipher:** AES-256-GCM, key = 32 bytes decoded from `SESSION_SECRET` (base64). Length validated
  at startup; a wrong-length secret fails loudly rather than silently truncating.
- **Flags:** `HttpOnly; SameSite=Lax; Path=/; Max-Age=34560000` (400 days — the browser cap),
  plus `Secure` whenever `APP_ORIGIN` is https.

`SameSite=Lax` is required, not merely chosen: the OAuth callback is a cross-site top-level GET
navigation, which `Strict` would strip.

### 3.4 Client changes

`src/lib/google/auth.ts` **keeps its exported surface** — `getValidAccessToken`,
`withTokenRefresh`, `revokeAccessToken`, `clearCachedAccessToken`. Consequence:
`src/lib/google/drive.ts`, `src/lib/google/picker.ts`, `src/components/GoogleAutoBackup.tsx` and
`src/features/settings/GoogleSync.tsx` need **no changes to their Drive logic**.

Internals are replaced: GIS token client → `POST /api/auth/token`, with an in-memory cache
(60s expiry skew, as today) and in-flight de-duplication (the existing `silentInflight` pattern
is retained).

**Deleted:**

- `src/hooks/useSilentReconnect.ts` — the entire four-state machine.
- `<SilentReconnect/>` and its wrapper, `src/App.tsx:64-67` and `:80`.
- The GIS token client, `pending`-slot machinery and 12-second timeout in `auth.ts`.
- `loadGsi()` in `src/lib/google/loadScripts.ts` — now dead. `loadPicker()` stays; verified at
  `picker.ts:41` that the Picker only needs an OAuth token parameter plus `GOOGLE_API_KEY`, and
  never touches GIS.
- localStorage keys `argent.google.token` and `argent.google.tokenExpiresAt` — an access token in
  localStorage is XSS-exfiltrable and the httpOnly cookie makes it unnecessary.
- localStorage key `argent.google.email` — the email now comes from the server.

A one-time cleanup removes all three keys on first load of the new version.

`src/store/GoogleAuthContext.tsx` simplifies: on mount, one `POST /api/auth/token` probe
establishes `status`. `signIn()` becomes `window.location.assign('/api/auth/start')` — a full-page
redirect, which is precisely what cannot be popup-blocked. `signOut()` posts to
`/api/auth/signout`.

`isGoogleConfigured()` in `src/lib/google/env.ts` is **unchanged** — it still requires both
`VITE_` vars. `VITE_GOOGLE_API_KEY` remains genuinely required by the Picker; keeping the
`VITE_GOOGLE_CLIENT_ID` check costs nothing and avoids introducing a tri-state "configured"
during boot. The server validates its own env independently.

`GoogleSync.tsx:54-57` awaits `signIn()`; after this change that promise never resolves because
the page navigates away. Harmless, but `signIn` will be typed `Promise<never>` and documented so
the behaviour is intentional rather than accidental.

### 3.5 State model — the core UX fix

Today, offline and revoked are indistinguishable, so a network blip nags the user. They are
separated into three distinct outcomes with three distinct typed errors:

| `/api/auth/token` result | Client error | UI |
|---|---|---|
| Network failure (`TypeError`) | `AuthOfflineError` | Offline; backup stays queued. **No banner, no toast.** |
| `500` / `502` | `AuthTransientError` | Retry with backoff. **No banner.** |
| `401` | `AuthRevokedError` | Refresh token genuinely revoked. **This alone** sets `needsReconnect`. |
| `503` (server env missing) | `AuthNotConfiguredError` | Surfaced in Settings only. |

Server error mapping: no/undecryptable session cookie → `401 {error:"no-session"}`; Google returns
`invalid_grant` → `401 {error:"revoked"}` **and clears the session cookie**; any other upstream
failure → `502 {error:"upstream"}`.

`GoogleAutoBackup.tsx:129` already re-arms on `TypeError`, so queued-backup behaviour needs no
change once the error types are distinct.

---

## 4. Infrastructure changes

### 4.1 `vercel.json` — routing

The current rewrite swallows every API call:

```jsonc
"rewrites": [{ "source": "/((?!assets/).*)", "destination": "/index.html" }]
```

Becomes:

```jsonc
"rewrites": [{ "source": "/((?!api/|assets/).*)", "destination": "/index.html" }]
```

`Cross-Origin-Opener-Policy: same-origin-allow-popups` existed for the GIS popup and can be
dropped once GIS auth is gone; it is left in place in this change to keep one cause per change.

### 4.2 `vite.config.ts` — service worker

`registerType: 'autoUpdate'` gives Workbox a default `navigateFallback` of `index.html` that
applies to navigation requests. `/api/auth/start` and `/api/auth/callback` **are** navigations, so
the service worker would serve cached HTML instead of reaching the server — breaking sign-in in
exactly the installed-PWA case that matters most. Required:

```ts
workbox: {
  globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
  navigateFallbackDenylist: [/^\/api\//],
}
```

No runtime caching entry is added for `/api/*`, so those requests stay uncached.

### 4.3 Environment variables

| Name | Where | Notes |
|---|---|---|
| `GOOGLE_CLIENT_SECRET` | Vercel (server) + local `.env` | **Never** `VITE_`-prefixed — that would ship it in the browser bundle. |
| `SESSION_SECRET` | Vercel (server) + local `.env` | 32 random bytes, base64. Generated during implementation. |
| `APP_ORIGIN` | Vercel (server) + local `.env` | e.g. `http://localhost:5173`. The redirect URI is built from this. |
| `VITE_GOOGLE_CLIENT_ID` | existing | unchanged |
| `VITE_GOOGLE_API_KEY` | existing | unchanged, still required by the Picker |

The redirect URI is `${APP_ORIGIN}/api/auth/callback`, derived from the env var and **never** from
the request `Host` header — trusting `Host` would be a host-header-injection open redirect.

`.gitignore` already covers `.env` and `client_secret_*.json`, and `git ls-files` confirms neither
is tracked. `.env.example` gains the three new names with empty values.

### 4.4 Manual steps the user must perform in Google Cloud Console

These cannot be automated and block production from working:

1. **OAuth consent screen → Publish app** (Testing → In production). Without this the refresh
   token expires every 7 days (§1.3).
2. **Credentials → OAuth client → Authorized redirect URIs**, add:
   - `http://localhost:5173/api/auth/callback`
   - `https://<production-domain>/api/auth/callback`
   The client currently registers **no** redirect URIs — only `http://localhost:5173` as a
   JavaScript origin — so the code flow would fail with `redirect_uri_mismatch` as things stand.
3. **Vercel → Settings → Environment Variables**, add the three server variables from §4.3 to
   both Production and Preview.

To be written as a checklist in `docs/google-setup.md`.

**Open item:** the production domain is not recorded anywhere in the repo. Code does not need it
(it is an env var), but the checklist does. It will be left as `<production-domain>` until
supplied.

---

## 5. Testing

Vitest + happy-dom, added as part of this project (the repo currently has no test runner at all).
Every item written RED first and confirmed to fail for the expected reason before implementation.

**`session.test.ts`** — seal/open round-trip preserves refresh token and email; a flipped
ciphertext byte returns `null` rather than throwing; a different key returns `null`; a
wrong-length `SESSION_SECRET` throws at startup.

**`oauth.test.ts`** — authorize URL carries `access_type=offline`, `prompt=consent`,
`code_challenge_method=S256`, the `drive.file` scope and the state; the PKCE challenge is the
base64url SHA-256 of the verifier; the code exchange posts the correct form body (fetch mocked);
Google's `invalid_grant` maps to a typed revoked-error distinct from a network error.

**`handlers.test.ts`** — `start` sets both temp cookies and 302s to `accounts.google.com`;
`callback` with a mismatched state returns 400 **and sets no session cookie**; the happy path sets
the session cookie with `HttpOnly` and `SameSite=Lax`; `token` with no cookie returns 401; `token`
with a valid cookie returns 200 — with an **explicit assertion that the serialized response body
never contains the refresh-token string**; `token` on `invalid_grant` returns 401 and clears the
cookie.

**`clientAuth.test.ts`** — `getValidAccessToken` serves from cache until the expiry skew;
concurrent calls make exactly one network request; 401 throws `AuthRevokedError`; a network
failure throws `AuthOfflineError` (so that offline never renders as "reconnect").

---

## 6. Verification

"It ran" is not verification, and the claim here is a user-facing one, so it is checked at that
layer via Chrome DevTools against the running app — executing §2's five checks and reporting what
was observed, including anything that could not be checked.

Check 1 (refresh loop) and check 4 (deleted cookie) are the two that directly falsify the original
complaint; check 3 (offline) guards the regression this design is most likely to introduce.

---

## 7. Out of scope

- The whole-app redesign — Project B, separate spec.
- Removing `Cross-Origin-Opener-Policy` (§4.1) — deliberately deferred to keep one cause per change.
- Changing any Drive backup/restore/pull logic. `GoogleAutoBackup.tsx` is touched only if the
  error-type separation requires it.
