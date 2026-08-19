import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  escapeDriveQueryValue,
  findFolderByName,
  listBackupsInFolder,
  backupFileName,
  uploadBackupToFolder,
  downloadBackupFile,
} from './drive';
import { gzipText } from '@/lib/gzip';

/** Capture the URL of the single fetch a Drive helper performs. */
function stubFetch(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Pull the decoded `q` parameter back out of the captured request URL. */
function queryOf(fetchMock: ReturnType<typeof vi.fn>): string {
  const url = new URL(fetchMock.mock.calls[0][0] as string);
  return url.searchParams.get('q') ?? '';
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('escapeDriveQueryValue', () => {
  it('leaves an ordinary value alone', () => {
    expect(escapeDriveQueryValue('GestionMoney')).toBe('GestionMoney');
  });

  // A bare quote would close the string literal and let the rest of the value
  // be read as query syntax.
  it("escapes a single quote", () => {
    expect(escapeDriveQueryValue("it's")).toBe("it\\'s");
  });

  // Escaped first, and before the quote rule — otherwise the backslash this
  // rule adds gets escaped again and the quote is freed.
  it('escapes a backslash', () => {
    expect(escapeDriveQueryValue('a\\b')).toBe('a\\\\b');
  });

  it('escapes a backslash followed by a quote without freeing the quote', () => {
    expect(escapeDriveQueryValue("a\\'b")).toBe("a\\\\\\'b");
  });
});

describe('Drive query construction', () => {
  it('neutralises a quote in the folder name', async () => {
    const fetchMock = stubFetch({ files: [] });
    await findFolderByName("Mine' or name != '", 'token');

    const q = queryOf(fetchMock);
    expect(q).toContain("name = 'Mine\\' or name != \\''");
    // The name must contribute no unescaped quote of its own: the only bare
    // quotes left are the four the query itself opens and closes with.
    expect(q.match(/(?<!\\)'/g)?.length).toBe(4);
  });

  it('neutralises a quote in the folder id', async () => {
    const fetchMock = stubFetch({ files: [] });
    await listBackupsInFolder("abc' in parents or '", 'token');

    const q = queryOf(fetchMock);
    expect(q).toContain("'abc\\' in parents or \\'' in parents");
  });

  it('still finds a plain folder name', async () => {
    const fetchMock = stubFetch({ files: [{ id: 'folder-1' }] });
    const found = await findFolderByName('GestionMoney', 'token');

    expect(found).toEqual({ id: 'folder-1' });
    expect(queryOf(fetchMock)).toContain("name = 'GestionMoney'");
  });
});

describe('backupFileName', () => {
  it('names an uncompressed backup .json', () => {
    expect(backupFileName(new Date(2026, 7, 19, 14, 5), false)).toBe(
      'argent-backup-2026-08-19T14-05.json',
    );
  });

  it('names a compressed backup .json.gz', () => {
    expect(backupFileName(new Date(2026, 7, 19, 14, 5), true)).toBe(
      'argent-backup-2026-08-19T14-05.json.gz',
    );
  });

  it('still matches the prefix the folder listing searches for', () => {
    // listBackupsInFolder queries `name contains 'argent-backup-'`; if the
    // compressed name broke that prefix, restore and prune would stop seeing
    // the very files this app writes.
    expect(backupFileName(new Date(), true).startsWith('argent-backup-')).toBe(true);
  });
});

describe('uploadBackupToFolder', () => {
  const payload = { app: 'argent' as const, version: 1, exportedAt: 'x', tables: {} };

  it('uploads the payload gzipped', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ id: 'f1', name: 'n' }),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    await uploadBackupToFolder('folder-1', payload, 'token');

    const body = fetchMock.mock.calls[0][1].body as Blob;
    const raw = new Uint8Array(await body.arrayBuffer());
    // The multipart body carries metadata then the content part. The gzip
    // magic number must appear in it — i.e. the JSON really was compressed.
    const hasMagic = raw.some((b, i) => b === 0x1f && raw[i + 1] === 0x8b);
    expect(hasMagic).toBe(true);
    // And the raw JSON must NOT be sitting there in the clear.
    expect(new TextDecoder().decode(raw)).not.toContain('"exportedAt"');
  });
});

describe('downloadBackupFile', () => {
  function stubBytes(bytes: Uint8Array) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      arrayBuffer: async () => bytes.buffer,
      text: async () => new TextDecoder().decode(bytes),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
  }

  it('reads back a gzipped backup', async () => {
    const text = '{"app":"argent","version":1,"note":"café"}';
    stubBytes(await gzipText(text));
    expect(await downloadBackupFile('f1', 'token')).toBe(text);
  });

  // Backward compatibility: everything already in the user's Drive folder is
  // plain JSON. If this regressed, upgrading the app would strand every
  // existing backup.
  it('still reads a plain JSON backup written before compression', async () => {
    const text = '{"app":"argent","version":1,"note":"café"}';
    stubBytes(new TextEncoder().encode(text));
    expect(await downloadBackupFile('f1', 'token')).toBe(text);
  });
});

// CompressionStream landed in Safari 16.4, above the browsers Vite's default
// target admits. On anything older the upload must still work, uncompressed —
// this is the branch no amount of running the tests in Node would exercise,
// because Node always has CompressionStream.
describe('uploadBackupToFolder without CompressionStream', () => {
  const payload = { app: 'argent' as const, version: 1, exportedAt: 'x', tables: {} };

  it('falls back to plain JSON and a .json name', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ id: 'f1', name: 'n' }),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    await uploadBackupToFolder('folder-1', payload, 'token');

    const text = await (fetchMock.mock.calls[0][1].body as Blob).text();
    expect(text).toContain('"exportedAt"');
    expect(text).toContain('.json"');
    expect(text).not.toContain('.json.gz');
  });
});
