import { describe, it, expect } from 'vitest';
import { serializeCookie, parseCookies, SESSION_COOKIE } from './cookies.js';

describe('serializeCookie', () => {
  it('emits the security flags', () => {
    const c = serializeCookie(SESSION_COOKIE, 'abc', { maxAge: 600, secure: true });
    expect(c).toContain('argent_session=abc');
    expect(c).toContain('HttpOnly');
    expect(c).toContain('Secure');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Path=/');
    expect(c).toContain('Max-Age=600');
  });

  it('omits Secure on an insecure origin so localhost works', () => {
    const c = serializeCookie(SESSION_COOKIE, 'abc', { maxAge: 600, secure: false });
    expect(c).not.toContain('Secure');
  });

  it('honours a custom path', () => {
    const c = serializeCookie('x', 'y', { maxAge: 60, secure: true, path: '/api/auth' });
    expect(c).toContain('Path=/api/auth');
  });

  it('encodes the value', () => {
    expect(serializeCookie('x', 'a b;c', { maxAge: 1, secure: false })).toContain('x=a%20b%3Bc');
  });

  it('expires the cookie when maxAge is 0', () => {
    expect(serializeCookie('x', '', { maxAge: 0, secure: false })).toContain('Max-Age=0');
  });
});

describe('parseCookies', () => {
  it('parses several cookies', () => {
    expect(parseCookies('a=1; b=2; argent_session=xyz')).toEqual({
      a: '1', b: '2', argent_session: 'xyz',
    });
  });

  it('decodes values', () => {
    expect(parseCookies('x=a%20b')).toEqual({ x: 'a b' });
  });

  it('returns an empty object for a missing header', () => {
    expect(parseCookies(null)).toEqual({});
    expect(parseCookies('')).toEqual({});
  });

  it('ignores malformed pairs', () => {
    expect(parseCookies('novalue; a=1')).toEqual({ a: '1' });
  });
});
