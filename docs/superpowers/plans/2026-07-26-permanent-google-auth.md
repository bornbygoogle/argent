# Permanent Google Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Google Identity Services implicit-token flow with an OAuth 2.0 authorization-code flow held by Vercel serverless functions, so the user connects Google once and never sees a reconnect prompt again.

**Architecture:** Four serverless functions under `api/auth/` own the client secret and a refresh token sealed in an httpOnly cookie. All logic lives in pure modules under `api/_lib/` with a Web-standard `(Request) => Promise<Response>` handler signature, so one implementation is exercised by Vitest, served by Vercel, and mounted on the Vite dev server. The SPA holds only short-lived access tokens, in memory, fetched from `POST /api/auth/token`.

**Tech Stack:** TypeScript 5.6, Vercel Node.js runtime (Web signature), `node:crypto` (AES-256-GCM, SHA-256 PKCE), Vitest 2 + happy-dom, React 18, Vite 5, vite-plugin-pwa.

**Spec:** `docs/superpowers/specs/2026-07-26-permanent-google-auth-design.md`

## Global Constraints

- **`api/` files must use relative imports only.** Vercel's Node runtime does not support tsconfig "Path Mappings" or "Project References" for files in `/api`. The `@/` alias works in `src/` only.
- **Handler signature is Web-standard:** `export default { async fetch(request: Request): Promise<Response> }`.
- **Never prefix a server secret with `VITE_`.** That ships it in the browser bundle. `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `APP_ORIGIN` are server-only.
- **Never log a token value**, not even truncated, not even in a `console.warn`.
- **Redirect URI is always `${APP_ORIGIN}/api/auth/callback`**, built from the env var, never from the request `Host` header.
- **Scope is exactly** `https://www.googleapis.com/auth/drive.file` — unchanged from today.
- **Session cookie name:** `argent_session`. **Temp cookies:** `argent_oauth_state`, `argent_oauth_verifier`.
- **TDD is mandatory.** Every task writes the failing test first and confirms it fails for the expected reason before implementing. Never weaken a test to make it pass.
- **Commit after each task**, only when that task's tests pass.
- Branch: `feat/permanent-google-auth` (already created).

---

### Task 1: Vitest harness + session sealing

The repo has no test runner at all. This task adds one and uses it immediately for the most security-critical pure function.

**Files:**
- Modify: `package.json` (devDependencies + scripts)
- Create: `vitest.config.ts`
- Create: `api/_lib/session.ts`
- Test: `api/_lib/session.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces:
  - `interface SessionData { rt: string; em: string | null }`
  - `loadKey(secret: string | undefined): Buffer` — throws `Error` if missing or not 32 bytes base64
  - `sealSession(data: SessionData, key: Buffer): string`
  - `openSession(sealed: string, key: Buffer): SessionData | null`

- [ ] **Step 1: Install the test runner**

```bash
npm install --save-dev vitest@^2.1.0 happy-dom@^15.0.0 @testing-library/react@^16.0.0
```

- [ ] **Step 2: Add test scripts to `package.json`**

In the `"scripts"` block, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `vitest.config.ts`**

Two environments: `api/` code is pure Node, `src/` code needs a DOM.

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environmentMatchGlobs: [
      ['api/**', 'node'],
      ['src/**', 'happy-dom'],
    ],
    include: ['api/**/*.test.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
```

- [ ] **Step 4: Write the failing test**

Create `api/_lib/session.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { loadKey, sealSession, openSession } from './session';

const key = () => randomBytes(32);
const b64 = (b: Buffer) => b.toString('base64');

describe('loadKey', () => {
  it('accepts a 32-byte base64 secret', () => {
    const raw = randomBytes(32);
    expect(loadKey(b64(raw)).equals(raw)).toBe(true);
  });

  it('throws when the secret is missing', () => {
    expect(() => loadKey(undefined)).toThrow(/SESSION_SECRET/);
  });

  it('throws when the secret is the wrong length', () => {
    expect(() => loadKey(b64(randomBytes(16)))).toThrow(/32 bytes/);
  });
});

describe('sealSession / openSession', () => {
  it('round-trips the refresh token and email', () => {
    const k = key();
    const sealed = sealSession({ rt: 'refresh-abc', em: 'me@example.com' }, k);
    expect(openSession(sealed, k)).toEqual({ rt: 'refresh-abc', em: 'me@example.com' });
  });

  it('round-trips a null email', () => {
    const k = key();
    const sealed = sealSession({ rt: 'refresh-abc', em: null }, k);
    expect(openSession(sealed, k)).toEqual({ rt: 'refresh-abc', em: null });
  });

  it('never emits the refresh token in cleartext', () => {
    const sealed = sealSession({ rt: 'refresh-abc', em: null }, key());
    expect(sealed).not.toContain('refresh-abc');
  });

  it('returns null when the ciphertext is tampered with', () => {
    const k = key();
    const sealed = sealSession({ rt: 'refresh-abc', em: null }, k);
    const raw = Buffer.from(sealed, 'base64url');
    raw[20] ^= 0xff; // flip a byte inside the ciphertext
    expect(openSession(raw.toString('base64url'), k)).toBeNull();
  });

  it('returns null under a different key', () => {
    const sealed = sealSession({ rt: 'refresh-abc', em: null }, key());
    expect(openSession(sealed, key())).toBeNull();
  });

  it('returns null on garbage input', () => {
    expect(openSession('not-a-real-cookie', key())).toBeNull();
    expect(openSession('', key())).toBeNull();
  });
});
```

- [ ] **Step 5: Run the test and confirm it fails for the expected reason**

```bash
npm test -- api/_lib/session.test.ts
```

Expected: FAIL — `Failed to resolve import "./session"`. If it fails for any other reason, stop and diagnose before continuing.

- [ ] **Step 6: Implement `api/_lib/session.ts`**

```ts
// Seals the Google refresh token into an httpOnly cookie value using
// AES-256-GCM. The refresh token never reaches the browser's JavaScript;
// only this opaque sealed string does, and only the server holds the key.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface SessionData {
  /** Google refresh token. */
  rt: string;
  /** Account email, for display only. */
  em: string | null;
}

const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = 1;

/** Decode + validate SESSION_SECRET. Fails loudly rather than silently truncating. */
export function loadKey(secret: string | undefined): Buffer {
  if (!secret) throw new Error('SESSION_SECRET is not set');
  const key = Buffer.from(secret, 'base64');
  if (key.length !== 32) {
    throw new Error(`SESSION_SECRET must decode to 32 bytes, got ${key.length}`);
  }
  return key;
}

export function sealSession(data: SessionData, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify({ v: VERSION, rt: data.rt, em: data.em }), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString('base64url');
}

export function openSession(sealed: string, key: Buffer): SessionData | null {
  // A null return is the contract for "this cookie is not usable" — tampered,
  // wrong key, truncated, or from an older format. Callers treat it as
  // "no session", which is exactly right for all of those cases.
  try {
    const raw = Buffer.from(sealed, 'base64url');
    if (raw.length <= IV_BYTES + TAG_BYTES) return null;
    const iv = raw.subarray(0, IV_BYTES);
    const ciphertext = raw.subarray(IV_BYTES, raw.length - TAG_BYTES);
    const tag = raw.subarray(raw.length - TAG_BYTES);

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    const parsed: unknown = JSON.parse(plaintext.toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const o = parsed as Record<string, unknown>;
    if (o.v !== VERSION || typeof o.rt !== 'string' || o.rt.length === 0) return null;
    return { rt: o.rt, em: typeof o.em === 'string' ? o.em : null };
  } catch {
    return null;
  }
}
```

- [ ] **Step 7: Run the tests and confirm they pass**

```bash
npm test -- api/_lib/session.test.ts
```

Expected: PASS, 9 tests.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts api/_lib/session.ts api/_lib/session.test.ts
git commit -m "test: add vitest harness; feat: AES-256-GCM session sealing"
```

---

### Task 2: Server env + cookie helpers

**Files:**
- Create: `api/_lib/env.ts`
- Create: `api/_lib/cookies.ts`
- Test: `api/_lib/cookies.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface ServerEnv { clientId: string; clientSecret: string; appOrigin: string; sessionKey: Buffer; redirectUri: string }`
  - `readEnv(source?: Record<string, string | undefined>): ServerEnv` — throws listing every missing name
  - `SESSION_COOKIE`, `STATE_COOKIE`, `VERIFIER_COOKIE` string constants
  - `serializeCookie(name: string, value: string, opts: CookieOptions): string`
  - `parseCookies(header: string | null): Record<string, string>`
  - `interface CookieOptions { maxAge: number; secure: boolean; path?: string; httpOnly?: boolean; sameSite?: 'Lax' | 'Strict' }`

- [ ] **Step 1: Write the failing test**

Create `api/_lib/cookies.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { serializeCookie, parseCookies, SESSION_COOKIE } from './cookies';

