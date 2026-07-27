import { describe, it, expect, vi, afterEach } from 'vitest';
import { escapeDriveQueryValue, findFolderByName, listBackupsInFolder } from './drive';

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
