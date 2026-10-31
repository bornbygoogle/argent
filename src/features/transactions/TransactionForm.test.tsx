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
import { TransactionForm } from '@/features/transactions/TransactionForm';
import { db } from '@/db/db';
import * as txLib from '@/lib/transactions';
import type { Account, Category, Transaction } from '@/types/models';

vi.mock('@/lib/transactions', async () => {
  const actual = await vi.importActual<typeof import('@/lib/transactions')>('@/lib/transactions');
  return { ...actual, deleteTransaction: vi.fn(actual.deleteTransaction) };
});

const account: Account = {
  id: 'a1',
  name: 'CIC Commun',
  type: 'courant',
  color: '#4F46E5',
  icon: 'Wallet',
  openingBalance: 1000,
  order: 0,
  archived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const category = (id: string, name: string, sortOrder: number): Category => ({
  id,
  name,
  icon: 'Tag',
  color: '#4F46E5',
  isDefault: false,
  sortOrder,
});

const existing: Transaction = {
  id: 't1',
  kind: 'expense',
  accountId: 'a1',
  amount: 12,
  categoryId: 'cat-courses',
  date: '2026-01-05',
  createdAt: '2026-01-05T00:00:00.000Z',
  updatedAt: '2026-01-05T00:00:00.000Z',
};

const renderAt = (url: string, transaction?: Transaction) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <SettingsProvider>
        <ToastProvider>
          <AccountScopeProvider>
            <Routes>
              <Route path="/" element={<p>HOME-SCREEN</p>} />
              <Route
                path="/expenses/new"
                element={<TransactionForm kind="expense" transaction={transaction} />}
              />
              <Route
                path="/expenses/:id"
                element={<TransactionForm kind="expense" transaction={transaction} />}
              />
            </Routes>
            <ToastContainer />
          </AccountScopeProvider>
        </ToastProvider>
      </SettingsProvider>
    </MemoryRouter>,
  );

async function logFiveEuros() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '5' }));
  const ok = screen.getByRole('button', { name: 'OK' });
  // The default account loads asynchronously; OK stays disabled until it does.
  await waitFor(() => expect(ok).toBeEnabled());
  await user.click(ok);
  await waitFor(() => expect(screen.getByText('HOME-SCREEN')).toBeInTheDocument());
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  await Promise.all(db.tables.map((t) => t.clear()));
  await db.accounts.add(account);
  await db.categories.bulkAdd([
    category('cat-autre', 'Other', 0),
    category('cat-courses', 'Groceries', 1),
  ]);
  vi.mocked(txLib.deleteTransaction).mockClear();
});

describe('category preset from the query string', () => {
  it('ignores an unknown category preset and saves as cat-autre', async () => {
    renderAt('/expenses/new?category=bogus-id');
    await waitFor(() => expect(screen.getByText('CIC Commun')).toBeInTheDocument());

    await logFiveEuros();

    const saved = await db.transactions.toArray();
    expect(saved).toHaveLength(1);
    expect(saved[0].categoryId).toBe('cat-autre');
  });

  it('keeps a valid category preset', async () => {
    renderAt('/expenses/new?category=cat-courses');
    await waitFor(() => expect(screen.getByText('Groceries')).toBeInTheDocument());

    await logFiveEuros();

    const saved = await db.transactions.toArray();
    expect(saved).toHaveLength(1);
    expect(saved[0].categoryId).toBe('cat-courses');
  });
});

describe('deleting a transaction', () => {
  it('keeps the user on the form and shows deleteError when delete rejects', async () => {
    vi.mocked(txLib.deleteTransaction).mockRejectedValueOnce(new Error('boom'));
    await db.transactions.add(existing);
    renderAt('/expenses/t1', existing);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.getByText('Could not delete')).toBeInTheDocument());
    expect(txLib.deleteTransaction).toHaveBeenCalledWith('t1');
    expect(screen.queryByText('HOME-SCREEN')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
  });
});