describe('serializeCookie', () => {
  it('emits the security flags', () => {
    const c = serializeCookie(SESSION_COOKIE, 'abc', { maxAge: 600, secure: true });
    expect(c).toContain('argent_session=abc');
    expect(c).toContain('HttpOnly');
    expect(c).toContain('Secure');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Path=/');
    expect(c).toContain('Max-Age=600');
  });

  it('omits Secure on an insecure origin so localhost works', () => {
    const c = serializeCookie(SESSION_COOKIE, 'abc', { maxAge: 600, secure: false });
    expect(c).not.toContain('Secure');
  });

  it('honours a custom path', () => {
    const c = serializeCookie('x', 'y', { maxAge: 60, secure: true, path: '/api/auth' });
    expect(c).toContain('Path=/api/auth');
  });

  it('encodes the value', () => {
    expect(serializeCookie('x', 'a b;c', { maxAge: 1, secure: false })).toContain('x=a%20b%3Bc');
  });

  it('expires the cookie when maxAge is 0', () => {
    expect(serializeCookie('x', '', { maxAge: 0, secure: false })).toContain('Max-Age=0');
  });
});

describe('parseCookies', () => {
  it('parses several cookies', () => {
    expect(parseCookies('a=1; b=2; argent_session=xyz')).toEqual({
      a: '1', b: '2', argent_session: 'xyz',
    });
  });

  it('decodes values', () => {
    expect(parseCookies('x=a%20b')).toEqual({ x: 'a b' });
  });

  it('returns an empty object for a missing header', () => {
    expect(parseCookies(null)).toEqual({});
    expect(parseCookies('')).toEqual({});
  });

  it('ignores malformed pairs', () => {
    expect(parseCookies('novalue; a=1')).toEqual({ a: '1' });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npm test -- api/_lib/cookies.test.ts
```

Expected: FAIL — cannot resolve `./cookies`.

- [ ] **Step 3: Implement `api/_lib/cookies.ts`**

```ts
export const SESSION_COOKIE = 'argent_session';
export const STATE_COOKIE = 'argent_oauth_state';
export const VERIFIER_COOKIE = 'argent_oauth_verifier';

/** 400 days — the maximum lifetime browsers will honour for a cookie. */
export const SESSION_MAX_AGE = 34_560_000;
/** Temp OAuth cookies only need to survive the consent round-trip. */
export const OAUTH_TEMP_MAX_AGE = 600;

export interface CookieOptions {
  maxAge: number;
  secure: boolean;
  path?: string;
  httpOnly?: boolean;
  sameSite?: 'Lax' | 'Strict';
}

export function serializeCookie(name: string, value: string, opts: CookieOptions): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opts.path ?? '/'}`);
  parts.push(`Max-Age=${opts.maxAge}`);
  // SameSite=Lax is required, not merely preferred: the OAuth callback is a
  // cross-site top-level GET navigation, which Strict would strip.
  parts.push(`SameSite=${opts.sameSite ?? 'Lax'}`);
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  return parts.join('; ');
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    if (eq < 1) continue;
    const name = pair.slice(0, eq).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(pair.slice(eq + 1).trim());
    } catch {
      out[name] = pair.slice(eq + 1).trim();
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npm test -- api/_lib/cookies.test.ts
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Implement `api/_lib/env.ts`**

No test file: this is a validation shim with no branching logic worth pinning, and Task 4's handler tests inject env directly.

```ts
import { loadKey } from './session';

export interface ServerEnv {
  clientId: string;
  clientSecret: string;
  appOrigin: string;
  sessionKey: Buffer;
  redirectUri: string;
  secure: boolean;
}

/**
 * Read + validate server-side config. Throws listing EVERY missing name at once,
 * so a misconfigured deploy is diagnosable from a single error.
 * Never prefix these with VITE_ — that would ship them in the browser bundle.
 */
export function readEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const clientId = source.VITE_GOOGLE_CLIENT_ID?.trim();
  const clientSecret = source.GOOGLE_CLIENT_SECRET?.trim();
  const appOrigin = source.APP_ORIGIN?.trim().replace(/\/$/, '');

  const missing: string[] = [];
  if (!clientId) missing.push('VITE_GOOGLE_CLIENT_ID');
  if (!clientSecret) missing.push('GOOGLE_CLIENT_SECRET');
  if (!appOrigin) missing.push('APP_ORIGIN');
  if (!source.SESSION_SECRET) missing.push('SESSION_SECRET');
  if (missing.length > 0) throw new Error(`Missing server env: ${missing.join(', ')}`);

  return {
    clientId: clientId!,
    clientSecret: clientSecret!,
    appOrigin: appOrigin!,
    sessionKey: loadKey(source.SESSION_SECRET),
    redirectUri: `${appOrigin!}/api/auth/callback`,
    secure: appOrigin!.startsWith('https://'),
  };
}
```

- [ ] **Step 6: Run the whole suite**

```bash
npm test
```

Expected: PASS, 18 tests across two files.

- [ ] **Step 7: Commit**

```bash
git add api/_lib/cookies.ts api/_lib/cookies.test.ts api/_lib/env.ts
git commit -m "feat: server env validation and cookie helpers"
```

---

### Task 3: OAuth module (PKCE, authorize URL, token exchange, refresh, revoke)

**Files:**
- Create: `api/_lib/oauth.ts`
- Test: `api/_lib/oauth.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `DRIVE_FILE_SCOPE: string`
  - `class OAuthRevokedError extends Error` — Google said `invalid_grant`; the grant is dead
  - `class OAuthUpstreamError extends Error` — any other upstream failure; transient
  - `createVerifier(): string`, `createState(): string`, `challengeFor(verifier: string): string`
  - `buildAuthorizeUrl(o: { clientId: string; redirectUri: string; state: string; challenge: string }): string`
  - `exchangeCode(o: { code, clientId, clientSecret, redirectUri, verifier }, f?: typeof fetch): Promise<{ accessToken: string; refreshToken: string | null; expiresIn: number }>`
  - `refreshAccessToken(o: { refreshToken, clientId, clientSecret }, f?: typeof fetch): Promise<{ accessToken: string; expiresIn: number }>`
  - `fetchEmail(accessToken: string, f?: typeof fetch): Promise<string | null>`
  - `revokeToken(token: string, f?: typeof fetch): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `api/_lib/oauth.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  DRIVE_FILE_SCOPE, OAuthRevokedError, OAuthUpstreamError,
  createVerifier, createState, challengeFor, buildAuthorizeUrl,
  exchangeCode, refreshAccessToken, fetchEmail,
} from './oauth';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('PKCE', () => {
  it('generates a distinct high-entropy verifier each call', () => {
    const a = createVerifier();
    const b = createVerifier();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, no padding
  });

  it('derives the challenge as base64url SHA-256 of the verifier', () => {
    const v = 'fixed-verifier-value';
    expect(challengeFor(v)).toBe(createHash('sha256').update(v).digest('base64url'));
  });

  it('generates a distinct state each call', () => {
    expect(createState()).not.toBe(createState());
  });
});

describe('buildAuthorizeUrl', () => {
  const url = () => new URL(buildAuthorizeUrl({
    clientId: 'cid', redirectUri: 'https://app.test/api/auth/callback',
    state: 'st', challenge: 'ch',
  }));

  it('points at Google', () => {
    expect(url().origin + url().pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
  });

  it('requests offline access so a refresh token is issued', () => {
    expect(url().searchParams.get('access_type')).toBe('offline');
  });

  it('forces consent so the refresh token is returned on every reconnect', () => {
    expect(url().searchParams.get('prompt')).toBe('consent');
  });

  it('uses PKCE S256', () => {
    expect(url().searchParams.get('code_challenge')).toBe('ch');
    expect(url().searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('requests exactly the drive.file scope', () => {
    expect(url().searchParams.get('scope')).toBe(DRIVE_FILE_SCOPE);
    expect(DRIVE_FILE_SCOPE).toBe('https://www.googleapis.com/auth/drive.file');
  });

  it('carries the state and redirect uri', () => {
    expect(url().searchParams.get('state')).toBe('st');
    expect(url().searchParams.get('redirect_uri')).toBe('https://app.test/api/auth/callback');
    expect(url().searchParams.get('response_type')).toBe('code');
  });
});

describe('exchangeCode', () => {
  it('posts the full form body including the PKCE verifier', async () => {
    const f = vi.fn().mockResolvedValue(
      jsonResponse({ access_token: 'at', refresh_token: 'rt', expires_in: 3599 }));
    const out = await exchangeCode({
      code: 'c', clientId: 'cid', clientSecret: 'sec',
      redirectUri: 'https://app.test/api/auth/callback', verifier: 'ver',
    }, f as unknown as typeof fetch);

    expect(out).toEqual({ accessToken: 'at', refreshToken: 'rt', expiresIn: 3599 });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect(init.method).toBe('POST');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('c');
    expect(body.get('code_verifier')).toBe('ver');
    expect(body.get('client_secret')).toBe('sec');
  });

  it('returns a null refresh token when Google omits one', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse({ access_token: 'at', expires_in: 3599 }));
    const out = await exchangeCode({
      code: 'c', clientId: 'cid', clientSecret: 'sec', redirectUri: 'r', verifier: 'v',
    }, f as unknown as typeof fetch);
    expect(out.refreshToken).toBeNull();
  });

  it('throws OAuthUpstreamError on a non-OK response', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse({ error: 'invalid_request' }, 400));
    await expect(exchangeCode({
      code: 'c', clientId: 'cid', clientSecret: 'sec', redirectUri: 'r', verifier: 'v',
    }, f as unknown as typeof fetch)).rejects.toBeInstanceOf(OAuthUpstreamError);
  });
});

describe('refreshAccessToken', () => {
  it('posts grant_type=refresh_token and returns the new access token', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse({ access_token: 'fresh', expires_in: 3599 }));
    const out = await refreshAccessToken(
      { refreshToken: 'rt', clientId: 'cid', clientSecret: 'sec' }, f as unknown as typeof fetch);
    expect(out).toEqual({ accessToken: 'fresh', expiresIn: 3599 });
    const body = new URLSearchParams(f.mock.calls[0][1].body as string);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('rt');
  });

  it('maps invalid_grant to OAuthRevokedError, distinctly from a transient failure', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse({ error: 'invalid_grant' }, 400));
    await expect(refreshAccessToken(
      { refreshToken: 'rt', clientId: 'cid', clientSecret: 'sec' }, f as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(OAuthRevokedError);
  });

  it('maps a 500 to OAuthUpstreamError, NOT OAuthRevokedError', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse({ error: 'backend_error' }, 500));
    const err = await refreshAccessToken(
      { refreshToken: 'rt', clientId: 'cid', clientSecret: 'sec' }, f as unknown as typeof fetch,
    ).catch((e) => e);
    expect(err).toBeInstanceOf(OAuthUpstreamError);
    expect(err).not.toBeInstanceOf(OAuthRevokedError);
  });
});

