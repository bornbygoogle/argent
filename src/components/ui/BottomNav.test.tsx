import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import '@/i18n';
import { BottomNav } from '@/components/ui/BottomNav';

function hrefs(container: HTMLElement): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of Array.from(container.querySelectorAll('a'))) {
    const href = a.getAttribute('href') ?? '';
    out[href.split('?')[0]] = href;
  }
  return out;
}

function renderAt(path: string) {
  const { container } = render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>,
  );
  return hrefs(container);
}

describe('BottomNav', () => {
  it('links to every tab root', () => {
    const links = renderAt('/');
    expect(Object.keys(links).sort()).toEqual(['/', '/overview', '/settings', '/stats']);
  });

  // The account scope is app-wide state that every tab reads, but it lives in
  // the URL. A tab link without it silently resets the user's filter — and
  // Statistics has no picker of its own, so there is nothing to notice it by.
  it('carries the selected account across tabs', () => {
    const links = renderAt('/expenses?account=acc-1');
    expect(links['/stats']).toContain('account=acc-1');
    expect(links['/overview']).toContain('account=acc-1');
    expect(links['/settings']).toContain('account=acc-1');
    expect(links['/']).toContain('account=acc-1');
  });

  it('omits the param entirely when the scope is all accounts', () => {
    const links = renderAt('/expenses');
    expect(links['/stats']).toBe('/stats');
    expect(links['/']).toBe('/');
  });

  it('does not drag screen-specific params across tabs', () => {
    // ?category= is a preset for the expense form, meaningless on Stats.
    const links = renderAt('/add?category=cat-restaurant&account=acc-1');
    expect(links['/stats']).toContain('account=acc-1');
    expect(links['/stats']).not.toContain('category');
  });

  it('round-trips an account id containing characters that need encoding', () => {
    const links = renderAt('/expenses?account=a%20b%26c');
    // Asserting the decoded value, not a particular encoding: URLSearchParams
    // may write a space as '+', which is valid and parses back identically.
    const search = new URLSearchParams(links['/stats'].split('?')[1]);
    expect(search.get('account')).toBe('a b&c');
  });
});
