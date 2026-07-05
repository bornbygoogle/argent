// Google Identity Services token client wrapper. Returns a short-lived
// access_token authorised for drive.file. A fresh token is requested per
// action; the token is never persisted.

import { GOOGLE_CLIENT_ID, DRIVE_FILE_SCOPE } from './env';
import { loadGsi } from './loadScripts';

let tokenClient: TokenClient | null = null;
let pending: { resolve: (t: string) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;

// If a token request is in flight and a second one arrives, the SDK only has a
// single callback channel. Reject the newcomer rather than overwriting `pending`
// (which would orphan the first promise and force the user to click again).
function setPending(resolve: (t: string) => void, reject: (e: Error) => void): void {
  if (pending) {
    reject(new Error('google-auth-busy'));
    return;
  }
  // Guard the silent-flow path: if Google never calls back (e.g. popup swallowed
  // by the browser, or `prompt:''` no-ops on mobile), don't leave the UI
  // spinning — clear the slot so the next click can actually proceed.
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
      } else {
        p.resolve(resp.access_token);
      }
    },
    error_callback: (err) => {
      const p = clearPending();
      if (!p) return;
      p.reject(new Error(err.error || 'google-auth-error'));
    },
  });
}

/**
 * Open the Google consent popup and resolve with an access_token. A fresh token
 * is requested per action (drive.file is per-file scoped; never persisted).
 *
 * On the first use we request an explicit consent prompt. `prompt: ''` asks
 * Google to be silent when no consent is needed — but on mobile this can no-op
 * (popup cancelled by the browser / COOP) leaving the callback never fired and
 * forcing the user to click a second time. An explicit prompt the first time
 * guarantees a visible, completable flow.
 */
export async function requestAccessToken(): Promise<string> {
  await ensureClient();
  if (!tokenClient) throw new Error('google-sdk-unavailable');
  if (pending) throw new Error('google-auth-busy');
  return new Promise<string>((resolve, reject) => {
    setPending(resolve, reject);
    if (pending === null) {
      // setPending refused (another caller raced in between) — abort this one.
      reject(new Error('google-auth-busy'));
      return;
    }
    tokenClient!.requestAccessToken({ prompt: '' });
  });
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