describe('fetchEmail', () => {
  it('reads the address from the Drive about endpoint', async () => {
    const f = vi.fn().mockResolvedValue(
      jsonResponse({ user: { emailAddress: 'me@example.com', displayName: 'Me' } }));
    expect(await fetchEmail('at', f as unknown as typeof fetch)).toBe('me@example.com');
  });

  it('returns null rather than throwing when the lookup fails', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse({}, 403));
    expect(await fetchEmail('at', f as unknown as typeof fetch)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npm test -- api/_lib/oauth.test.ts
```

Expected: FAIL — cannot resolve `./oauth`.

- [ ] **Step 3: Implement `api/_lib/oauth.ts`**

```ts
// Google OAuth 2.0 authorization-code flow with PKCE. Pure: `fetch` is
// injectable so every branch is testable without network access.

import { createHash, randomBytes } from 'node:crypto';

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const ABOUT_URL = 'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)';

/** The grant is permanently dead — the user must re-consent. */
export class OAuthRevokedError extends Error {
  constructor() { super('oauth-revoked'); this.name = 'OAuthRevokedError'; }
}

/** Something upstream failed transiently. Retrying later is reasonable. */
export class OAuthUpstreamError extends Error {
  constructor(detail: string) { super(`oauth-upstream:${detail}`); this.name = 'OAuthUpstreamError'; }
}

export function createVerifier(): string { return randomBytes(32).toString('base64url'); }
export function createState(): string { return randomBytes(32).toString('base64url'); }
export function challengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function buildAuthorizeUrl(o: {
  clientId: string; redirectUri: string; state: string; challenge: string;
}): string {
  const p = new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    response_type: 'code',
    scope: DRIVE_FILE_SCOPE,
    // access_type=offline is what makes Google issue a refresh token at all.
    access_type: 'offline',
    // Google returns a refresh_token only on first authorization unless consent
    // is re-requested. Forcing it makes reconnection reliable rather than
    // silently token-less.
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: o.state,
    code_challenge: o.challenge,
    code_challenge_method: 'S256',
  });
  return `${AUTHORIZE_URL}?${p.toString()}`;
}

async function postToken(
  body: URLSearchParams, f: typeof fetch,
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  const res = await f(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    // invalid_grant is the one error that means "this refresh token is dead" —
    // everything else may succeed on retry, so the two must not be conflated.
    if (json.error === 'invalid_grant') throw new OAuthRevokedError();
    throw new OAuthUpstreamError(String(json.error ?? res.status));
  }
  if (typeof json.access_token !== 'string') throw new OAuthUpstreamError('no-access-token');
  return json as { access_token: string; refresh_token?: string; expires_in?: number };
}

export async function exchangeCode(o: {
  code: string; clientId: string; clientSecret: string; redirectUri: string; verifier: string;
}, f: typeof fetch = fetch): Promise<{ accessToken: string; refreshToken: string | null; expiresIn: number }> {
  const json = await postToken(new URLSearchParams({
    code: o.code,
    client_id: o.clientId,
    client_secret: o.clientSecret,
    redirect_uri: o.redirectUri,
    grant_type: 'authorization_code',
    code_verifier: o.verifier,
  }), f);
  return {
    accessToken: json.access_token,
    refreshToken: typeof json.refresh_token === 'string' ? json.refresh_token : null,
    expiresIn: Number(json.expires_in) || 3600,
  };
}

export async function refreshAccessToken(o: {
  refreshToken: string; clientId: string; clientSecret: string;
}, f: typeof fetch = fetch): Promise<{ accessToken: string; expiresIn: number }> {
  const json = await postToken(new URLSearchParams({
    client_id: o.clientId,
    client_secret: o.clientSecret,
    refresh_token: o.refreshToken,
    grant_type: 'refresh_token',
  }), f);
  return { accessToken: json.access_token, expiresIn: Number(json.expires_in) || 3600 };
}

/** Display-only lookup. Never fatal: a missing email must not block sign-in. */
export async function fetchEmail(accessToken: string, f: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await f(ABOUT_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const json = (await res.json()) as { user?: { emailAddress?: string } };
    return json.user?.emailAddress ?? null;
  } catch {
    return null;
  }
}

/** Best-effort revoke on sign-out. Never throws — sign-out must always succeed locally. */
export async function revokeToken(token: string, f: typeof fetch = fetch): Promise<void> {
  try {
    await f(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
    });
  } catch {
    /* the local cookie is cleared regardless */
  }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npm test -- api/_lib/oauth.test.ts
```

Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/oauth.ts api/_lib/oauth.test.ts
git commit -m "feat: Google OAuth code flow with PKCE, typed revoked vs transient errors"
```

---

### Task 4: Request handlers

**Files:**
- Create: `api/_lib/handlers.ts`
- Test: `api/_lib/handlers.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces:
  - `interface Deps { env: ServerEnv; fetchImpl?: typeof fetch }`
  - `handleStart(request: Request, deps: Deps): Promise<Response>`
  - `handleCallback(request: Request, deps: Deps): Promise<Response>`
  - `handleToken(request: Request, deps: Deps): Promise<Response>`
  - `handleSignout(request: Request, deps: Deps): Promise<Response>`

- [ ] **Step 1: Write the failing test**

Create `api/_lib/handlers.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { handleStart, handleCallback, handleToken, handleSignout } from './handlers';
import { sealSession } from './session';
import type { ServerEnv } from './env';

const sessionKey = randomBytes(32);
const env: ServerEnv = {
  clientId: 'cid',
  clientSecret: 'sec',
  appOrigin: 'https://app.test',
  sessionKey,
  redirectUri: 'https://app.test/api/auth/callback',
  secure: true,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const setCookies = (r: Response) => r.headers.getSetCookie();
const cookieNamed = (r: Response, name: string) =>
  setCookies(r).find((c) => c.startsWith(`${name}=`));

describe('handleStart', () => {
  it('redirects to Google and plants both temp cookies', async () => {
    const res = await handleStart(new Request('https://app.test/api/auth/start'), { env });
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.origin).toBe('https://accounts.google.com');
    expect(loc.searchParams.get('access_type')).toBe('offline');

    const state = cookieNamed(res, 'argent_oauth_state');
    const verifier = cookieNamed(res, 'argent_oauth_verifier');
    expect(state).toContain('HttpOnly');
    expect(verifier).toContain('HttpOnly');
    expect(state).toContain('Max-Age=600');
  });

  it('sends a state that matches the cookie it set', async () => {
    const res = await handleStart(new Request('https://app.test/api/auth/start'), { env });
    const cookieState = decodeURIComponent(
      cookieNamed(res, 'argent_oauth_state')!.split(';')[0].split('=')[1]);
    const urlState = new URL(res.headers.get('location')!).searchParams.get('state');
    expect(urlState).toBe(cookieState);
  });
});

describe('handleCallback', () => {
  const callbackReq = (qs: string, cookie: string) =>
    new Request(`https://app.test/api/auth/callback?${qs}`, { headers: { cookie } });

  it('rejects a mismatched state and sets NO session cookie', async () => {
    const res = await handleCallback(
      callbackReq('code=c&state=attacker', 'argent_oauth_state=real; argent_oauth_verifier=v'),
      { env });
    expect(res.status).toBe(400);
    expect(cookieNamed(res, 'argent_session')).toBeUndefined();
  });

  it('rejects a missing state cookie', async () => {
    const res = await handleCallback(callbackReq('code=c&state=s', ''), { env });
    expect(res.status).toBe(400);
    expect(cookieNamed(res, 'argent_session')).toBeUndefined();
  });

  it('surfaces a user denial without setting a session', async () => {
    const res = await handleCallback(
      callbackReq('error=access_denied&state=s', 'argent_oauth_state=s; argent_oauth_verifier=v'),
      { env });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('google=denied');
    expect(cookieNamed(res, 'argent_session')).toBeUndefined();
  });

  it('on success seals the session, clears temp cookies, and redirects home', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'at', refresh_token: 'rt', expires_in: 3599 }))
      .mockResolvedValueOnce(json({ user: { emailAddress: 'me@example.com' } }));

    const res = await handleCallback(
      callbackReq('code=c&state=s', 'argent_oauth_state=s; argent_oauth_verifier=v'),
      { env, fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://app.test/settings?google=connected');

    const session = cookieNamed(res, 'argent_session')!;
    expect(session).toContain('HttpOnly');
    expect(session).toContain('Secure');
    expect(session).toContain('SameSite=Lax');
    expect(session).toContain('Max-Age=34560000');
    // The refresh token must be sealed, never readable in the header.
    expect(session).not.toContain('rt;');
    expect(cookieNamed(res, 'argent_oauth_state')).toContain('Max-Age=0');
  });

  it('fails closed when Google returns no refresh token', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'at', expires_in: 3599 }));
    const res = await handleCallback(
      callbackReq('code=c&state=s', 'argent_oauth_state=s; argent_oauth_verifier=v'),
      { env, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('google=norefresh');
    expect(cookieNamed(res, 'argent_session')).toBeUndefined();
  });
});

