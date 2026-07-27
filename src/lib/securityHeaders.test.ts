// Pins the response headers Vercel serves. The CSP is only as good as its
// script-src, and the inline theme script in index.html is allowed by hash —
// edit that script and the hash stops matching, which silently blanks the page
// on the theme it was meant to set. This test fails instead.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root = process.cwd();
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const vercel = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};

const served = new Map(vercel.headers[0].headers.map((h) => [h.key.toLowerCase(), h.value]));
const csp = served.get('content-security-policy') ?? '';

/** Every <script> block in index.html that has no src — these need a hash. */
function inlineScripts(): string[] {
  return [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

function sha256(body: string): string {
  return `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;
}

/** Read one directive's source list out of the policy. */
function directive(name: string): string[] {
  const found = csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d === name || d.startsWith(`${name} `));
  return found ? found.split(/\s+/).slice(1) : [];
}

describe('Content-Security-Policy', () => {
  it('is served on every response', () => {
    expect(vercel.headers[0].source).toBe('/(.*)');
    expect(csp).not.toBe('');
  });

  it('allows every inline script in index.html by hash', () => {
    const scripts = inlineScripts();
    expect(scripts.length).toBeGreaterThan(0);
    for (const body of scripts) {
      expect(directive('script-src')).toContain(sha256(body));
    }
  });

  // The whole point of the policy: an injected string must not become script.
  it('never allows inline or eval script', () => {
    expect(directive('script-src')).not.toContain("'unsafe-inline'");
    expect(directive('script-src')).not.toContain("'unsafe-eval'");
  });

  it('locks down the sinks an injection would reach for', () => {
    expect(directive('object-src')).toEqual(["'none'"]);
    expect(directive('base-uri')).toEqual(["'none'"]);
    expect(directive('form-action')).toEqual(["'self'"]);
  });

  // /settings carries one-click sign-out, restore and wipe.
  it('cannot be framed', () => {
    expect(directive('frame-ancestors')).toEqual(["'none'"]);
    expect(served.get('x-frame-options')).toBe('DENY');
  });

  it('keeps the Google Picker working', () => {
    expect(directive('script-src')).toContain('https://apis.google.com');
    expect(directive('frame-src')).toContain('https://docs.google.com');
    expect(directive('connect-src')).toContain('https://www.googleapis.com');
  });

  it('lets the app talk to its own API and service worker', () => {
    expect(directive('connect-src')).toContain("'self'");
    expect(directive('worker-src')).toContain("'self'");
  });
});

describe('other security headers', () => {
  // unsafe-url leaked the full path + query to every cross-origin destination,
  // and did not strip on an HTTPS -> HTTP downgrade. Google's API-key referrer
  // check only ever looks at the origin.
  it('does not leak the full URL cross-origin', () => {
    expect(served.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
  });

  it('forbids MIME sniffing', () => {
    expect(served.get('x-content-type-options')).toBe('nosniff');
  });

  // Required for the Google Picker popup, which COOP: same-origin would sever.
  it('keeps the popup opener relationship the Picker needs', () => {
    expect(served.get('cross-origin-opener-policy')).toBe('same-origin-allow-popups');
  });
});
