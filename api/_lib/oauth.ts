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
  constructor() {
    super('oauth-revoked');
    this.name = 'OAuthRevokedError';
  }
}

/** Something upstream failed transiently. Retrying later is reasonable. */
export class OAuthUpstreamError extends Error {
  constructor(detail: string) {
    super(`oauth-upstream:${detail}`);
    this.name = 'OAuthUpstreamError';
  }
}

export function createVerifier(): string {
  return randomBytes(32).toString('base64url');
}

export function createState(): string {
  return randomBytes(32).toString('base64url');
}

export function challengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function buildAuthorizeUrl(o: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
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
  body: URLSearchParams,
  f: typeof fetch,
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

export async function exchangeCode(
  o: { code: string; clientId: string; clientSecret: string; redirectUri: string; verifier: string },
  f: typeof fetch = fetch,
): Promise<{ accessToken: string; refreshToken: string | null; expiresIn: number }> {
  const json = await postToken(
    new URLSearchParams({
      code: o.code,
      client_id: o.clientId,
      client_secret: o.clientSecret,
      redirect_uri: o.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: o.verifier,
    }),
    f,
  );
  return {
    accessToken: json.access_token,
    refreshToken: typeof json.refresh_token === 'string' ? json.refresh_token : null,
    expiresIn: Number(json.expires_in) || 3600,
  };
}

export async function refreshAccessToken(
  o: { refreshToken: string; clientId: string; clientSecret: string },
  f: typeof fetch = fetch,
): Promise<{ accessToken: string; expiresIn: number }> {
  const json = await postToken(
    new URLSearchParams({
      client_id: o.clientId,
      client_secret: o.clientSecret,
      refresh_token: o.refreshToken,
      grant_type: 'refresh_token',
    }),
    f,
  );
  return { accessToken: json.access_token, expiresIn: Number(json.expires_in) || 3600 };
}

/** Display-only lookup. Never fatal: a missing email must not block sign-in. */
export async function fetchEmail(
  accessToken: string,
  f: typeof fetch = fetch,
): Promise<string | null> {
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
