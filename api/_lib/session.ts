// Seals the Google refresh token into an httpOnly cookie value using
// AES-256-GCM. The refresh token never reaches the browser's JavaScript;
// only this opaque sealed string does, and only the server holds the key.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface SessionData {
  /** Google refresh token. */
  rt: string;
  /** Account email, for display only. */
  em: string | null;
}

const IV_BYTES = 12;
const TAG_BYTES = 16;
/** v2 added the absolute expiry. v1 payloads have none and are refused. */
const VERSION = 2;

/**
 * Absolute server-enforced session lifetime, in seconds. Kept equal to the
 * cookie's Max-Age (cookies.ts) so both sides expire at the same instant — but
 * only this one binds: a cookie value copied out of the browser and replayed by
 * any other client ignores Max-Age entirely.
 */
export const SESSION_TTL_SECONDS = 34_560_000;

/** Decode + validate SESSION_SECRET. Fails loudly rather than silently truncating. */
export function loadKey(secret: string | undefined): Buffer {
  // This value is normally pasted into a dashboard field, so trim before
  // deciding it is absent — otherwise a stray newline reports as a 0-byte key
  // rather than as a missing variable.
  const clean = secret?.trim();
  if (!clean) throw new Error('SESSION_SECRET is not set');
  const key = Buffer.from(clean, 'base64');
  if (key.length !== 32) {
    throw new Error(`SESSION_SECRET must decode to 32 bytes, got ${key.length}`);
  }
  return key;
}

export function sealSession(data: SessionData, key: Buffer, nowMs: number = Date.now()): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  // `exp` sits inside the authenticated payload, so pushing it out requires the
  // key — the GCM tag rejects any edit.
  const exp = Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS;
  const plaintext = Buffer.from(
    JSON.stringify({ v: VERSION, rt: data.rt, em: data.em, exp }),
    'utf8',
  );
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString('base64url');
}

export function openSession(
  sealed: string,
  key: Buffer,
  nowMs: number = Date.now(),
): SessionData | null {
  // A null return is the contract for "this cookie is not usable" — tampered,
  // wrong key, truncated, expired, or from an older format. Callers treat it as
  // "no session", which is exactly right for all of those cases.
  try {
    const raw = Buffer.from(sealed, 'base64url');
    if (raw.length <= IV_BYTES + TAG_BYTES) return null;
    const iv = raw.subarray(0, IV_BYTES);
    const ciphertext = raw.subarray(IV_BYTES, raw.length - TAG_BYTES);
    const tag = raw.subarray(raw.length - TAG_BYTES);

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    const parsed: unknown = JSON.parse(plaintext.toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const o = parsed as Record<string, unknown>;
    if (o.v !== VERSION || typeof o.rt !== 'string' || o.rt.length === 0) return null;
    // Fail closed on a missing or malformed expiry: a session with no deadline
    // is exactly the thing this field exists to prevent.
    if (typeof o.exp !== 'number' || !Number.isFinite(o.exp)) return null;
    if (o.exp * 1000 <= nowMs) return null;
    return { rt: o.rt, em: typeof o.em === 'string' ? o.em : null };
  } catch {
    return null;
  }
}
