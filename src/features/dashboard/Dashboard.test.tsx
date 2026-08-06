// happy-dom ships no IndexedDB, so Dexie needs a shim. This import must come
// before anything that pulls in '@/db/db'.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import i18n from '@/i18n';
import { ToastProvider } from '@/store/ToastContext';
import { ToastContainer } from '@/components/ui/Toast';
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

function LocationProbe() {
  const loc = useLocation();
  return <span data-testid="loc">{loc.pathname + loc.search}</span>;
}

const renderScoped = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <SettingsProvider>
        <ToastProvider>
          <GoogleAuthProvider>
            <AccountScopeProvider>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/expenses" element={<LocationProbe />} />
                <Route path="/budget" element={<LocationProbe />} />
                <Route path="/recurring" element={<LocationProbe />} />
              </Routes>
            </AccountScopeProvider>
          </GoogleAuthProvider>
        </ToastProvider>
      </SettingsProvider>
    </MemoryRouter>,
  );

describe('leaving the dashboard keeps the selected account', () => {
  it('carries the scope through "See all" into the movements list', async () => {
    await db.transactions.add({
      id: 'tx-1',
      kind: 'expense',
      accountId: 'acc-1',
      amount: 12,
      date: '2026-07-20',
      createdAt: '2026-07-20T10:00:00.000Z',
      updatedAt: '2026-07-20T10:00:00.000Z',
    });
    const user = userEvent.setup();
    renderScoped('/?account=acc-1');

    await user.click(await screen.findByRole('button', { name: /see all/i }));

    // Selecting CIC Locatif then tapping See all must not land on All accounts.
    expect(screen.getByTestId('loc').textContent).toBe('/expenses?account=acc-1');
  });

  it('carries the scope into the recurring screen', async () => {
    await db.recurrings.add(rec('r-1', 'Loyer'));
    const user = userEvent.setup();
    renderScoped('/?account=acc-1');

    await user.click(await screen.findByRole('button', { name: /manage/i }));

    expect(screen.getByTestId('loc').textContent).toBe('/recurring?account=acc-1');
  });

  it('adds no query string when no account is selected', async () => {
    await db.transactions.add({
      id: 'tx-1',
      kind: 'expense',
      accountId: 'acc-1',
      amount: 12,
      date: '2026-07-20',
      createdAt: '2026-07-20T10:00:00.000Z',
      updatedAt: '2026-07-20T10:00:00.000Z',
    });
    const user = userEvent.setup();
    renderScoped('/');

    await user.click(await screen.findByRole('button', { name: /see all/i }));

    expect(screen.getByTestId('loc').textContent).toBe('/expenses');
  });
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

describe('Dashboard — logging a recurring the month can no longer hold', () => {
  const renderWithToasts = () =>
    render(
      <MemoryRouter>
        <SettingsProvider>
          <ToastProvider>
            <GoogleAuthProvider>
              <AccountScopeProvider>
                <Dashboard />
                <ToastContainer />
              </AccountScopeProvider>
            </GoogleAuthProvider>
          </ToastProvider>
        </SettingsProvider>
      </MemoryRouter>,
    );

  /**
   * A transaction the template owns but history does not name — what a
   * concurrent double-press leaves behind, and the one shape that still puts a
   * row in front of the ceiling. History being empty, the month reads unsettled,
   * so the row sits in "To confirm" and offers Log again. The same fixture the
   * Recurring screen's ceiling tests use.
   */
  const seedFullMonth = async () => {
    await db.transactions.add({
      id: 'tx-1', kind: 'expense', accountId: 'acc-1', amount: 20,
      date: '2026-08-05', recurringSourceId: 'r-1',
      createdAt: '2026-08-05T10:00:00.000Z', updatedAt: '2026-08-05T10:00:00.000Z',
    });
    await db.recurrings.add(
      rec('r-1', 'Loyer', { createdAt: '2026-08-01T00:00:00.000Z', dueDay: 15 }),
    );
  };

  const pressLog = async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(await screen.findByRole('button', { name: /log/i }));
    await user.click(await screen.findByRole('button', { name: /^confirm$/i }));
  };

  it('says the month is full instead of claiming a transaction was recorded', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 28, 10, 0, 0)); // 28 Aug 2026

    await seedFullMonth();
    renderWithToasts();
    await waitFor(() => expect(screen.getByText('Loyer')).toBeInTheDocument());

    await pressLog();

    await waitFor(() =>
      expect(screen.getByText(/already holds an entry/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText('Transaction recorded')).not.toBeInTheDocument();
  });

  it('records no second transaction', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 28, 10, 0, 0));

    await seedFullMonth();
    renderWithToasts();
    await waitFor(() => expect(screen.getByText('Loyer')).toBeInTheDocument());

    await pressLog();

    await waitFor(async () => expect(await db.transactions.count()).toBe(1));
  });

  it('still confirms, and says so, when the month has room', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 28, 10, 0, 0));

    await db.recurrings.add(
      rec('r-1', 'Loyer', { createdAt: '2026-08-01T00:00:00.000Z', dueDay: 15 }),
    );
    renderWithToasts();
    await waitFor(() => expect(screen.getByText('Loyer')).toBeInTheDocument());

    await pressLog();

    await waitFor(() => expect(screen.getByText('Transaction recorded')).toBeInTheDocument());
    expect(await db.transactions.count()).toBe(1);
  });
});
