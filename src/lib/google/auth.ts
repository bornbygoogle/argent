// Google Identity Services token client wrapper. Returns a short-lived
// access_token authorised for drive.file. A fresh token is requested per
// action; the token is never persisted.

import { GOOGLE_CLIENT_ID, DRIVE_FILE_SCOPE } from './env';
import { loadGsi } from './loadScripts';

let tokenClient: TokenClient | null = null;
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;

async function ensureClient(): Promise<void> {
  await loadGsi();
  if (tokenClient || !window.google) return;
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_FILE_SCOPE,
    callback: (resp: TokenResponse) => {
      if (!pending) return;
      if (resp.error || !resp.access_token) {
        pending.reject(new Error(resp.error || 'google-auth-failed'));
      } else {
        pending.resolve(resp.access_token);
      }
      pending = null;
    },
    error_callback: (err) => {
      if (!pending) return;
      pending.reject(new Error(err.error || 'google-auth-error'));
      pending = null;
    },
  });
}

/** Open the Google consent popup and resolve with an access_token. */
export async function requestAccessToken(): Promise<string> {
  await ensureClient();
  if (!tokenClient) throw new Error('google-sdk-unavailable');
  return new Promise<string>((resolve, reject) => {
    pending = { resolve, reject };
    tokenClient!.requestAccessToken();
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
