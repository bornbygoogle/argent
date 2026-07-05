// Google Identity Services token client wrapper. Issues short-lived access
// tokens authorised for drive.file. The first sign-in requests an explicit
// consent prompt; subsequent requests are silent and the token is cached
// in-memory (with expiry) so the ~5s background backup loop doesn't re-prompt.

import { GOOGLE_CLIENT_ID, DRIVE_FILE_SCOPE } from './env';
import { loadGsi } from './loadScripts';

let tokenClient: TokenClient | null = null;
let pending: { resolve: (t: string) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;

// --- Token cache (in-memory + localStorage) --------------------------------
// The in-memory cache dies on reload. We ALSO persist the token + expiry to
// localStorage so a page refresh can re-activate the session WITHOUT any GIS
// call — no popup, no 12s slot occupation, no Drive op before user action.
// GIS tokens are short-lived (≤1h); after that the user re-signs-in (silent
// first via the GIS cookie, consent popup as fallback).
const LS_TOKEN = 'argent.google.token';
const LS_EXPIRES = 'argent.google.tokenExpiresAt';
let cachedToken: string | null = null;
let cachedExpiresAt = 0; // epoch ms
// Refresh a little before the real expiry to avoid 401s on the wire.
const SKEW_MS = 60_000;
let silentInflight: Promise<string> | null = null;

function persistToken(token: string, expiresAt: number): void {
  cachedToken = token;
  cachedExpiresAt = expiresAt;
  try {
    localStorage.setItem(LS_TOKEN, token);
    localStorage.setItem(LS_EXPIRES, String(expiresAt));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

function forgetToken(): void {
  cachedToken = null;
  cachedExpiresAt = 0;
  try {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_EXPIRES);
  } catch {
    /* ignore */
  }
}

/** A cached, non-expired token, or null if none / stale. */
export function getCachedAccessToken(): string | null {
  // Hot path: in-memory hit.
  if (cachedToken && Date.now() < cachedExpiresAt - SKEW_MS) return cachedToken;
  // Cold path (after a refresh): hydrate from localStorage once, then check.
  if (!cachedToken) {
    try {
      const t = localStorage.getItem(LS_TOKEN);
      const exp = Number(localStorage.getItem(LS_EXPIRES) ?? '0');
      if (t && exp && Date.now() < exp - SKEW_MS) {
        cachedToken = t;
        cachedExpiresAt = exp;
        return t;
      }
      // Stale or absent on disk → drop it so we don't keep re-reading garbage.
      if (t) forgetToken();
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function clearCachedAccessToken(): void {
  forgetToken();
}

// --- Pending-slot helpers --------------------------------------------------
// The SDK has a single callback channel. Reject a newcomer rather than
// overwriting `pending` (which would orphan the first promise).
function setPending(resolve: (t: string) => void, reject: (e: Error) => void): void {
  if (pending) {
    reject(new Error('google-auth-busy'));
    return;
  }
  // If Google never calls back (popup swallowed by the browser, or `prompt:''`
  // no-ops), don't leave the UI spinning — clear the slot so the next call can
  // actually proceed.
  const timer = setTimeout(() => {
    if (pending) {
      pending.reject(new Error('google-auth-timeout'));
      pending = null;
    }
  }, 12000);
  pending = { resolve, reject, timer };
}

function clearPending(): { resolve: (t: string) => void; reject: (e: Error) => void } | null {
  if (!pending) return null;
  clearTimeout(pending.timer);
  const p = pending;
  pending = null;
  return p;
}

async function ensureClient(): Promise<void> {
  await loadGsi();
  if (tokenClient || !window.google) return;
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_FILE_SCOPE,
    callback: (resp: TokenResponse) => {
      const p = clearPending();
      if (!p) return;
      if (resp.error || !resp.access_token) {
        p.reject(new Error(resp.error || 'google-auth-failed'));
        return;
      }
      // Cache the token + its real expiry so the background loop can reuse it.
      // Persist to localStorage too, so a page refresh can re-activate the
      // session with NO GIS call (no popup, no slot occupied) while the token
      // is still live.
      const secs = Number(resp.expires_in) || 3600;
      persistToken(resp.access_token, Date.now() + secs * 1000);
      p.resolve(resp.access_token);
    },
    error_callback: (err) => {
      const p = clearPending();
      if (!p) return;
      p.reject(new Error(err.error || 'google-auth-error'));
    },
  });
}

/**
 * Request an access token. The first sign-in should pass `{ prompt: 'consent' }`
 * for one visible popup; the background loop / silent refresh use the default
 * `{ prompt: '' }` (silent, assumes prior consent).
 */
export async function requestAccessToken(opts: { prompt?: 'consent' | '' } = {}): Promise<string> {
  await ensureClient();
  if (!tokenClient) throw new Error('google-sdk-unavailable');
  if (pending) throw new Error('google-auth-busy');
  // If this is a silent refresh (no consent popup) and it's about to actually
  // hit the SDK, drop any stale persisted token first — we don't want to keep
  // re-hydrating a token the GIS cookie can no longer back. (A 'consent'
  // request is a deliberate re-auth and will replace it via persistToken.)
  if (!opts.prompt) forgetToken();
  const prompt = opts.prompt ?? '';
  return new Promise<string>((resolve, reject) => {
    setPending(resolve, reject);
    if (pending === null) {
      // setPending refused (another caller raced in between) — abort this one.
      reject(new Error('google-auth-busy'));
      return;
    }
    tokenClient!.requestAccessToken({ prompt });
  });
}

/** Return a valid token, refreshing silently if the cache is empty/stale.
 *  Never shows a popup (assumes prior consent). De-dupes concurrent calls. */
export async function getValidAccessToken(): Promise<string> {
  const hit = getCachedAccessToken();
  if (hit) return hit;
  if (silentInflight) return silentInflight;
  silentInflight = (async () => {
    try {
      return await requestAccessToken({ prompt: '' });
    } finally {
      silentInflight = null;
    }
  })();
  return silentInflight;
}

/**
 * Run a token-scoped Drive op, retrying once with a fresh token on a 401.
 * Drive helpers take the token as a param, so they're wrapped as `op(token)`.
 */
export async function withTokenRefresh<T>(op: (token: string) => Promise<T>): Promise<T> {
  const token = await getValidAccessToken();
  try {
    return await op(token);
  } catch (e) {
    if (e instanceof Error && /401/.test(e.message)) {
      clearCachedAccessToken();
      const fresh = await getValidAccessToken();
      return op(fresh);
    }
    throw e;
  }
}

/** Best-effort revoke of a granted token — used on sign-out. */
export function revokeAccessToken(token: string): void {
  window.google?.accounts.oauth2.revoke(token, () => {});
}

export interface DriveUser {
  email: string | null;
  name: string | null;
}

/** Resolve the account's display info via the Drive `about` endpoint. */
export async function fetchDriveUser(token: string): Promise<DriveUser> {
  const res = await fetch(
    'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)',
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error('google-about-failed');
  const json = (await res.json()) as { user?: { displayName?: string; emailAddress?: string } };
  return { name: json.user?.displayName ?? null, email: json.user?.emailAddress ?? null };
}
