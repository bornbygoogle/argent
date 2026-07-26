import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { GoogleAuthProvider, useGoogleAuth } from './GoogleAuthContext';

function Probe() {
  const { status, needsReconnect, offline, email } = useGoogleAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="reconnect">{String(needsReconnect)}</span>
      <span data-testid="offline">{String(offline)}</span>
      <span data-testid="email">{email ?? ''}</span>
    </div>
  );
}

const mount = () => render(<GoogleAuthProvider><Probe /></GoogleAuthProvider>);

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const err = (status: number) => new Response('{}', { status });

beforeEach(() => { localStorage.clear(); });
// unstubAllGlobals is required as well as restoreAllMocks: stubGlobal is NOT
// undone by restoreAllMocks, so without this each test inherits the previous
// test's fetch stub.
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('GoogleAuthProvider boot', () => {
  it('signs in from the session cookie with no user interaction', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      ok({ accessToken: 'at', expiresAt: Date.now() + 3_600_000, email: 'me@example.com' })));
    mount();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-in'));
    expect(screen.getByTestId('email')).toHaveTextContent('me@example.com');
    expect(screen.getByTestId('reconnect')).toHaveTextContent('false');
  });

  it('does NOT ask for reconnect when merely offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    mount();
    await waitFor(() => expect(screen.getByTestId('offline')).toHaveTextContent('true'));
    expect(screen.getByTestId('reconnect')).toHaveTextContent('false');
    expect(screen.getByTestId('status')).toHaveTextContent('signed-out');
  });

  it('does NOT ask for reconnect on a transient 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(err(502)));
    mount();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-out'));
    expect(screen.getByTestId('reconnect')).toHaveTextContent('false');
  });

  it('asks for reconnect ONLY when the grant is revoked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(err(401)));
    mount();
    await waitFor(() => expect(screen.getByTestId('reconnect')).toHaveTextContent('true'));
  });

  it('purges the legacy localStorage token on boot', async () => {
    localStorage.setItem('argent.google.token', 'stale-token');
    localStorage.setItem('argent.google.tokenExpiresAt', '123');
    localStorage.setItem('argent.google.email', 'old@example.com');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(err(401)));
    mount();
    await waitFor(() => {
      expect(localStorage.getItem('argent.google.token')).toBeNull();
      expect(localStorage.getItem('argent.google.tokenExpiresAt')).toBeNull();
      expect(localStorage.getItem('argent.google.email')).toBeNull();
    });
  });

  it('never opens a popup or loads the GIS script on boot', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      ok({ accessToken: 'at', expiresAt: Date.now() + 3_600_000, email: 'me@example.com' })));
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);
    mount();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-in'));
    expect(openSpy).not.toHaveBeenCalled();
    expect(document.querySelector('script[src*="accounts.google.com"]')).toBeNull();
  });
});
