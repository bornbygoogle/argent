import { describe, it, expect, vi } from 'vitest';
import { endpoint } from './adapter';
import type { ServerEnv } from './env';

const VALID = {
  VITE_GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  APP_ORIGIN: 'https://argent-xi.vercel.app',
  SESSION_SECRET: Buffer.alloc(32, 7).toString('base64'),
};

const req = () => new Request('https://argent-xi.vercel.app/api/auth/start');

describe('endpoint', () => {
  it('passes the validated env to the handler and returns its response', async () => {
    let seen: ServerEnv | undefined;
    const fn = endpoint(async (_r, deps) => {
      seen = deps.env;
      return new Response('ok', { status: 200 });
    }, VALID);

    const res = await fn.fetch(req());

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
    expect(seen?.redirectUri).toBe('https://argent-xi.vercel.app/api/auth/callback');
  });

  // A missing variable used to throw out of the function, which Vercel reports
  // as FUNCTION_INVOCATION_FAILED with no hint as to what is wrong. The client
  // already understands 503 as "server not configured".
  it('answers 503 instead of crashing when the env is missing', async () => {
    const fn = endpoint(async () => new Response('should not run'), {});
    const res = await fn.fetch(req());
    expect(res.status).toBe(503);
  });

  it('names every missing variable, so one look fixes the deploy', async () => {
    const fn = endpoint(async () => new Response('should not run'), {});
    const body = await (await fn.fetch(req())).json();

    expect(body.error).toBe('not-configured');
    for (const name of [
      'VITE_GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'APP_ORIGIN',
      'SESSION_SECRET',
    ]) {
      expect(body.detail).toContain(name);
    }
  });

  it('names only the variable that is actually missing', async () => {
    const { GOOGLE_CLIENT_SECRET: _omitted, ...rest } = VALID;
    const fn = endpoint(async () => new Response('should not run'), rest);
    const body = await (await fn.fetch(req())).json();

    expect(body.detail).toContain('GOOGLE_CLIENT_SECRET');
    expect(body.detail).not.toContain('APP_ORIGIN');
  });

  it('reports a SESSION_SECRET that is present but the wrong size', async () => {
    const fn = endpoint(async () => new Response('should not run'), {
      ...VALID,
      SESSION_SECRET: Buffer.alloc(8).toString('base64'),
    });
    const res = await fn.fetch(req());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.detail).toContain('SESSION_SECRET');
  });

  it('never leaks a configured secret value in the response', async () => {
    const fn = endpoint(async () => new Response('should not run'), {
      ...VALID,
      APP_ORIGIN: '',
    });
    const text = await (await fn.fetch(req())).text();
    expect(text).not.toContain(VALID.GOOGLE_CLIENT_SECRET);
    expect(text).not.toContain(VALID.SESSION_SECRET);
  });

  it('is not cached — a fixed deploy must not keep serving the old failure', async () => {
    const fn = endpoint(async () => new Response('should not run'), {});
    const res = await fn.fetch(req());
    expect(res.headers.get('cache-control')).toContain('no-store');
  });

  it('logs the cause server-side for the deploy logs', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await endpoint(async () => new Response('x'), {}).fetch(req());
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('surfaces a handler throwing as a 500, not a crashed invocation', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const fn = endpoint(async () => {
        throw new Error('boom');
      }, VALID);
      const res = await fn.fetch(req());
      expect(res.status).toBe(500);
      // The message is for the logs, not the caller.
      expect(await res.text()).not.toContain('boom');
    } finally {
      spy.mockRestore();
    }
  });
});
