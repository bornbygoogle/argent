// Access tokens are minted by /api/auth/token, which holds the Google refresh
// token in an encrypted httpOnly cookie. Tokens live in memory only: a token in
// localStorage is XSS-exfiltrable, and the server-side cookie makes persisting
// one unnecessary.
//
// This replaces the Google Identity Services implicit-token flow, which could
// not survive a page refresh: GIS issues no refresh token, its silent renewal
// depends on third-party cookies, and its popup fallback is blocked when not
// triggered by a user gesture.

const TOKEN_ENDPOINT = '/api/auth/token';
const SIGNOUT_ENDPOINT = '/api/auth/signout';
const START_ENDPOINT = '/api/auth/start';

/** Refresh a little early so a token never expires mid-request. */
const SKEW_MS = 60_000;

/**
 * The grant was live and Google has now rejected it. This is the ONLY condition
 * that should prompt the user to reconnect.
 */
export class AuthRevokedError extends Error {
  constructor() {
    super('auth-revoked');
    this.name = 'AuthRevokedError';
  }
}

/**
 * No session cookie at all — the user has never connected Google, or signed out.
 * Distinct from revoked on purpose: both are HTTP 401, but only a revoked grant
 * is worth interrupting the user about. Showing "reconnect" to someone who never
 * set up backup is noise.
 */
export class AuthNoSessionError extends Error {
  constructor() {
    super('auth-no-session');
    this.name = 'AuthNoSessionError';
  }
}

/** No network. Backups queue; the user is told nothing. */
export class AuthOfflineError extends Error {
  constructor() {
    super('auth-offline');
    this.name = 'AuthOfflineError';
  }
}

/** Upstream hiccup. Retry later; the user is told nothing. */
export class AuthTransientError extends Error {
  constructor() {
    super('auth-transient');
    this.name = 'AuthTransientError';
  }
}

/** Server env is incomplete. Surfaced in Settings only. */
export class AuthNotConfiguredError extends Error {
  constructor() {
    super('auth-not-configured');
    this.name = 'AuthNotConfiguredError';
  }
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

/** A cached, non-expired token, or null. Never triggers a network call. */
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
  const run = (async (): Promise<Session> => {
    let res: Response;
    try {
      res = await fetch(TOKEN_ENDPOINT, { method: 'POST', credentials: 'same-origin' });
    } catch {
      // fetch only rejects on a network-layer failure — this is offline, never
      // a revoked grant. Conflating the two is what nagged the user on refresh.
      throw new AuthOfflineError();
    }

    if (res.status === 401) {
      // The server distinguishes "no cookie" from "Google rejected the grant".
      // Preserve that: only the latter is actionable by the user.
      const reason = await res
        .json()
        .then((b: { error?: string }) => b?.error)
        .catch(() => undefined);
      throw reason === 'revoked' ? new AuthRevokedError() : new AuthNoSessionError();
    }
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
  })();

  inflight = run;
  // Clear the in-flight slot on settle, but keep returning `run` to callers that
  // are already awaiting it. A failure is never cached.
  void run.catch(() => undefined).finally(() => {
    if (inflight === run) inflight = null;
  });
  return run;
}

export async function getValidAccessToken(): Promise<string> {
  const hit = getCachedAccessToken();
  if (hit) return hit;
  return (await fetchSession()).accessToken;
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
      return op(await getValidAccessToken());
    }
    throw e;
  }
}

/**
 * Start the consent flow. A full-page redirect — unlike a popup, it cannot be
 * blocked by the browser, which is what made the old flow fail on mobile.
 */
export function startSignIn(): void {
  window.location.assign(START_ENDPOINT);
}

/** Revoke at Google and drop the session cookie. */
export async function serverSignOut(): Promise<void> {
  try {
    await fetch(SIGNOUT_ENDPOINT, { method: 'POST', credentials: 'same-origin' });
  } finally {
    clearCachedAccessToken();
  }
}
