import { describe, it, expect, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { handleStart, handleCallback, handleToken, handleSignout } from './handlers.js';
import { sealSession } from './session.js';
import type { ServerEnv } from './env.js';

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

// The session cookie is __Host- prefixed whenever env.secure is true.
const SESSION = '__Host-argent_session';

const setCookies =(r: Response) => r.headers.getSetCookie();
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
    expect(cookieNamed(res, SESSION)).toBeUndefined();
  });

  it('rejects a missing state cookie', async () => {
    const res = await handleCallback(callbackReq('code=c&state=s', ''), { env });
    expect(res.status).toBe(400);
    expect(cookieNamed(res, SESSION)).toBeUndefined();
  });

  it('surfaces a user denial without setting a session', async () => {
    const res = await handleCallback(
      callbackReq('error=access_denied&state=s', 'argent_oauth_state=s; argent_oauth_verifier=v'),
      { env });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('google=denied');
    expect(cookieNamed(res, SESSION)).toBeUndefined();
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

    const session = cookieNamed(res, SESSION)!;
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
    expect(cookieNamed(res, SESSION)).toBeUndefined();
  });

  it('session cookie is __Host- prefixed with Path=/ and no Domain when secure', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'at', refresh_token: 'rt', expires_in: 3599 }))
      .mockResolvedValueOnce(json({ user: { emailAddress: 'me@example.com' } }));
    const res = await handleCallback(
      callbackReq('code=c&state=s', 'argent_oauth_state=s; argent_oauth_verifier=v'),
      { env, fetchImpl: fetchImpl as unknown as typeof fetch });

    const session = cookieNamed(res, '__Host-argent_session')!;
    expect(session).toBeDefined();
    expect(session).toContain('Path=/;');
    expect(session).toContain('Secure');
    expect(session).not.toContain('Domain');
    expect(cookieNamed(res, 'argent_session')).toBeUndefined();
  });

  it('uses the plain session cookie name when secure is false', async () => {
    const devEnv: ServerEnv = {
      ...env, appOrigin: 'http://localhost:3000', redirectUri: 'http://localhost:3000/api/auth/callback',
      secure: false,
    };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'at', refresh_token: 'rt', expires_in: 3599 }))
      .mockResolvedValueOnce(json({ user: { emailAddress: 'me@example.com' } }));
    const res = await handleCallback(
      callbackReq('code=c&state=s', 'argent_oauth_state=s; argent_oauth_verifier=v'),
      { env: devEnv, fetchImpl: fetchImpl as unknown as typeof fetch });

    const session = cookieNamed(res, 'argent_session')!;
    expect(session).toBeDefined();
    expect(session).not.toContain('Secure');
    expect(cookieNamed(res, '__Host-argent_session')).toBeUndefined();

    // The same env reads and clears the plain name on token and signout.
    const sealed = sealSession({ rt: 'rt', em: null }, sessionKey);
    const tokenRes = await handleToken(
      new Request('http://localhost:3000/api/auth/token', {
        method: 'POST',
        headers: { cookie: `argent_session=${sealed}`, origin: 'http://localhost:3000' },
      }),
      { env: devEnv, fetchImpl: vi.fn().mockResolvedValue(json({ access_token: 'x', expires_in: 3599 })) as unknown as typeof fetch });
    expect(tokenRes.status).toBe(200);

    const outRes = await handleSignout(
      new Request('http://localhost:3000/api/auth/signout', {
        method: 'POST',
        headers: { cookie: `argent_session=${sealed}`, origin: 'http://localhost:3000' },
      }),
      { env: devEnv, fetchImpl: vi.fn().mockResolvedValue(new Response('', { status: 200 })) as unknown as typeof fetch });
    expect(cookieNamed(outRes, 'argent_session')).toContain('Max-Age=0');
  });

  it('temp OAuth cookies keep their unprefixed names', async () => {
    const res = await handleStart(new Request('https://app.test/api/auth/start'), { env });
    const state = cookieNamed(res, 'argent_oauth_state')!;
    const verifier = cookieNamed(res, 'argent_oauth_verifier')!;
    expect(state).toContain('Path=/api/auth');
    expect(verifier).toContain('Path=/api/auth');
    expect(cookieNamed(res, '__Host-argent_oauth_state')).toBeUndefined();
    expect(cookieNamed(res, '__Host-argent_oauth_verifier')).toBeUndefined();
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
    const res = await handleToken(tokenReq(`${SESSION}=garbage`), { env });
    expect(res.status).toBe(401);
  });

  it('rejects a cross-origin request', async () => {
    const sealed = sealSession({ rt: 'rt', em: null }, sessionKey);
    const res = await handleToken(
      tokenReq(`${SESSION}=${sealed}`, 'https://evil.test'), { env });
    expect(res.status).toBe(403);
  });

  it('rejects a non-POST request', async () => {
    const res = await handleToken(
      new Request('https://app.test/api/auth/token', { method: 'GET' }), { env });
    expect(res.status).toBe(405);
  });

  // Origin is the primary signal, but a request that omits it is not therefore
  // trustworthy. Sec-Fetch-Site is the second one; it is set by the browser and
  // unreachable from page script, so a cross-site caller cannot forge it.
  describe('when the request carries no Origin header', () => {
    const noOriginReq = (extra: Record<string, string>) =>
      new Request('https://app.test/api/auth/token', {
        method: 'POST',
        headers: { cookie: `${SESSION}=${sealSession({ rt: 'rt', em: null }, sessionKey)}`, ...extra },
      });

    it('rejects a cross-site fetch', async () => {
      const res = await handleToken(noOriginReq({ 'sec-fetch-site': 'cross-site' }), { env });
      expect(res.status).toBe(403);
    });

    it('rejects a same-site (different subdomain) fetch', async () => {
      const res = await handleToken(noOriginReq({ 'sec-fetch-site': 'same-site' }), { env });
      expect(res.status).toBe(403);
    });

    it('allows a same-origin fetch', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(json({ access_token: 'fresh', expires_in: 3599 }));
      const res = await handleToken(noOriginReq({ 'sec-fetch-site': 'same-origin' }), {
        env, fetchImpl: fetchImpl as unknown as typeof fetch });
      expect(res.status).toBe(200);
    });

    // A real browser always sends one of the two headers; a request carrying
    // neither presents no origin evidence and is refused.
    it('rejects a request that sends neither header', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(json({ access_token: 'fresh', expires_in: 3599 }));
      const res = await handleToken(noOriginReq({}), {
        env, fetchImpl: fetchImpl as unknown as typeof fetch });
      expect(res.status).toBe(403);
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  it('returns a fresh access token and never the refresh token', async () => {
    const sealed = sealSession({ rt: 'super-secret-refresh', em: 'me@example.com' }, sessionKey);
    const fetchImpl = vi.fn().mockResolvedValue(json({ access_token: 'fresh', expires_in: 3599 }));

    const res = await handleToken(tokenReq(`${SESSION}=${sealed}`),
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
    const res = await handleToken(tokenReq(`${SESSION}=${sealed}`),
      { env, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'revoked' });
    expect(cookieNamed(res, SESSION)).toContain('Max-Age=0');
  });

  it('502s WITHOUT clearing the cookie on a transient upstream failure', async () => {
    const sealed = sealSession({ rt: 'rt', em: null }, sessionKey);
    const fetchImpl = vi.fn().mockResolvedValue(json({ error: 'backend_error' }, 500));
    const res = await handleToken(tokenReq(`${SESSION}=${sealed}`),
      { env, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res.status).toBe(502);
    // Critical: a transient blip must never destroy a valid grant.
    expect(cookieNamed(res, SESSION)).toBeUndefined();
  });
});

describe('handleSignout', () => {
  const signoutReq = (cookie: string, headers: Record<string, string> = { origin: 'https://app.test' }) =>
    new Request('https://app.test/api/auth/signout', {
      method: 'POST', headers: { cookie, ...headers },
    });
  const sealedCookie = () => `${SESSION}=${sealSession({ rt: 'rt', em: null }, sessionKey)}`;

  it('clears the session cookie', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const res = await handleSignout(signoutReq(sealedCookie()),
      { env, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res.status).toBe(204);
    expect(cookieNamed(res, SESSION)).toContain('Max-Age=0');
  });

  it('signout rejects a request with no origin evidence and keeps the cookie', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const res = await handleSignout(signoutReq(sealedCookie(), {}),
      { env, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res.status).toBe(403);
    expect(cookieNamed(res, SESSION)).toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('signout clears the cookie and reports no failure when Google revoke succeeds', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const res = await handleSignout(signoutReq(sealedCookie()),
      { env, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res.status).toBe(204);
    expect(cookieNamed(res, SESSION)).toContain('Max-Age=0');
    expect(res.headers.get('x-remote-revoke')).toBeNull();
  });

  it('signout still clears the cookie and flags a failed revoke when Google returns 400', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ error: 'invalid_token' }, 400));
    const res = await handleSignout(signoutReq(sealedCookie()),
      { env, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res.status).toBe(204);
    expect(cookieNamed(res, SESSION)).toContain('Max-Age=0');
    expect(res.headers.get('x-remote-revoke')).toBe('failed');
  });

  it('signout still clears the cookie and flags a failed revoke when the revoke fetch throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('network down'));
    const res = await handleSignout(signoutReq(sealedCookie()),
      { env, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res.status).toBe(204);
    expect(cookieNamed(res, SESSION)).toContain('Max-Age=0');
    expect(res.headers.get('x-remote-revoke')).toBe('failed');
  });

  it('signout with no session does not report a revoke failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ error: 'x' }, 400));
    const res = await handleSignout(signoutReq(''),
      { env, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res.status).toBe(204);
    expect(cookieNamed(res, SESSION)).toContain('Max-Age=0');
    expect(res.headers.get('x-remote-revoke')).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
