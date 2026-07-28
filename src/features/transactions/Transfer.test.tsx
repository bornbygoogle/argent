// happy-dom ships no IndexedDB, so Dexie needs a shim. This import must come
// before anything that pulls in '@/db/db'.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import i18n from '@/i18n';
import { SettingsProvider } from '@/store/SettingsContext';
import { ToastProvider } from '@/store/ToastContext';
import { AccountScopeProvider } from '@/store/AccountScopeContext';
import { Transfer } from '@/features/transactions/Transfer';
import { db } from '@/db/db';
import type { Account } from '@/types/models';

const account = (id: string, name: string, order: number): Account => ({
  id,
  name,
  type: 'courant',
  color: '#4F46E5',
  icon: 'Wallet',
  openingBalance: 1000,
  order,
  archived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <SettingsProvider>
        <ToastProvider>
          <AccountScopeProvider>
            <Routes>
              <Route path="/transfer" element={<Transfer />} />
            </Routes>
          </AccountScopeProvider>
        </ToastProvider>
      </SettingsProvider>
    </MemoryRouter>,
  );

beforeEach(async () => {
  await i18n.changeLanguage('en');
  await Promise.all(db.tables.map((t) => t.clear()));
  await db.accounts.bulkAdd([account('a1', 'CIC Commun', 0), account('a2', 'CIC Locatif', 1)]);
});

describe('Transfer prefilled from a link', () => {
  it('sets the destination and the amount from the query string', async () => {
    renderAt('/transfer?to=a2&amount=712');

    await waitFor(() => expect(screen.getByText('CIC Locatif')).toBeInTheDocument());
    // The big display carries the amount, localised.
    expect(document.body.textContent).toMatch(/712/);
  });

  it('never puts the same account on both sides', async () => {
    renderAt('/transfer?to=a1&amount=100');

    await waitFor(() => expect(screen.getByText('CIC Commun')).toBeInTheDocument());
    // a1 is the destination, so the source must be the other account.
    expect(screen.getByText('CIC Locatif')).toBeInTheDocument();
    expect(screen.queryByText(/same account/i)).not.toBeInTheDocument();
  });

  it('ignores a destination that no longer exists', async () => {
    renderAt('/transfer?to=deleted-account&amount=50');

    // Falls back to the ordinary defaults rather than an unsettable picker.
    await waitFor(() => expect(screen.getByText('CIC Commun')).toBeInTheDocument());
    expect(screen.getByText('CIC Locatif')).toBeInTheDocument();
  });

  it('opens empty when no amount is passed', async () => {
    renderAt('/transfer');

    await waitFor(() => expect(screen.getByText('CIC Commun')).toBeInTheDocument());
    expect(screen.queryByText(/712/)).not.toBeInTheDocument();
  });
});
