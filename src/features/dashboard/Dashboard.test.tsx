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
import type { Account, Recurring as RecurringT, Transaction } from '@/types/models';

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


// Paid on the 26th, the salary that lands in August is September's money. The
// month already spent behind it came out of July's pay, so charging it against
// the salary the moment it is logged reads as "over by a month's spending" —
// the whole point of the budget month following payday instead of the calendar.
describe('Dashboard — the budget month follows payday', () => {
  const tx = (over: Partial<Transaction> & Pick<Transaction, 'id' | 'amount' | 'date'>): Transaction => ({
    kind: 'expense',
    accountId: 'acc-1',
    createdAt: `${over.date}T10:00:00.000Z`,
    updatedAt: `${over.date}T10:00:00.000Z`,
    ...over,
  });

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 27, 10, 0, 0)); // 27 Aug 2026, salary in

    await db.recurrings.bulkAdd([
      rec('r-sal', 'Salary', {
        direction: 'income',
        amount: 2900,
        dueDay: 26,
        history: [
          { month: '2026-08', amount: 2900, transactionId: 'tx-sal', occurrence: '2026-08-26' },
        ],
      }),
      rec('r-rent', 'Loyer', { amount: 900, dueDay: 5 }),
    ]);
    await db.transactions.bulkAdd([
      tx({ id: 'tx-old', amount: 2050, date: '2026-08-10' }), // lived on July's pay
      tx({ id: 'tx-sal', kind: 'income', amount: 2900, date: '2026-08-26', recurringSourceId: 'r-sal' }),
      tx({ id: 'tx-new', amount: 50, date: '2026-08-27' }),
    ]);
  });

  it('starts from the balance and subtracts only the bills still to come', async () => {
    const { container } = renderDashboard();

    await waitFor(() => expect(screen.getByText('Left to spend')).toBeInTheDocument());
    // Balance 500 − 2050 + 2900 − 50 = 1300; rent 900 not yet debited → 400.
    expect(container.querySelector('.hero-figure')).toHaveTextContent('400');
    expect(screen.queryByText(/Over by/)).not.toBeInTheDocument();
  });

  it('measures the runway to the next payday', async () => {
    renderDashboard();

    // 27 Aug → 25 Sep inclusive.
    await waitFor(() => expect(screen.getByText('30 days left')).toBeInTheDocument());
  });
});

// The ordinary case: no recurring template for your own pay, you log it when it
// lands. The payment itself has to anchor the budget month, or the anchor never
// fires for anyone who does it that way.
describe('Dashboard — payday read from the salary that landed', () => {
  it('follows a salary logged as a plain movement', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 27, 10, 0, 0)); // 27 Aug 2026

    await db.recurrings.add(rec('r-rent', 'Loyer', { amount: 900, dueDay: 5 }));
    await db.transactions.bulkAdd([
      {
        id: 'tx-old', kind: 'expense', accountId: 'acc-1', amount: 2050, date: '2026-08-10',
        createdAt: '2026-08-10T10:00:00.000Z', updatedAt: '2026-08-10T10:00:00.000Z',
      },
      {
        id: 'tx-sal', kind: 'income', accountId: 'acc-1', amount: 2979.53, date: '2026-08-26',
        incomeType: 'Salaire',
        createdAt: '2026-08-26T10:00:00.000Z', updatedAt: '2026-08-26T10:00:00.000Z',
      },
      {
        id: 'tx-new', kind: 'expense', accountId: 'acc-1', amount: 50, date: '2026-08-27',
        createdAt: '2026-08-27T10:00:00.000Z', updatedAt: '2026-08-27T10:00:00.000Z',
      },
    ]);

    const { container } = renderDashboard();

    await waitFor(() => expect(screen.getByText('Left to spend')).toBeInTheDocument());
    // Balance 500 − 2050 + 2979,53 − 50 = 1379,53; rent 900 to come → 479,53.
    expect(container.querySelector('.hero-figure')).toHaveTextContent('479,53');
    expect(screen.getByText('30 days left')).toBeInTheDocument();
  });
});

// A debited bill must not move the figure: the balance drops and the upcoming
// bills drop by the same amount. Only real spending moves it.
describe('Dashboard — a settled bill leaves the figure alone', () => {
  it('does not subtract a bill that is already out of the balance', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 27, 10, 0, 0));

    await db.recurrings.add(
      rec('r-rent', 'Loyer', {
        amount: 900,
        dueDay: 27,
        history: [
          { month: '2026-08', amount: 900, transactionId: 'tx-rent', occurrence: '2026-08-27' },
        ],
      }),
    );
    await db.transactions.bulkAdd([
      {
        id: 'tx-sal', kind: 'income', accountId: 'acc-1', amount: 2979.53, date: '2026-08-26',
        incomeType: 'Salaire',
        createdAt: '2026-08-26T10:00:00.000Z', updatedAt: '2026-08-26T10:00:00.000Z',
      },
      {
        id: 'tx-rent', kind: 'expense', accountId: 'acc-1', amount: 900, date: '2026-08-27',
        recurringSourceId: 'r-rent',
        createdAt: '2026-08-27T10:00:00.000Z', updatedAt: '2026-08-27T10:00:00.000Z',
      },
    ]);

    const { container } = renderDashboard();

    await waitFor(() => expect(screen.getByText('Left to spend')).toBeInTheDocument());
    // Balance 500 + 2979,53 − 900 = 2579,53; nothing left to come.
    expect(container.querySelector('.hero-figure')).toHaveTextContent('2 579,53');
  });
});
