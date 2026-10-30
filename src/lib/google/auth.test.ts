import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getValidAccessToken, clearCachedAccessToken,
  AuthRevokedError, AuthOfflineError, AuthTransientError, AuthNoSessionError,
  withTokenRefresh, DriveHttpError,
} from './auth';

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const err = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const future = () => Date.now() + 3_600_000;

beforeEach(() => { clearCachedAccessToken(); });
// stubGlobal is NOT undone by restoreAllMocks — unstub explicitly so a stub
// cannot leak into the next test.
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

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

  it('throws AuthRevokedError on 401 revoked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(err(401, { error: 'revoked' })));
    await expect(getValidAccessToken()).rejects.toBeInstanceOf(AuthRevokedError);
  });

  it('throws AuthNoSessionError (NOT revoked) on 401 no-session', async () => {
    // A user who has never connected Google also gets a 401. Treating that as
    // "revoked" would show a reconnect banner to someone who never set up backup.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(err(401, { error: 'no-session' })));
    const e = await getValidAccessToken().catch((x) => x);
    expect(e).toBeInstanceOf(AuthNoSessionError);
    expect(e).not.toBeInstanceOf(AuthRevokedError);
  });

  it('treats a 401 with an unreadable body as no-session, not revoked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 401 })));
    const e = await getValidAccessToken().catch((x) => x);
    expect(e).toBeInstanceOf(AuthNoSessionError);
    expect(e).not.toBeInstanceOf(AuthRevokedError);
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

describe('withTokenRefresh', () => {
  // Each call to the token endpoint yields a distinct token, so the test can
  // tell the stale token from the freshly fetched one.
  const tokenFetch = () => {
    let n = 0;
    const f = vi.fn().mockImplementation(async () =>
      ok({ accessToken: `token-${++n}`, expiresAt: future(), email: null }));
    vi.stubGlobal('fetch', f);
    return f;
  };

  it('does not retry a 500 error whose message contains 401', async () => {
    const f = tokenFetch();
    const failure = new DriveHttpError(500, 'google-upload-failed (500) {"id":"x401y"}');
    const op = vi.fn().mockRejectedValue(failure);

    await expect(withTokenRefresh(op)).rejects.toBe(failure);

    expect(op).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('retries once on a 401 status with an unrelated message', async () => {
    const f = tokenFetch();
    const op = vi.fn()
      .mockRejectedValueOnce(new DriveHttpError(401, 'unauthorized'))
      .mockResolvedValueOnce('done');

    expect(await withTokenRefresh(op)).toBe('done');

    expect(op).toHaveBeenCalledTimes(2);
    expect(op.mock.calls[0][0]).toBe('token-1');
    expect(op.mock.calls[1][0]).toBe('token-2');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('throws the second 401 without a third attempt', async () => {
    tokenFetch();
    const op = vi.fn().mockRejectedValue(new DriveHttpError(401, 'unauthorized'));

    await expect(withTokenRefresh(op)).rejects.toBeInstanceOf(DriveHttpError);

    expect(op).toHaveBeenCalledTimes(2);
  });

  it('does not retry a plain Error whose message mentions 401', async () => {
    tokenFetch();
    const op = vi.fn().mockRejectedValue(new Error('401'));

    await expect(withTokenRefresh(op)).rejects.toThrow('401');

    expect(op).toHaveBeenCalledTimes(1);
  });
});
