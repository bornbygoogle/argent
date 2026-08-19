// gzip for the Drive backup payload, on the platform's own CompressionStream.
//
// A backup is a full snapshot of every table, re-uploaded a few seconds after
// each change, so it dominates the app's mobile data use. Backup-shaped JSON —
// the same keys repeated once per row — compresses about 9x.
//
// Two constraints shape the API:
//
//  1. Decoding must accept PLAIN JSON as well as gzip. Every backup already in
//     the user's Drive folder, and every file they exported by hand, is
//     uncompressed. Decode sniffs the gzip magic number rather than trusting
//     the filename, so a renamed or hand-edited file still restores.
//  2. Compression must be optional. CompressionStream landed in Safari 16.4,
//     above the browsers Vite's default target admits, so callers check
//     gzipSupported() and fall back to uploading plain JSON.

/** Whether this runtime can compress. Safari gained CompressionStream in 16.4. */
export function gzipSupported(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

/** Drain a stream of Uint8Array chunks into one contiguous array. */
async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** Compress UTF-8 text to gzip bytes. */
export async function gzipText(text: string): Promise<Uint8Array<ArrayBuffer>> {
  // TextEncoder, not a charCode loop: the app stores French labels and free
  // text, and only a real UTF-8 encoding round-trips them intact.
  const bytes = new TextEncoder().encode(text);
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return collect(stream as ReadableStream<Uint8Array>);
}

/**
 * The gzip magic number, 0x1f 0x8b.
 *
 * Sniffing the content rather than the file extension is deliberate: it is the
 * only check that stays correct for a file Drive renamed, a user renamed, or an
 * older version of this app wrote.
 */
export function looksGzipped(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 2) return false;
  const head = new Uint8Array(buf, 0, 2);
  return head[0] === 0x1f && head[1] === 0x8b;
}

/** Decode backup bytes to text, accepting gzip or plain JSON. */
export async function decodeBackupBytes(buf: ArrayBuffer): Promise<string> {
  if (!looksGzipped(buf)) return new TextDecoder().decode(buf);
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new TextDecoder().decode(await collect(stream as ReadableStream<Uint8Array>));
}
