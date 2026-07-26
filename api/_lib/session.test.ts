import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { loadKey, sealSession, openSession } from './session';

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
