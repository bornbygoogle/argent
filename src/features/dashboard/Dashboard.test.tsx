// happy-dom ships no IndexedDB, so Dexie needs a shim. This import must come
// before anything that pulls in '@/db/db'.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import i18n from '@/i18n';
import { ToastProvider } from '@/store/ToastContext';
import { AccountScopeProvider } from '@/store/AccountScopeContext';
import { GoogleAuthProvider } from '@/store/GoogleAuthContext';
import { SettingsProvider } from '@/store/SettingsContext';
import { Dashboard } from '@/features/dashboard/Dashboard';
import { db } from '@/db/db';
import type { Account, Recurring as RecurringT } from '@/types/models';

const account = (id: string, name: string): Account => ({
  id,
  name,
  type: 'courant',
  color: '#2B2823',
  icon: 'Wallet',
  openingBalance: 500,
  order: 0,
  archived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const rec = (id: string, label: string, over: Partial<RecurringT> = {}): RecurringT => ({
  id,
  accountId: 'acc-1',
  direction: 'expense',
  label,
  amount: 20,
  cadence: 'mensuel',
  icon: 'ShoppingCart',
  color: '#7C3AED',
  createdAt: '2026-01-01T00:00:00.000Z',
  history: [],
  ...over,
});

const renderDashboard = () =>
  render(
    <MemoryRouter>
      <SettingsProvider>
        <ToastProvider>
          <GoogleAuthProvider>
            <AccountScopeProvider>
              <Dashboard />
            </AccountScopeProvider>
          </GoogleAuthProvider>
        </ToastProvider>
      </SettingsProvider>
    </MemoryRouter>,
  );

beforeEach(async () => {
  await i18n.changeLanguage('en');
  await Promise.all(db.tables.map((t) => t.clear()));
  await db.accounts.add(account('acc-1', 'CIC Commun'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Dashboard — To confirm section', () => {
  it('lists a template whose due day is still ahead of today', async () => {
    // Only Date is faked — faking the timer queue deadlocks Dexie.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 6, 28, 10, 0, 0)); // 28 Jul 2026

    await db.recurrings.bulkAdd([
      rec('r-1', 'Carrefour Banque'), // no due day
      rec('r-2', 'Loyer', { dueDay: 30 }), // due in two days
      rec('r-3', 'EDF', { dueDay: 30 }),
    ]);

    renderDashboard();

    await waitFor(() => expect(screen.getByText('Carrefour Banque')).toBeInTheDocument());
    // The whole complaint: these two must not be filtered out for being ahead.
    expect(screen.getByText('Loyer')).toBeInTheDocument();
    expect(screen.getByText('EDF')).toBeInTheDocument();
  });

  it('leaves out only what is already confirmed for this month', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 6, 28, 10, 0, 0));

    await db.recurrings.bulkAdd([
      rec('r-1', 'Carrefour Banque'),
      rec('r-2', 'Loyer', {
        dueDay: 30,
        history: [{ month: '2026-07', amount: 20, transactionId: 'tx-1' }],
      }),
    ]);

    renderDashboard();

    await waitFor(() => expect(screen.getByText('Carrefour Banque')).toBeInTheDocument());
    expect(screen.queryByText('Loyer')).not.toBeInTheDocument();
  });
});
