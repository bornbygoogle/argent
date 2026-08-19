// Compression for the Drive backup payload.
//
// The payload is a full snapshot re-uploaded on every change, so it is the
// app's dominant use of the user's mobile data. JSON of this shape compresses
// ~9x, which is the whole reason this module exists.
//
// The load-bearing requirement is not the compression though — it is that
// decoding still accepts a PLAIN JSON file. Every backup already on Drive, and
// every file the user exported by hand, is uncompressed; if decode only spoke
// gzip, upgrading the app would strand all of them.

import { describe, it, expect } from 'vitest';
import { gzipSupported, gzipText, decodeBackupBytes, looksGzipped } from '@/lib/gzip';

const bytesOf = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

/** A payload shaped like a real backup: repetitive keys, many similar rows. */
const samplePayload = JSON.stringify({
  app: 'argent',
  version: 1,
  tables: {
    transactions: Array.from({ length: 200 }, (_, i) => ({
      id: `tx_${i}`, kind: 'expense', accountId: 'a1', amount: i + 0.5,
      date: '2026-03-01', merchant: 'Boulangerie', note: 'déjeuner à côté',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    })),
  },
});

describe('gzipSupported', () => {
  it('reports whether the runtime has CompressionStream', () => {
    // Safari only gained CompressionStream in 16.4, below Vite's default
    // target, so callers must be able to ask before relying on it.
    expect(gzipSupported()).toBe(typeof CompressionStream !== 'undefined');
  });
});

describe('gzipText', () => {
  it('round-trips through decodeBackupBytes', async () => {
    const gz = await gzipText(samplePayload);
    expect(await decodeBackupBytes(gz.buffer as ArrayBuffer)).toBe(samplePayload);
  });

  it('round-trips non-ASCII text byte for byte', async () => {
    // The app is French and stores user-entered labels: a charCode-based
    // encoder would mangle these and silently corrupt a restore.
    const text = JSON.stringify({ label: 'Prélèvement épargne — café 5€', emoji: '🏦' });
    const gz = await gzipText(text);
    expect(await decodeBackupBytes(gz.buffer as ArrayBuffer)).toBe(text);
  });

  it('emits the gzip magic bytes', async () => {
    const gz = await gzipText(samplePayload);
    expect([gz[0], gz[1]]).toEqual([0x1f, 0x8b]);
  });

  it('substantially shrinks a backup-shaped payload', async () => {
    const gz = await gzipText(samplePayload);
    const plain = new TextEncoder().encode(samplePayload).length;
    expect(gz.length).toBeLessThan(plain / 4);
  });
});

describe('looksGzipped', () => {
  it('recognises gzipped bytes', async () => {
    const gz = await gzipText(samplePayload);
    expect(looksGzipped(gz.buffer as ArrayBuffer)).toBe(true);
  });

  it('rejects plain JSON', () => {
    expect(looksGzipped(bytesOf('{"app":"argent"}'))).toBe(false);
  });

  it('rejects a buffer too short to hold a header', () => {
    expect(looksGzipped(new Uint8Array([0x1f]).buffer as ArrayBuffer)).toBe(false);
    expect(looksGzipped(new ArrayBuffer(0))).toBe(false);
  });
});

describe('decodeBackupBytes', () => {
  // This is the backward-compatibility guarantee: every backup written before
  // compression existed is plain JSON and must keep restoring.
  it('reads a plain JSON backup unchanged', async () => {
    const text = '{"app":"argent","version":1}';
    expect(await decodeBackupBytes(bytesOf(text))).toBe(text);
  });

  it('reads plain JSON containing non-ASCII', async () => {
    const text = '{"note":"café à 5€"}';
    expect(await decodeBackupBytes(bytesOf(text))).toBe(text);
  });
});
