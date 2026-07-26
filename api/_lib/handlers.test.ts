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
