// happy-dom ships no IndexedDB, so Dexie needs a shim. This import must come
// before anything that pulls in '@/db/db'.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AccountScopeProvider, useAccountScope } from '@/store/AccountScopeContext';
import { db } from '@/db/db';
import type { Account } from '@/types/models';

const account = (id: string, name: string, archived = false): Account => ({
  id,
  name,
  type: 'courant',
  color: '#2B2823',
  icon: 'Wallet',
  openingBalance: 0,
  order: 0,
  archived,
  createdAt: '2026-01-01T00:00:00.000Z',
});

beforeEach(async () => {
  await db.accounts.clear();
  await db.accounts.bulkAdd([account('acc-1', 'Courant'), account('acc-2', 'Livret')]);
});

function Probe() {
  const { scope, setScope, accounts } = useAccountScope();
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <span data-testid="path">{location.pathname}</span>
      <span data-testid="search">{location.search}</span>
      <span data-testid="scope">{scope}</span>
      <span data-testid="count">{accounts.length}</span>
      <button type="button" onClick={() => setScope('acc-1')}>
        pick
      </button>
      <button type="button" onClick={() => setScope('all')}>
        all
      </button>
      <button type="button" onClick={() => navigate('/expenses')}>
        go-expenses
      </button>
    </div>
  );
}

/** Mirrors App.tsx: the provider wraps <Routes>, so it has no route match of
 *  its own. That topology is exactly what made scope changes navigate away. */
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AccountScopeProvider>
        <Routes>
          <Route path="/" element={<Probe />} />
          <Route path="/expenses" element={<Probe />} />
          <Route path="/stats" element={<Probe />} />
          <Route path="/budget" element={<Probe />} />
        </Routes>
      </AccountScopeProvider>
    </MemoryRouter>,
  );
}

const ready = () => waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'));

describe('AccountScopeProvider keeps you on the screen you are on', () => {
  it('stays on /expenses when an account is picked', async () => {
    const user = userEvent.setup();
    renderAt('/expenses');
    await ready();

    await user.click(screen.getByText('pick'));

    expect(screen.getByTestId('path')).toHaveTextContent('/expenses');
    expect(screen.getByTestId('scope')).toHaveTextContent('acc-1');
    expect(screen.getByTestId('search')).toHaveTextContent('account=acc-1');
  });

  // The reported bug: reaching Movements by tapping through the app rather than
  // by loading its URL. Neither `scope` nor `accounts` changes on that
  // navigation, so a context value memoised without `setScope` hands consumers
  // the closure built on the previous screen — and the scope change then
  // navigates back to it.
  it('stays on /expenses after navigating there from the dashboard', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await ready();

    await user.click(screen.getByText('go-expenses'));
    expect(screen.getByTestId('path')).toHaveTextContent('/expenses');

    await user.click(screen.getByText('pick'));

    expect(screen.getByTestId('path')).toHaveTextContent('/expenses');
    expect(screen.getByTestId('scope')).toHaveTextContent('acc-1');
  });

  it('stays on /stats when an account is picked', async () => {
    const user = userEvent.setup();
    renderAt('/stats');
    await ready();

    await user.click(screen.getByText('pick'));

    expect(screen.getByTestId('path')).toHaveTextContent('/stats');
    expect(screen.getByTestId('scope')).toHaveTextContent('acc-1');
  });

  it('stays on the screen when the scope is reset to "all"', async () => {
    const user = userEvent.setup();
    renderAt('/expenses?account=acc-1');
    await ready();
    expect(screen.getByTestId('scope')).toHaveTextContent('acc-1');

    await user.click(screen.getByText('all'));

    expect(screen.getByTestId('path')).toHaveTextContent('/expenses');
    expect(screen.getByTestId('scope')).toHaveTextContent('all');
    // 'all' is the default, so it is dropped from the URL rather than spelled out.
    expect(screen.getByTestId('search')).not.toHaveTextContent('account=');
  });

  it('preserves unrelated query params', async () => {
    const user = userEvent.setup();
    renderAt('/expenses?filter=income');
    await ready();

    await user.click(screen.getByText('pick'));

    expect(screen.getByTestId('search')).toHaveTextContent('filter=income');
    expect(screen.getByTestId('search')).toHaveTextContent('account=acc-1');
  });

  it('drops an account param that no longer resolves, without leaving the screen', async () => {
    renderAt('/budget?account=deleted-account');

    await waitFor(() => {
      expect(screen.getByTestId('scope')).toHaveTextContent('all');
    });
    expect(screen.getByTestId('path')).toHaveTextContent('/budget');
    expect(screen.getByTestId('search')).not.toHaveTextContent('deleted-account');
  });
});
