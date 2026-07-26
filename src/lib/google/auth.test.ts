import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getValidAccessToken, clearCachedAccessToken,
  AuthRevokedError, AuthOfflineError, AuthTransientError,
} from './auth';

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const err = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const future = () => Date.now() + 3_600_000;

beforeEach(() => { clearCachedAccessToken(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('getValidAccessToken', () => {
  it('fetches a token from the server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      ok({ accessToken: 'at', expiresAt: future(), email: 'me@example.com' })));
    expect(await getValidAccessToken()).toBe('at');
  });

  it('serves from cache without a second request', async () => {
    const f = vi.fn().mockResolvedValue(ok({ accessToken: 'at', expiresAt: future(), email: null }));
    vi.stubGlobal('fetch', f);
    await getValidAccessToken();
    await getValidAccessToken();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('refetches once the token is inside the expiry skew', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(ok({ accessToken: 'stale', expiresAt: Date.now() + 30_000, email: null }))
      .mockResolvedValueOnce(ok({ accessToken: 'fresh', expiresAt: future(), email: null }));
    vi.stubGlobal('fetch', f);
    expect(await getValidAccessToken()).toBe('stale');
    expect(await getValidAccessToken()).toBe('fresh');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('de-dupes concurrent callers into one request', async () => {
    const f = vi.fn().mockResolvedValue(ok({ accessToken: 'at', expiresAt: future(), email: null }));
    vi.stubGlobal('fetch', f);
    const [a, b, c] = await Promise.all([
      getValidAccessToken(), getValidAccessToken(), getValidAccessToken(),
    ]);
    expect([a, b, c]).toEqual(['at', 'at', 'at']);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('throws AuthRevokedError on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(err(401, { error: 'revoked' })));
    await expect(getValidAccessToken()).rejects.toBeInstanceOf(AuthRevokedError);
  });

  it('throws AuthOfflineError on a network failure, NOT AuthRevokedError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const e = await getValidAccessToken().catch((x) => x);
    expect(e).toBeInstanceOf(AuthOfflineError);
    expect(e).not.toBeInstanceOf(AuthRevokedError);
  });

  it('throws AuthTransientError on 502, NOT AuthRevokedError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(err(502, { error: 'upstream' })));
    const e = await getValidAccessToken().catch((x) => x);
    expect(e).toBeInstanceOf(AuthTransientError);
    expect(e).not.toBeInstanceOf(AuthRevokedError);
  });

  it('does not cache a failure', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(err(502))
      .mockResolvedValueOnce(ok({ accessToken: 'at', expiresAt: future(), email: null }));
    vi.stubGlobal('fetch', f);
    await getValidAccessToken().catch(() => {});
    expect(await getValidAccessToken()).toBe('at');
  });

  it('posts with same-origin credentials', async () => {
    const f = vi.fn().mockResolvedValue(ok({ accessToken: 'at', expiresAt: future(), email: null }));
    vi.stubGlobal('fetch', f);
    await getValidAccessToken();
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/api/auth/token');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
  });
});
