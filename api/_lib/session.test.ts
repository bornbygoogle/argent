import { describe, it, expect } from 'vitest';
import { createCipheriv, randomBytes } from 'node:crypto';
import { loadKey, sealSession, openSession, SESSION_TTL_SECONDS } from './session.js';
import { SESSION_MAX_AGE } from './cookies.js';

const key = () => randomBytes(32);
const b64 = (b: Buffer) => b.toString('base64');

describe('loadKey', () => {
  it('accepts a 32-byte base64 secret', () => {
    const raw = randomBytes(32);
    expect(loadKey(b64(raw)).equals(raw)).toBe(true);
  });

  it('throws when the secret is missing', () => {
    expect(() => loadKey(undefined)).toThrow(/SESSION_SECRET/);
  });

  // Pasting into a dashboard field is the normal way this value arrives, and a
  // stray newline or space must not read as a different key.
  it('ignores surrounding whitespace', () => {
    const raw = randomBytes(32);
    expect(loadKey(`  ${b64(raw)}\n`).equals(raw)).toBe(true);
  });

  it('treats a whitespace-only secret as missing, not as a zero-length key', () => {
    expect(() => loadKey('   \n')).toThrow(/SESSION_SECRET is not set/);
  });

  it('says how many bytes it actually got, so the fix is obvious', () => {
    expect(() => loadKey(b64(randomBytes(16)))).toThrow(/got 16/);
  });

  it('throws when the secret is the wrong length', () => {
    expect(() => loadKey(b64(randomBytes(16)))).toThrow(/32 bytes/);
  });
});

describe('sealSession / openSession', () => {
  it('round-trips the refresh token and email', () => {
    const k = key();
    const sealed = sealSession({ rt: 'refresh-abc', em: 'me@example.com' }, k);
    expect(openSession(sealed, k)).toEqual({ rt: 'refresh-abc', em: 'me@example.com' });
  });

  it('round-trips a null email', () => {
    const k = key();
    const sealed = sealSession({ rt: 'refresh-abc', em: null }, k);
    expect(openSession(sealed, k)).toEqual({ rt: 'refresh-abc', em: null });
  });

  it('never emits the refresh token in cleartext', () => {
    const sealed = sealSession({ rt: 'refresh-abc', em: null }, key());
    expect(sealed).not.toContain('refresh-abc');
  });

  it('returns null when the ciphertext is tampered with', () => {
    const k = key();
    const sealed = sealSession({ rt: 'refresh-abc', em: null }, k);
    const raw = Buffer.from(sealed, 'base64url');
    raw[20] ^= 0xff; // flip a byte inside the ciphertext
    expect(openSession(raw.toString('base64url'), k)).toBeNull();
  });

  it('returns null under a different key', () => {
    const sealed = sealSession({ rt: 'refresh-abc', em: null }, key());
    expect(openSession(sealed, key())).toBeNull();
  });

  it('returns null on garbage input', () => {
    expect(openSession('not-a-real-cookie', key())).toBeNull();
    expect(openSession('', key())).toBeNull();
  });
});

// The cookie's Max-Age is a client-side hint: a copied cookie value replayed by
// a non-browser client ignores it entirely. The absolute expiry sealed inside
// the payload is the one the server actually enforces.
describe('session expiry', () => {
  const t0 = 1_700_000_000_000; // fixed instant; Date.now() is never consulted

  it('accepts a session before its absolute expiry', () => {
    const k = key();
    const sealed = sealSession({ rt: 'refresh-abc', em: null }, k, t0);
    const justBefore = t0 + SESSION_TTL_SECONDS * 1000 - 1000;
    expect(openSession(sealed, k, justBefore)).toEqual({ rt: 'refresh-abc', em: null });
  });

  it('rejects a session past its absolute expiry', () => {
    const k = key();
    const sealed = sealSession({ rt: 'refresh-abc', em: null }, k, t0);
    const justAfter = t0 + SESSION_TTL_SECONDS * 1000 + 1000;
    expect(openSession(sealed, k, justAfter)).toBeNull();
  });

  it('rejects exactly at the expiry instant', () => {
    const k = key();
    const sealed = sealSession({ rt: 'refresh-abc', em: null }, k, t0);
    expect(openSession(sealed, k, t0 + SESSION_TTL_SECONDS * 1000)).toBeNull();
  });

  // The expiry is inside the authenticated payload, so extending it requires
  // the key: any edit breaks the GCM tag.
  it('cannot be extended without the key', () => {
    const k = key();
    const sealed = sealSession({ rt: 'refresh-abc', em: null }, k, t0);
    const raw = Buffer.from(sealed, 'base64url');
    // Flip a byte somewhere in the ciphertext body where exp lives.
    raw[raw.length - 20] ^= 0x01;
    expect(openSession(raw.toString('base64url'), k, t0)).toBeNull();
  });

  // A v1 cookie carries no expiry at all, so it can never be aged out. Refuse
  // it rather than grandfathering an unbounded session in.
  it('rejects a legacy payload that carries no expiry', () => {
    const k = key();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', k, iv);
    const body = Buffer.from(JSON.stringify({ v: 1, rt: 'refresh-abc', em: null }), 'utf8');
    const ct = Buffer.concat([cipher.update(body), cipher.final()]);
    const sealed = Buffer.concat([iv, ct, cipher.getAuthTag()]).toString('base64url');
    expect(openSession(sealed, k, t0)).toBeNull();
  });

  // Both sides must agree, or the cookie outlives the session it seals (or the
  // reverse: a live session dropped by the browser).
  it('matches the cookie Max-Age', () => {
    expect(SESSION_TTL_SECONDS).toBe(SESSION_MAX_AGE);
  });
});
