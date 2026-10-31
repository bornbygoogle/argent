export const SESSION_COOKIE = 'argent_session';
export const STATE_COOKIE = 'argent_oauth_state';
export const VERIFIER_COOKIE = 'argent_oauth_verifier';

/**
 * The session cookie name. `__Host-` makes a browser refuse a cookie that is
 * not Secure, has a Domain, or has a Path other than `/`, so a sibling
 * subdomain cannot write it. It requires Secure, so plain http (local dev)
 * keeps the unprefixed name. The temp OAuth cookies use Path=/api/auth and
 * cannot take the prefix.
 */
export function sessionCookieName(secure: boolean): string {
  return secure ? `__Host-${SESSION_COOKIE}` : SESSION_COOKIE;
}

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
