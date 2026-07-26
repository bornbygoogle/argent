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
 *
 * GOOGLE_CLIENT_SECRET and SESSION_SECRET must NEVER be prefixed with VITE_ —
 * that would ship them in the browser bundle.
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