describe('handleToken', () => {
  const tokenReq = (cookie: string, origin = 'https://app.test') =>
    new Request('https://app.test/api/auth/token', {
      method: 'POST', headers: { cookie, origin },
    });

  it('401s with no session cookie', async () => {
    const res = await handleToken(tokenReq(''), { env });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'no-session' });
  });

  it('401s on an unopenable session cookie', async () => {
    const res = await handleToken(tokenReq('argent_session=garbage'), { env });
    expect(res.status).toBe(401);
  });

  it('rejects a cross-origin request', async () => {
    const sealed = sealSession({ rt: 'rt', em: null }, sessionKey);
    const res = await handleToken(
      tokenReq(`argent_session=${sealed}`, 'https://evil.test'), { env });
    expect(res.status).toBe(403);
  });

  it('rejects a non-POST request', async () => {
    const res = await handleToken(
      new Request('https://app.test/api/auth/token', { method: 'GET' }), { env });
    expect(res.status).toBe(405);
  });

  it('returns a fresh access token and never the refresh token', async () => {
    const sealed = sealSession({ rt: 'super-secret-refresh', em: 'me@example.com' }, sessionKey);
    const fetchImpl = vi.fn().mockResolvedValue(json({ access_token: 'fresh', expires_in: 3599 }));

    const res = await handleToken(tokenReq(`argent_session=${sealed}`),
      { env, fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(res.status).toBe(200);
    const raw = await res.text();
    expect(raw).not.toContain('super-secret-refresh');
    const body = JSON.parse(raw);
    expect(body.accessToken).toBe('fresh');
    expect(body.email).toBe('me@example.com');
    expect(body.expiresAt).toBeGreaterThan(Date.now());
  });

  it('401s AND clears the cookie when the grant is revoked', async () => {
    const sealed = sealSession({ rt: 'rt', em: null }, sessionKey);
    const fetchImpl = vi.fn().mockResolvedValue(json({ error: 'invalid_grant' }, 400));
    const res = await handleToken(tokenReq(`argent_session=${sealed}`),
      { env, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'revoked' });
    expect(cookieNamed(res, 'argent_session')).toContain('Max-Age=0');
  });

  it('502s WITHOUT clearing the cookie on a transient upstream failure', async () => {
    const sealed = sealSession({ rt: 'rt', em: null }, sessionKey);
    const fetchImpl = vi.fn().mockResolvedValue(json({ error: 'backend_error' }, 500));
    const res = await handleToken(tokenReq(`argent_session=${sealed}`),
      { env, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res.status).toBe(502);
    // Critical: a transient blip must never destroy a valid grant.
    expect(cookieNamed(res, 'argent_session')).toBeUndefined();
  });
});

describe('handleSignout', () => {
  it('clears the session cookie', async () => {
    const sealed = sealSession({ rt: 'rt', em: null }, sessionKey);
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const res = await handleSignout(
      new Request('https://app.test/api/auth/signout', {
        method: 'POST', headers: { cookie: `argent_session=${sealed}`, origin: 'https://app.test' },
      }),
      { env, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res.status).toBe(204);
    expect(cookieNamed(res, 'argent_session')).toContain('Max-Age=0');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npm test -- api/_lib/handlers.test.ts
```

Expected: FAIL — cannot resolve `./handlers`.

- [ ] **Step 3: Implement `api/_lib/handlers.ts`**

```ts
import { timingSafeEqual } from 'node:crypto';
import type { ServerEnv } from './env';
import { openSession, sealSession } from './session';
import {
  SESSION_COOKIE, STATE_COOKIE, VERIFIER_COOKIE,
  SESSION_MAX_AGE, OAUTH_TEMP_MAX_AGE,
  parseCookies, serializeCookie,
} from './cookies';
import {
  OAuthRevokedError, buildAuthorizeUrl, challengeFor, createState, createVerifier,
  exchangeCode, fetchEmail, refreshAccessToken, revokeToken,
} from './oauth';

export interface Deps {
  env: ServerEnv;
  fetchImpl?: typeof fetch;
}

function headers(pairs: [string, string][]): Headers {
  const h = new Headers();
  for (const [k, v] of pairs) h.append(k, v);
  return h;
}

function expired(name: string, env: ServerEnv, path = '/'): string {
  return serializeCookie(name, '', { maxAge: 0, secure: env.secure, path });
}

/** Constant-time compare that tolerates unequal lengths without leaking them. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Reject cross-site callers. SameSite=Lax already blocks cross-site POST; this is depth. */
function sameOrigin(request: Request, env: ServerEnv): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true; // same-origin fetches may omit Origin in some browsers
  return origin === env.appOrigin;
}

export async function handleStart(_request: Request, deps: Deps): Promise<Response> {
  const { env } = deps;
  const state = createState();
  const verifier = createVerifier();
  const url = buildAuthorizeUrl({
    clientId: env.clientId,
    redirectUri: env.redirectUri,
    state,
    challenge: challengeFor(verifier),
  });
  const opts = { maxAge: OAUTH_TEMP_MAX_AGE, secure: env.secure, path: '/api/auth' };
  return new Response(null, {
    status: 302,
    headers: headers([
      ['location', url],
      ['set-cookie', serializeCookie(STATE_COOKIE, state, opts)],
      ['set-cookie', serializeCookie(VERIFIER_COOKIE, verifier, opts)],
      ['cache-control', 'no-store'],
    ]),
  });
}

export async function handleCallback(request: Request, deps: Deps): Promise<Response> {
  const { env } = deps;
  const url = new URL(request.url);
  const cookies = parseCookies(request.headers.get('cookie'));

  const clearTemp: [string, string][] = [
    ['set-cookie', expired(STATE_COOKIE, env, '/api/auth')],
    ['set-cookie', expired(VERIFIER_COOKIE, env, '/api/auth')],
  ];

  const cookieState = cookies[STATE_COOKIE];
  const queryState = url.searchParams.get('state') ?? '';
  if (!cookieState || !safeEqual(cookieState, queryState)) {
    return new Response('invalid state', { status: 400, headers: headers(clearTemp) });
  }

  if (url.searchParams.get('error')) {
    return new Response(null, {
      status: 302,
      headers: headers([['location', `${env.appOrigin}/settings?google=denied`], ...clearTemp]),
    });
  }

  const code = url.searchParams.get('code');
  const verifier = cookies[VERIFIER_COOKIE];
  if (!code || !verifier) {
    return new Response('missing code', { status: 400, headers: headers(clearTemp) });
  }

  let tokens;
  try {
    tokens = await exchangeCode({
      code, clientId: env.clientId, clientSecret: env.clientSecret,
      redirectUri: env.redirectUri, verifier,
    }, deps.fetchImpl);
  } catch {
    return new Response(null, {
      status: 302,
      headers: headers([['location', `${env.appOrigin}/settings?google=error`], ...clearTemp]),
    });
  }

  // Fail closed: without a refresh token the whole point of this flow is lost,
  // so never seal a session that cannot outlive the access token.
  if (!tokens.refreshToken) {
    return new Response(null, {
      status: 302,
      headers: headers([['location', `${env.appOrigin}/settings?google=norefresh`], ...clearTemp]),
    });
  }

  const email = await fetchEmail(tokens.accessToken, deps.fetchImpl);
  const sealed = sealSession({ rt: tokens.refreshToken, em: email }, env.sessionKey);

  return new Response(null, {
    status: 302,
    headers: headers([
      ['location', `${env.appOrigin}/settings?google=connected`],
      ['set-cookie', serializeCookie(SESSION_COOKIE, sealed, {
        maxAge: SESSION_MAX_AGE, secure: env.secure,
      })],
      ...clearTemp,
      ['cache-control', 'no-store'],
    ]),
  });
}

export async function handleToken(request: Request, deps: Deps): Promise<Response> {
  const { env } = deps;
  const noStore: [string, string][] = [['cache-control', 'no-store']];

  if (request.method !== 'POST') {
    return Response.json({ error: 'method-not-allowed' }, { status: 405 });
  }
  if (!sameOrigin(request, env)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const sealed = parseCookies(request.headers.get('cookie'))[SESSION_COOKIE];
  const session = sealed ? openSession(sealed, env.sessionKey) : null;
  if (!session) {
    return new Response(JSON.stringify({ error: 'no-session' }), {
      status: 401,
      headers: headers([...noStore, ['content-type', 'application/json']]),
    });
  }

  try {
    const { accessToken, expiresIn } = await refreshAccessToken({
      refreshToken: session.rt, clientId: env.clientId, clientSecret: env.clientSecret,
    }, deps.fetchImpl);

    return new Response(JSON.stringify({
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
      email: session.em,
    }), {
      status: 200,
      headers: headers([...noStore, ['content-type', 'application/json']]),
    });
  } catch (e) {
    if (e instanceof OAuthRevokedError) {
      // The grant is genuinely dead — drop the cookie so the UI stops retrying.
      return new Response(JSON.stringify({ error: 'revoked' }), {
        status: 401,
        headers: headers([
          ...noStore,
          ['content-type', 'application/json'],
          ['set-cookie', expired(SESSION_COOKIE, env)],
        ]),
      });
    }
    // Transient. Keep the cookie: a blip must never destroy a valid grant.
    return new Response(JSON.stringify({ error: 'upstream' }), {
      status: 502,
      headers: headers([...noStore, ['content-type', 'application/json']]),
    });
  }
}

export async function handleSignout(request: Request, deps: Deps): Promise<Response> {
  const { env } = deps;
  if (request.method !== 'POST') {
    return Response.json({ error: 'method-not-allowed' }, { status: 405 });
  }
  if (!sameOrigin(request, env)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const sealed = parseCookies(request.headers.get('cookie'))[SESSION_COOKIE];
  const session = sealed ? openSession(sealed, env.sessionKey) : null;
  if (session) await revokeToken(session.rt, deps.fetchImpl);

  return new Response(null, {
    status: 204,
    headers: headers([['set-cookie', expired(SESSION_COOKIE, env)], ['cache-control', 'no-store']]),
  });
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npm test -- api/_lib/handlers.test.ts
```

Expected: PASS, 15 tests. If `res.headers.getSetCookie()` is undefined, the Node version is below 18.14 — check `node -v` and upgrade rather than rewriting the assertion.

- [ ] **Step 5: Run the whole suite**

```bash
npm test
```

Expected: PASS, 50 tests across four files.

- [ ] **Step 6: Commit**

```bash
git add api/_lib/handlers.ts api/_lib/handlers.test.ts
git commit -m "feat: OAuth request handlers with CSRF, fail-closed and revoked/transient separation"
```

---

### Task 5: Wiring — Vercel adapters, Vite dev plugin, routing, service worker

This is the task where the server becomes reachable. It is verified by hand in a browser, not by unit tests.

**Files:**
- Create: `api/auth/start.ts`, `api/auth/callback.ts`, `api/auth/token.ts`, `api/auth/signout.ts`
- Create: `vite-dev-api.ts`
- Modify: `vite.config.ts`
- Modify: `vercel.json:7`
- Modify: `.env`, `.env.example`

**Interfaces:**
- Consumes: `handleStart`, `handleCallback`, `handleToken`, `handleSignout`, `readEnv` from Tasks 2 and 4.
- Produces: live endpoints at `/api/auth/{start,callback,token,signout}` in both `npm run dev` and Vercel.

- [ ] **Step 1: Create the four Vercel adapters**

Each is identical except for the handler. `api/auth/start.ts`:

```ts
import { readEnv } from '../_lib/env';
import { handleStart } from '../_lib/handlers';

export default {
  async fetch(request: Request): Promise<Response> {
    return handleStart(request, { env: readEnv() });
  },
};
```

`api/auth/callback.ts`, `api/auth/token.ts`, `api/auth/signout.ts`: the same five lines with
`handleCallback`, `handleToken`, `handleSignout` respectively. Use **relative** imports — the `@/`
alias does not work under Vercel's Node runtime.

- [ ] **Step 2: Create the Vite dev plugin**

`npm run dev` is plain Vite with no serverless runtime. This mounts the same handlers so one
command still runs everything.

Create `vite-dev-api.ts`:

```ts
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

const ROUTES = ['start', 'callback', 'token', 'signout'] as const;

/** Mount the /api/auth handlers on the Vite dev server, mirroring Vercel. */
export function devApi(): Plugin {
  return {
    name: 'argent-dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const path = (req.url ?? '').split('?')[0];
        const route = ROUTES.find((r) => path === `/api/auth/${r}`);
        if (!route) return next();

        try {
          // Imported lazily and un-cached so edits to api/_lib take effect on reload.
          const { readEnv } = await server.ssrLoadModule('/api/_lib/env.ts');
          const handlers = await server.ssrLoadModule('/api/_lib/handlers.ts');
          const handler = {
            start: handlers.handleStart,
            callback: handlers.handleCallback,
            token: handlers.handleToken,
            signout: handlers.handleSignout,
          }[route];

          const origin = `http://${req.headers.host ?? 'localhost:5173'}`;
          const body = req.method === 'GET' || req.method === 'HEAD'
            ? undefined
            : await readBody(req);

          const request = new Request(new URL(req.url ?? '/', origin), {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body,
          });

          const response = await handler(request, { env: readEnv() });

          res.statusCode = response.status;
          for (const [k, v] of response.headers) {
            if (k === 'set-cookie') continue;
            res.setHeader(k, v);
          }
          const cookies = response.headers.getSetCookie();
          if (cookies.length > 0) res.setHeader('set-cookie', cookies);
          res.end(response.body ? Buffer.from(await response.arrayBuffer()) : undefined);
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'dev-api-failed' }));
        }
      });
    },
  };
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
```

- [ ] **Step 3: Wire the plugin and fix the service worker in `vite.config.ts`**

Add the import and the plugin, and add `navigateFallbackDenylist` to the existing `workbox` block
(currently `vite.config.ts:43-45`):

```ts
import { devApi } from './vite-dev-api';
// ...
plugins: [
  react(),
  devApi(),
  VitePWA({
    // ...
    workbox: {
      globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      // registerType:'autoUpdate' gives Workbox a default navigateFallback of
      // index.html that applies to NAVIGATIONS. /api/auth/start and /callback
      // ARE navigations, so without this denylist the service worker serves
      // cached HTML and sign-in silently never reaches the server — exactly in
      // the installed-PWA case that matters most.
      navigateFallbackDenylist: [/^\/api\//],
    },
  }),
],
```

- [ ] **Step 4: Fix the Vercel rewrite so it stops swallowing `/api/*`**

In `vercel.json:7`, change the `source`:

```json
"rewrites": [{ "source": "/((?!api/|assets/).*)", "destination": "/index.html" }]
```

- [ ] **Step 5: Generate a session secret and add the env vars**

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Append to `.env` (already gitignored — verified via `git ls-files`):

```env
GOOGLE_CLIENT_SECRET=<from client_secret_*.json, field web.client_secret>
SESSION_SECRET=<the base64 value generated above>
APP_ORIGIN=http://localhost:5173
```

Append the same three names with **empty** values to `.env.example`, each with a one-line comment
saying it is server-only and must never be `VITE_`-prefixed.

- [ ] **Step 6: Verify the dev server actually serves the routes**

```bash
npm run dev
```

Then, in a second shell:

```bash
curl -si 'http://localhost:5173/api/auth/start' | head -20
```

Expected: `HTTP/1.1 302`, a `location:` header pointing at `accounts.google.com` with
`access_type=offline`, and two `set-cookie` headers. If you get HTML back, the rewrite/middleware
is not matching — fix that before continuing.

```bash
curl -si -X POST 'http://localhost:5173/api/auth/token' | head -5
```

Expected: `HTTP/1.1 401` with `{"error":"no-session"}`.

- [ ] **Step 7: Typecheck**

```bash
npm run typecheck
```

Expected: no errors. If `api/**` is not covered by `tsconfig.app.json`, add an `api` entry to its
`include` array — but keep `api/` imports relative regardless.

- [ ] **Step 8: Commit**

```bash
git add api/auth vite-dev-api.ts vite.config.ts vercel.json .env.example
git commit -m "feat: mount auth endpoints on Vercel and Vite dev; exclude /api from SPA rewrite and SW fallback"
```

> **Do not `git add .env`.** Confirm with `git status --short` that `.env` is absent from the staged list before committing.

---

### Task 6: Client token layer

**Files:**
- Rewrite: `src/lib/google/auth.ts`
- Test: `src/lib/google/auth.test.ts`
- Modify: `src/lib/google/loadScripts.ts` (remove `loadGsi`)

**Interfaces:**
- Consumes: `POST /api/auth/token` from Task 5.
- Produces — the exported surface is deliberately unchanged so `drive.ts`, `picker.ts`,
  `GoogleAutoBackup.tsx` and `GoogleSync.tsx` need no edits:
  - `getValidAccessToken(): Promise<string>`
  - `withTokenRefresh<T>(op: (token: string) => Promise<T>): Promise<T>`
  - `clearCachedAccessToken(): void`
  - `getCachedAccessToken(): string | null`
  - New: `class AuthRevokedError extends Error`, `class AuthOfflineError extends Error`,
    `class AuthTransientError extends Error`, `class AuthNotConfiguredError extends Error`
  - New: `fetchSession(): Promise<{ accessToken: string; expiresAt: number; email: string | null }>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/google/auth.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getValidAccessToken, clearCachedAccessToken,
  AuthRevokedError, AuthOfflineError, AuthTransientError,
} from './auth';

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const err = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const future = () => Date.now() + 3_600_000;

beforeEach(() => { clearCachedAccessToken(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('getValidAccessToken', () => {
  it('fetches a token from the server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      ok({ accessToken: 'at', expiresAt: future(), email: 'me@example.com' })));
    expect(await getValidAccessToken()).toBe('at');
  });

  it('serves from cache without a second request', async () => {
    const f = vi.fn().mockResolvedValue(ok({ accessToken: 'at', expiresAt: future(), email: null }));
    vi.stubGlobal('fetch', f);
    await getValidAccessToken();
    await getValidAccessToken();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('refetches once the token is inside the expiry skew', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(ok({ accessToken: 'stale', expiresAt: Date.now() + 30_000, email: null }))
      .mockResolvedValueOnce(ok({ accessToken: 'fresh', expiresAt: future(), email: null }));
    vi.stubGlobal('fetch', f);
    expect(await getValidAccessToken()).toBe('stale');
    expect(await getValidAccessToken()).toBe('fresh');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('de-dupes concurrent callers into one request', async () => {
    const f = vi.fn().mockResolvedValue(ok({ accessToken: 'at', expiresAt: future(), email: null }));
    vi.stubGlobal('fetch', f);
    const [a, b, c] = await Promise.all([
      getValidAccessToken(), getValidAccessToken(), getValidAccessToken(),
    ]);
    expect([a, b, c]).toEqual(['at', 'at', 'at']);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('throws AuthRevokedError on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(err(401, { error: 'revoked' })));
    await expect(getValidAccessToken()).rejects.toBeInstanceOf(AuthRevokedError);
  });

  it('throws AuthOfflineError on a network failure, NOT AuthRevokedError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const e = await getValidAccessToken().catch((x) => x);
    expect(e).toBeInstanceOf(AuthOfflineError);
    expect(e).not.toBeInstanceOf(AuthRevokedError);
  });

  it('throws AuthTransientError on 502, NOT AuthRevokedError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(err(502, { error: 'upstream' })));
    const e = await getValidAccessToken().catch((x) => x);
    expect(e).toBeInstanceOf(AuthTransientError);
    expect(e).not.toBeInstanceOf(AuthRevokedError);
  });

  it('does not cache a failure', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(err(502))
      .mockResolvedValueOnce(ok({ accessToken: 'at', expiresAt: future(), email: null }));
    vi.stubGlobal('fetch', f);
    await getValidAccessToken().catch(() => {});
    expect(await getValidAccessToken()).toBe('at');
  });

  it('posts with same-origin credentials', async () => {
    const f = vi.fn().mockResolvedValue(ok({ accessToken: 'at', expiresAt: future(), email: null }));
    vi.stubGlobal('fetch', f);
    await getValidAccessToken();
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/api/auth/token');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npm test -- src/lib/google/auth.test.ts
```

Expected: FAIL — `AuthRevokedError` is not exported.

- [ ] **Step 3: Rewrite `src/lib/google/auth.ts`**

Replace the file entirely. Every GIS import, the `tokenClient`, the `pending` slot, the 12-second
timeout, `persistToken`/`forgetToken` and both localStorage keys go away.

```ts
// Access tokens are minted by /api/auth/token, which holds the refresh token in
// an httpOnly cookie. Tokens live in memory only: a token in localStorage is
// XSS-exfiltrable, and the cookie makes persisting one unnecessary.

const TOKEN_ENDPOINT = '/api/auth/token';
const SIGNOUT_ENDPOINT = '/api/auth/signout';
/** Refresh a little early so a token never expires mid-request. */
const SKEW_MS = 60_000;

/** The grant is dead. This is the ONLY condition that should prompt the user. */
export class AuthRevokedError extends Error {
  constructor() { super('auth-revoked'); this.name = 'AuthRevokedError'; }
}
/** No network. Backups queue; the user is told nothing. */
export class AuthOfflineError extends Error {
  constructor() { super('auth-offline'); this.name = 'AuthOfflineError'; }
}
/** Upstream hiccup. Retry later; the user is told nothing. */
export class AuthTransientError extends Error {
  constructor() { super('auth-transient'); this.name = 'AuthTransientError'; }
}
/** Server env is incomplete. Surfaced in Settings only. */
export class AuthNotConfiguredError extends Error {
  constructor() { super('auth-not-configured'); this.name = 'AuthNotConfiguredError'; }
}

export interface Session {
  accessToken: string;
  expiresAt: number;
  email: string | null;
}

let cachedToken: string | null = null;
let cachedExpiresAt = 0;
let cachedEmail: string | null = null;
let inflight: Promise<Session> | null = null;

export function getCachedAccessToken(): string | null {
  if (cachedToken && Date.now() < cachedExpiresAt - SKEW_MS) return cachedToken;
  return null;
}

export function getCachedEmail(): string | null {
  return cachedEmail;
}

export function clearCachedAccessToken(): void {
  cachedToken = null;
  cachedExpiresAt = 0;
  cachedEmail = null;
  inflight = null;
}

/** Ask the server for a fresh access token. De-dupes concurrent callers. */
export function fetchSession(): Promise<Session> {
  if (inflight) return inflight;
  inflight = (async () => {
    let res: Response;
    try {
      res = await fetch(TOKEN_ENDPOINT, { method: 'POST', credentials: 'same-origin' });
    } catch {
      // fetch only rejects on a network-layer failure — this is offline, never
      // a revoked grant. Conflating the two is what nagged the user on refresh.
      throw new AuthOfflineError();
    }

    if (res.status === 401) throw new AuthRevokedError();
    if (res.status === 503) throw new AuthNotConfiguredError();
    if (!res.ok) throw new AuthTransientError();

    const body = (await res.json()) as Partial<Session>;
    if (typeof body.accessToken !== 'string' || typeof body.expiresAt !== 'number') {
      throw new AuthTransientError();
    }
    const session: Session = {
      accessToken: body.accessToken,
      expiresAt: body.expiresAt,
      email: typeof body.email === 'string' ? body.email : null,
    };
    cachedToken = session.accessToken;
    cachedExpiresAt = session.expiresAt;
    cachedEmail = session.email;
    return session;
  })().finally(() => { inflight = null; });
  return inflight;
}

export async function getValidAccessToken(): Promise<string> {
  const hit = getCachedAccessToken();
  if (hit) return hit;
  return (await fetchSession()).accessToken;
}

/** Run a token-scoped Drive op, retrying once with a fresh token on a 401. */
export async function withTokenRefresh<T>(op: (token: string) => Promise<T>): Promise<T> {
  const token = await getValidAccessToken();
  try {
    return await op(token);
  } catch (e) {
    if (e instanceof Error && /401/.test(e.message)) {
      clearCachedAccessToken();
      return op(await getValidAccessToken());
    }
    throw e;
  }
}

/** Start the consent flow. A full-page redirect — unlike a popup, unblockable. */
export function startSignIn(): void {
  window.location.assign('/api/auth/start');
}

export async function serverSignOut(): Promise<void> {
  try {
    await fetch(SIGNOUT_ENDPOINT, { method: 'POST', credentials: 'same-origin' });
  } finally {
    clearCachedAccessToken();
  }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npm test -- src/lib/google/auth.test.ts
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Delete the now-dead GIS loader**

In `src/lib/google/loadScripts.ts`, delete the `gsiUrl` constant and the `loadGsi` export. Keep
`loadPicker` — `picker.ts:41` still needs `picker.js`.

- [ ] **Step 6: Typecheck to find every remaining GIS reference**

```bash
npm run typecheck
```

Expect errors in `GoogleAuthContext.tsx` (imports `requestAccessToken`, `revokeAccessToken`) and
`useSilentReconnect.ts`. **Leave them** — Task 7 deletes those. Note them and continue.

- [ ] **Step 7: Commit**

```bash
git add src/lib/google/auth.ts src/lib/google/auth.test.ts src/lib/google/loadScripts.ts
git commit -m "feat: mint access tokens from the server; separate offline/transient/revoked"
```

---

### Task 7: Auth context and boot path

**Files:**
- Rewrite: `src/store/GoogleAuthContext.tsx`
- Delete: `src/hooks/useSilentReconnect.ts`
- Modify: `src/App.tsx:26` (import), `:64-67` (`SilentReconnect`), `:80` (usage)
- Create: `src/lib/google/legacyCleanup.ts`
- Test: `src/store/GoogleAuthContext.test.tsx`

**Interfaces:**
- Consumes: `fetchSession`, `startSignIn`, `serverSignOut`, `clearCachedAccessToken`,
  `AuthRevokedError`, `AuthOfflineError` from Task 6.
- Produces: `UseGoogleAuth` keeps every existing field so `GoogleSync.tsx`, `SyncPill.tsx`,
  `Dashboard.tsx` and `GoogleAutoBackup.tsx` keep compiling. `signIn` becomes `() => void`.
  New field: `offline: boolean`.

- [ ] **Step 1: Write the failing test**

Create `src/store/GoogleAuthContext.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { GoogleAuthProvider, useGoogleAuth } from './GoogleAuthContext';

function Probe() {
  const { status, needsReconnect, offline, email } = useGoogleAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="reconnect">{String(needsReconnect)}</span>
      <span data-testid="offline">{String(offline)}</span>
      <span data-testid="email">{email ?? ''}</span>
    </div>
  );
}

const mount = () => render(<GoogleAuthProvider><Probe /></GoogleAuthProvider>);

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const err = (status: number) => new Response('{}', { status });

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('GoogleAuthProvider boot', () => {
  it('signs in from the session cookie with no user interaction', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      ok({ accessToken: 'at', expiresAt: Date.now() + 3_600_000, email: 'me@example.com' })));
    mount();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-in'));
    expect(screen.getByTestId('email')).toHaveTextContent('me@example.com');
    expect(screen.getByTestId('reconnect')).toHaveTextContent('false');
  });

  it('does NOT ask for reconnect when merely offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    mount();
    await waitFor(() => expect(screen.getByTestId('offline')).toHaveTextContent('true'));
    expect(screen.getByTestId('reconnect')).toHaveTextContent('false');
    expect(screen.getByTestId('status')).toHaveTextContent('signed-out');
  });

  it('does NOT ask for reconnect on a transient 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(err(502)));
    mount();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-out'));
    expect(screen.getByTestId('reconnect')).toHaveTextContent('false');
  });

  it('asks for reconnect ONLY when the grant is revoked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(err(401)));
    mount();
    await waitFor(() => expect(screen.getByTestId('reconnect')).toHaveTextContent('true'));
  });

  it('purges the legacy localStorage token on boot', async () => {
    localStorage.setItem('argent.google.token', 'stale-token');
    localStorage.setItem('argent.google.tokenExpiresAt', '123');
    localStorage.setItem('argent.google.email', 'old@example.com');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(err(401)));
    mount();
    await waitFor(() => {
      expect(localStorage.getItem('argent.google.token')).toBeNull();
      expect(localStorage.getItem('argent.google.tokenExpiresAt')).toBeNull();
      expect(localStorage.getItem('argent.google.email')).toBeNull();
    });
  });
});
```

Add `@testing-library/jest-dom` for `toHaveTextContent`:

```bash
npm install --save-dev @testing-library/jest-dom@^6.5.0
```

and create `vitest.setup.ts` containing `import '@testing-library/jest-dom/vitest';`, then add
`setupFiles: ['./vitest.setup.ts']` to the `test` block of `vitest.config.ts`.

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npm test -- src/store/GoogleAuthContext.test.tsx
```

Expected: FAIL — `offline` is not a property of the context.

- [ ] **Step 3: Create `src/lib/google/legacyCleanup.ts`**

```ts
// Keys written by the pre-serverless GIS implementation. The access token used
// to be persisted here; it is now memory-only behind an httpOnly cookie.
const LEGACY_KEYS = [
  'argent.google.token',
  'argent.google.tokenExpiresAt',
  'argent.google.email',
];

export function purgeLegacyGoogleStorage(): void {
  for (const k of LEGACY_KEYS) {
    try { localStorage.removeItem(k); } catch { /* private mode */ }
  }
}
```

- [ ] **Step 4: Rewrite `src/store/GoogleAuthContext.tsx`**

Keep the `GoogleSyncStatus` interface, `syncStatus`, `reportBackupDone`, `reportBackupError`,
`setBackingUp`, `restoredJustNow`, `markRestoredJustNow`, `clearRestoredJustNow` and both module-level
setter refs **exactly as they are today** (`GoogleAuthContext.tsx:26-34`, `:172-191`, `:251-277`) —
`GoogleAutoBackup.tsx` imports them. Replace only the auth half:

```tsx
const [status, setStatus] = useState<GoogleAuthStatus>('signed-out');
const [email, setEmail] = useState<string | null>(null);
const [needsReconnect, setNeedsReconnect] = useState(false);
const [offline, setOffline] = useState(false);
const [busy, setBusy] = useState(false);

// Boot probe: one request establishes the session. No popup, no GIS, no race
// with a sibling effect — the provider owns this and nothing else triggers it.
useEffect(() => {
  if (!configured) return;
  purgeLegacyGoogleStorage();
  let cancelled = false;
  void (async () => {
    try {
      const session = await fetchSession();
      if (cancelled) return;
      setEmail(session.email);
      setStatus('signed-in');
      setNeedsReconnect(false);
      setOffline(false);
    } catch (e) {
      if (cancelled) return;
      setStatus('signed-out');
      // Only a genuinely dead grant prompts the user. Offline and transient
      // failures stay silent — that distinction is the whole point of this work.
      setNeedsReconnect(e instanceof AuthRevokedError);
      setOffline(e instanceof AuthOfflineError);
    }
  })();
  return () => { cancelled = true; };
}, [configured]);

const signIn = useCallback((): void => {
  setBusy(true);
  startSignIn(); // full-page redirect; this frame is going away
}, []);

const signOut = useCallback(async () => {
  await serverSignOut();
  setStatus('signed-out');
  setEmail(null);
  setNeedsReconnect(false);
}, []);
```

Add `offline` to the `UseGoogleAuth` interface, the memoised value and its dependency array.
Change `signIn`'s type in the interface to `() => void`.

Also `getValidAccessToken` stays exported through the context (`GoogleSync.tsx:28` uses it) —
re-export the Task 6 function unchanged.

- [ ] **Step 5: Delete the reconnect machinery**

```bash
git rm src/hooks/useSilentReconnect.ts
```

In `src/App.tsx`: delete the import at line 26, the `SilentReconnect` function at lines 64-67, and
the `<SilentReconnect />` element at line 80.

- [ ] **Step 6: Run the tests and confirm they pass**

```bash
npm test
npm run typecheck
```

Expected: all tests PASS; typecheck clean. `GoogleSync.tsx:54-57` awaits `signIn()`, which now
returns `void` — `await` on a non-promise is legal TypeScript, so this compiles. Leave it; Task 8
tidies it.

- [ ] **Step 7: Commit**

```bash
git add -A src/store/GoogleAuthContext.tsx src/store/GoogleAuthContext.test.tsx \
  src/lib/google/legacyCleanup.ts src/App.tsx src/hooks/useSilentReconnect.ts \
  vitest.setup.ts vitest.config.ts package.json package-lock.json
git commit -m "feat: server-backed auth context; delete the silent-reconnect state machine"
```

---

### Task 8: UI — stop nagging, and say the right thing

**Files:**
- Modify: `src/features/dashboard/Dashboard.tsx:85-103`
- Modify: `src/components/ui/SyncPill.tsx`
- Modify: `src/features/settings/GoogleSync.tsx:54-57`
- Modify: `src/locales/fr/common.json`, `src/locales/en/common.json`

**Interfaces:**
- Consumes: `offline`, `needsReconnect`, `signIn` from Task 7.

- [ ] **Step 1: Make the Dashboard banner honest**

The banner at `Dashboard.tsx:85` currently fires on `needsReconnect`, which used to mean "silent
and popup both failed" — i.e. almost every load. It now means "the grant is dead", which is rare
and genuinely actionable, so the banner stays but its trigger is now correct. Change only the
click handler, since `signIn` no longer returns a promise:

```tsx
onClick={() => signIn()}
```

(remove the `void` and the `disabled={googleBusy}` is fine to keep).

- [ ] **Step 2: Add an offline-aware pill state**

In `SyncPill.tsx`, pull `offline` from the context and place it **above** `needsReconnect` in the
precedence chain, so a network blip never renders as "paused":

```tsx
const { configured, status, syncStatus, needsReconnect, offline, signIn } = useGoogleAuth();

if (!configured) return null;
if (status !== 'signed-in' && !needsReconnect) return null;

let state: PillState;
if (offline) state = 'offline';
else if (needsReconnect) state = 'paused';
else if (syncStatus.backingUp) state = 'syncing';
else if (syncStatus.lastError) state = 'error';
else state = 'synced';
```

Add to the `PillState` union and the `VISUAL` map:

```tsx
type PillState = 'synced' | 'syncing' | 'paused' | 'error' | 'offline';
// in VISUAL:
offline: { icon: 'CloudOff', color: 'var(--muted-600)' },
```

Route the click: `if (state === 'paused') signIn(); else navigate('/settings');` — note `offline`
falls through to Settings, which is correct (there is nothing to fix by tapping).

- [ ] **Step 3: Simplify the Settings sign-in handler**

`GoogleSync.tsx:54-57` wraps `signIn()` in `run()` to catch errors it can no longer throw. Replace:

```tsx
const handleSignIn = () => signIn();
```

- [ ] **Step 4: Add the i18n strings**

In both `src/locales/fr/common.json` and `src/locales/en/common.json`, inside
`settings.google.pill`, add an `offline` key alongside the existing `synced`/`syncing`/`paused`/`error`:

- fr: `"offline": "Hors ligne — sauvegarde en attente"`
- en: `"offline": "Offline — backup queued"`

Match the exact nesting used by `SyncPill.tsx:42` (`t('settings.google.pill.' + state)`).

- [ ] **Step 5: Verify both locale files stayed valid JSON and have identical key sets**

```bash
node -e "const a=require('./src/locales/fr/common.json'),b=require('./src/locales/en/common.json');const k=o=>Object.keys(o).flatMap(x=>typeof o[x]==='object'&&o[x]?k(o[x]).map(y=>x+'.'+y):[x]).sort();const ka=k(a),kb=k(b);const d=[...ka.filter(x=>!kb.includes(x)),...kb.filter(x=>!ka.includes(x))];console.log(d.length?'MISMATCH: '+d.join(', '):'key sets identical, '+ka.length+' keys')"
```

Expected: `key sets identical, <n> keys`.

- [ ] **Step 6: Run the full suite and typecheck**

```bash
npm test && npm run typecheck
```

Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add src/features/dashboard/Dashboard.tsx src/components/ui/SyncPill.tsx \
  src/features/settings/GoogleSync.tsx src/locales
git commit -m "feat: distinguish offline from revoked in the sync UI"
```

---

### Task 9: Documentation and end-to-end verification

**Files:**
- Rewrite: `docs/google-setup.md`
- Modify: `README.md:73-119` (Configuration + Deployment sections)

- [ ] **Step 1: Rewrite `docs/google-setup.md`**

Replace the Testing-status instructions (currently `docs/google-setup.md:15`, "Add yourself as a
test user while in Testing status") with the production path. It must contain, verbatim:

1. **Publish the app.** OAuth consent screen → **Publish app** (Testing → In production).
   State why, quoting the constraint: a project with an External consent screen in **Testing**
   status is issued a refresh token that **expires after 7 days**. Because `drive.file` is a
   non-sensitive scope, publishing requires only basic verification — no security assessment.
2. **Authorized redirect URIs** (Credentials → OAuth client), add both:
   - `http://localhost:5173/api/auth/callback`
   - `https://<production-domain>/api/auth/callback`
   Note that the client previously registered no redirect URIs at all, so this step is required or
   the flow fails with `redirect_uri_mismatch`.
3. **Authorized JavaScript origins** — keep the existing entries; still needed by the Picker.
4. **Vercel environment variables** (Production **and** Preview): `GOOGLE_CLIENT_SECRET`,
   `SESSION_SECRET`, `APP_ORIGIN`. Include the generator command:
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`.
   State plainly that these must never be `VITE_`-prefixed, because that ships them in the bundle.
5. A troubleshooting table: `redirect_uri_mismatch` → step 2; reconnect prompt every 7 days →
   step 1 not done; `Missing server env: …` → step 4.

- [ ] **Step 2: Update `README.md`**

In "Données & confidentialité" (`README.md:127`), the row currently reads "Token court en mémoire,
jamais persisté (seul l'email est conservé pour l'affichage)". Replace with an accurate description:
the refresh token is held server-side in an encrypted httpOnly cookie, access tokens live in memory
only, and financial data still never leaves the device. In "Stack technique" (`README.md:45`),
replace "Google Identity Services + Drive REST API" with the authorization-code flow via Vercel
Functions. Add the three new env vars to the Vercel deployment steps at `README.md:114-117`.

- [ ] **Step 3: Run the complete suite one final time**

```bash
npm test && npm run typecheck && npm run build
```

Expected: all three clean. Record the actual test count.

- [ ] **Step 4: End-to-end verification in a browser — the five checks from spec §2**

Start `npm run dev`. Complete the consent flow once. Then, recording the observed result of each:

1. **Refresh loop.** Hard-refresh 5 times. Expect zero prompts, zero reconnect banners, sync pill
   `synced` every time. *This is the check that falsifies the original complaint.*
2. **Silent renewal.** In DevTools console, run
   `(await import('/src/lib/google/auth.ts')).clearCachedAccessToken()`, then trigger a backup from
   Settings. Expect success with no user interaction.
3. **Offline.** DevTools → Network → Offline, then reload. Expect the offline pill and **no**
   reconnect banner. *This guards the regression this change is most likely to introduce.*
4. **Revoked.** DevTools → Application → Cookies, delete `argent_session`, reload. Expect the
   reconnect banner to appear — **exactly here and nowhere earlier**.
5. **Reconnect.** Click Reconnect, complete consent, confirm the session returns and backup resumes.

- [ ] **Step 5: Report honestly, then commit**

Write up what was observed for each of the five checks, including anything that could not be
verified locally (production behaviour cannot be checked until deploy + Console changes are done).
Do not report a check as passed unless it was watched passing.

```bash
git add docs/google-setup.md README.md
git commit -m "docs: production OAuth setup, publishing requirement and troubleshooting"
```

---

## Self-Review

**Spec coverage.** §1.1/§1.2 root causes → Tasks 6 and 7 (token wipe and the effect-order race are
both deleted outright). §1.3 publishing constraint → Task 9 step 1. §2 success criteria → Task 9
step 4, one check each. §3.1 module layout → Tasks 1–4. §3.2 endpoints → Task 4 + Task 5. §3.3
session cookie → Task 1 + Task 2. §3.4 client changes and deletions → Tasks 6 and 7. §3.5 state
model → Tasks 6, 7, 8. §4.1 vercel.json → Task 5 step 4. §4.2 service worker → Task 5 step 3. §4.3
env vars → Task 5 step 5 + Task 9. §4.4 manual Console steps → Task 9 step 1. §5 tests → Tasks 1,
2, 3, 4, 6, 7. §6 verification → Task 9 step 4.

**Deviation from the spec, deliberate:** §3.1 described a custom `ApiRequest`/`ApiResponse` shape.
Vercel's Node runtime supports the Web-standard `(Request) => Response` signature directly
(verified in Vercel's Node.js runtime docs), so the handlers use that instead — strictly simpler,
one fewer abstraction, and directly testable. Recorded here rather than silently changed.

**Placeholder scan.** `<production-domain>` in Task 9 is the spec's known open item, not a
placeholder for the implementer to invent. The `client_secret` value in Task 5 step 5 is read from
the existing gitignored file. No other TBDs.

**Type consistency.** `SessionData {rt, em}` is used identically in Tasks 1 and 4.
`ServerEnv` fields match between Task 2's definition and Task 4's test fixture, including `secure`.
`Deps {env, fetchImpl}` matches across Task 4's tests, implementation and Task 5's adapters.
`Session {accessToken, expiresAt, email}` matches between Task 6's client and Task 4's response
body. Cookie constants are defined once in Task 2 and imported thereafter.
