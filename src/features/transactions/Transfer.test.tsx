// happy-dom ships no IndexedDB, so Dexie needs a shim. This import must come
// before anything that pulls in '@/db/db'.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import i18n from '@/i18n';
import { SettingsProvider } from '@/store/SettingsContext';
import { ToastProvider } from '@/store/ToastContext';
import { AccountScopeProvider } from '@/store/AccountScopeContext';
import { ToastContainer } from '@/components/ui/Toast';
import { Transfer } from '@/features/transactions/Transfer';
import { db } from '@/db/db';
import * as txLib from '@/lib/transactions';
import type { Account, Transaction } from '@/types/models';

vi.mock('@/lib/transactions', async () => {
  const actual = await vi.importActual<typeof import('@/lib/transactions')>('@/lib/transactions');
  return { ...actual, deleteTransfer: vi.fn(actual.deleteTransfer) };
});

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
              <Route path="/" element={<p>HOME-SCREEN</p>} />
              <Route path="/transfer" element={<Transfer />} />
              <Route path="/transfer/:groupId" element={<Transfer />} />
            </Routes>
            <ToastContainer />
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

describe('Transfer delete failure', () => {
  it('keeps the user on the form and shows deleteError when deleteTransfer rejects', async () => {
    const leg = (id: string, role: 'out' | 'in', accountId: string, counter: string): Transaction => ({
      id,
      kind: 'transfer',
      accountId,
      counterAccountId: counter,
      transferGroupId: 'g1',
      transferRole: role,
      amount: 50,
      date: '2026-01-05',
      createdAt: '2026-01-05T00:00:00.000Z',
      updatedAt: '2026-01-05T00:00:00.000Z',
    });
    await db.transactions.bulkAdd([leg('l1', 'out', 'a1', 'a2'), leg('l2', 'in', 'a2', 'a1')]);
    vi.mocked(txLib.deleteTransfer).mockRejectedValueOnce(new Error('boom'));
    renderAt('/transfer/g1');
    const user = userEvent.setup();

    const trash = await screen.findByRole('button', { name: 'Delete' });
    await user.click(trash);
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.getByText('Could not delete')).toBeInTheDocument());
    expect(txLib.deleteTransfer).toHaveBeenCalledWith('g1');
    expect(screen.queryByText('HOME-SCREEN')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
  });
});
