import { timingSafeEqual } from 'node:crypto';
import type { ServerEnv } from './env';
import { openSession, sealSession } from './session';
import {
  SESSION_COOKIE,
  STATE_COOKIE,
  VERIFIER_COOKIE,
  SESSION_MAX_AGE,
  OAUTH_TEMP_MAX_AGE,
  parseCookies,
  serializeCookie,
} from './cookies';
import {
  OAuthRevokedError,
  buildAuthorizeUrl,
  challengeFor,
  createState,
  createVerifier,
  exchangeCode,
  fetchEmail,
  refreshAccessToken,
  revokeToken,
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

  let tokens: { accessToken: string; refreshToken: string | null; expiresIn: number };
  try {
    tokens = await exchangeCode(
      {
        code,
        clientId: env.clientId,
        clientSecret: env.clientSecret,
        redirectUri: env.redirectUri,
        verifier,
      },
      deps.fetchImpl,
    );
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
      [
        'set-cookie',
        serializeCookie(SESSION_COOKIE, sealed, {
          maxAge: SESSION_MAX_AGE,
          secure: env.secure,
        }),
      ],
      ...clearTemp,
      ['cache-control', 'no-store'],
    ]),
  });
}

export async function handleToken(request: Request, deps: Deps): Promise<Response> {
  const { env } = deps;
  const noStore: [string, string][] = [
    ['cache-control', 'no-store'],
    ['content-type', 'application/json'],
  ];

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
      headers: headers(noStore),
    });
  }

  try {
    const { accessToken, expiresIn } = await refreshAccessToken(
      {
        refreshToken: session.rt,
        clientId: env.clientId,
        clientSecret: env.clientSecret,
      },
      deps.fetchImpl,
    );

    return new Response(
      JSON.stringify({
        accessToken,
        expiresAt: Date.now() + expiresIn * 1000,
        email: session.em,
      }),
      { status: 200, headers: headers(noStore) },
    );
  } catch (e) {
    if (e instanceof OAuthRevokedError) {
      // The grant is genuinely dead — drop the cookie so the UI stops retrying.
      return new Response(JSON.stringify({ error: 'revoked' }), {
        status: 401,
        headers: headers([...noStore, ['set-cookie', expired(SESSION_COOKIE, env)]]),
      });
    }
    // Transient. Keep the cookie: a blip must never destroy a valid grant.
    return new Response(JSON.stringify({ error: 'upstream' }), {
      status: 502,
      headers: headers(noStore),
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
    headers: headers([
      ['set-cookie', expired(SESSION_COOKIE, env)],
      ['cache-control', 'no-store'],
    ]),
  });
}
