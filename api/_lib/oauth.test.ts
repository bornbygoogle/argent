import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  DRIVE_FILE_SCOPE, OAuthRevokedError, OAuthUpstreamError,
  createVerifier, createState, challengeFor, buildAuthorizeUrl,
  exchangeCode, refreshAccessToken, fetchEmail,
} from './oauth.js';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('PKCE', () => {
  it('generates a distinct high-entropy verifier each call', () => {
    const a = createVerifier();
    const b = createVerifier();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, no padding
  });

  it('derives the challenge as base64url SHA-256 of the verifier', () => {
    const v = 'fixed-verifier-value';
    expect(challengeFor(v)).toBe(createHash('sha256').update(v).digest('base64url'));
  });

  it('generates a distinct state each call', () => {
    expect(createState()).not.toBe(createState());
  });
});

describe('buildAuthorizeUrl', () => {
  const url = () => new URL(buildAuthorizeUrl({
    clientId: 'cid', redirectUri: 'https://app.test/api/auth/callback',
    state: 'st', challenge: 'ch',
  }));

  it('points at Google', () => {
    expect(url().origin + url().pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
  });

  it('requests offline access so a refresh token is issued', () => {
    expect(url().searchParams.get('access_type')).toBe('offline');
  });

  it('forces consent so the refresh token is returned on every reconnect', () => {
    expect(url().searchParams.get('prompt')).toBe('consent');
  });

  it('uses PKCE S256', () => {
    expect(url().searchParams.get('code_challenge')).toBe('ch');
    expect(url().searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('requests exactly the drive.file scope', () => {
    expect(url().searchParams.get('scope')).toBe(DRIVE_FILE_SCOPE);
    expect(DRIVE_FILE_SCOPE).toBe('https://www.googleapis.com/auth/drive.file');
  });

  it('carries the state and redirect uri', () => {
    expect(url().searchParams.get('state')).toBe('st');
    expect(url().searchParams.get('redirect_uri')).toBe('https://app.test/api/auth/callback');
    expect(url().searchParams.get('response_type')).toBe('code');
  });
});

describe('exchangeCode', () => {
  it('posts the full form body including the PKCE verifier', async () => {
    const f = vi.fn().mockResolvedValue(
      jsonResponse({ access_token: 'at', refresh_token: 'rt', expires_in: 3599 }));
    const out = await exchangeCode({
      code: 'c', clientId: 'cid', clientSecret: 'sec',
      redirectUri: 'https://app.test/api/auth/callback', verifier: 'ver',
    }, f as unknown as typeof fetch);

    expect(out).toEqual({ accessToken: 'at', refreshToken: 'rt', expiresIn: 3599 });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect(init.method).toBe('POST');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('c');
    expect(body.get('code_verifier')).toBe('ver');
    expect(body.get('client_secret')).toBe('sec');
  });

  it('returns a null refresh token when Google omits one', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse({ access_token: 'at', expires_in: 3599 }));
    const out = await exchangeCode({
      code: 'c', clientId: 'cid', clientSecret: 'sec', redirectUri: 'r', verifier: 'v',
    }, f as unknown as typeof fetch);
    expect(out.refreshToken).toBeNull();
  });

  it('throws OAuthUpstreamError on a non-OK response', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse({ error: 'invalid_request' }, 400));
    await expect(exchangeCode({
      code: 'c', clientId: 'cid', clientSecret: 'sec', redirectUri: 'r', verifier: 'v',
    }, f as unknown as typeof fetch)).rejects.toBeInstanceOf(OAuthUpstreamError);
  });
});

describe('refreshAccessToken', () => {
  it('posts grant_type=refresh_token and returns the new access token', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse({ access_token: 'fresh', expires_in: 3599 }));
    const out = await refreshAccessToken(
      { refreshToken: 'rt', clientId: 'cid', clientSecret: 'sec' }, f as unknown as typeof fetch);
    expect(out).toEqual({ accessToken: 'fresh', expiresIn: 3599 });
    const body = new URLSearchParams(f.mock.calls[0][1].body as string);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('rt');
  });

  it('maps invalid_grant to OAuthRevokedError, distinctly from a transient failure', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse({ error: 'invalid_grant' }, 400));
    await expect(refreshAccessToken(
      { refreshToken: 'rt', clientId: 'cid', clientSecret: 'sec' }, f as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(OAuthRevokedError);
  });

  it('maps a 500 to OAuthUpstreamError, NOT OAuthRevokedError', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse({ error: 'backend_error' }, 500));
    const err = await refreshAccessToken(
      { refreshToken: 'rt', clientId: 'cid', clientSecret: 'sec' }, f as unknown as typeof fetch,
    ).catch((e) => e);
    expect(err).toBeInstanceOf(OAuthUpstreamError);
    expect(err).not.toBeInstanceOf(OAuthRevokedError);
  });
});

describe('fetchEmail', () => {
  it('reads the address from the Drive about endpoint', async () => {
    const f = vi.fn().mockResolvedValue(
      jsonResponse({ user: { emailAddress: 'me@example.com', displayName: 'Me' } }));
    expect(await fetchEmail('at', f as unknown as typeof fetch)).toBe('me@example.com');
  });

  it('returns null rather than throwing when the lookup fails', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse({}, 403));
    expect(await fetchEmail('at', f as unknown as typeof fetch)).toBeNull();
  });
});
