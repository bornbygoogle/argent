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
import { Recurring } from '@/features/recurring/Recurring';
import { db } from '@/db/db';
import { backfillOccurrences } from '@/lib/recurringMigration';
import { formatSignedCurrency } from '@/lib/format';
import type { Account, Recurring as RecurringT } from '@/types/models';

const account = (): Account => ({
  id: 'acc-1',
  name: 'Courant',
  type: 'courant',
  color: '#2B2823',
  icon: 'Wallet',
  openingBalance: 0,
  order: 0,
  archived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const recurring = (over: Partial<RecurringT> = {}): RecurringT => ({
  id: 'r-1',
  accountId: 'acc-1',
  direction: 'expense',
  label: 'Garantie décès TRAN',
  amount: 42,
  cadence: 'mensuel',
  icon: 'Shield',
  color: '#7C3AED',
  createdAt: '2026-01-01T00:00:00.000Z',
  history: [],
  ...over,
});

function LocationProbe() {
  const loc = useLocation();
  return <span data-testid="loc">{loc.pathname + loc.search}</span>;
}

const renderScreen = () =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <AccountScopeProvider>
          <Recurring />
        </AccountScopeProvider>
      </ToastProvider>
    </MemoryRouter>,
  );

beforeEach(async () => {
  await i18n.changeLanguage('en');
  await Promise.all(db.tables.map((t) => t.clear()));
  await db.accounts.add(account());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('topping up an account that cannot cover its commitments', () => {
  const renderWithRoutes = () =>
    render(
      <MemoryRouter initialEntries={['/recurring']}>
        <ToastProvider>
          <AccountScopeProvider>
            <Routes>
              <Route path="/recurring" element={<Recurring />} />
              <Route
                path="/transfer"
                element={<LocationProbe />}
              />
            </Routes>
          </AccountScopeProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

  it('offers the shortfall between the account balance and its commitments', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 6, 28, 10, 0, 0));

    await db.accounts.clear();
    await db.accounts.add({ ...account(), name: 'CIC Locatif', openingBalance: 200 });
    await db.recurrings.bulkAdd([
      recurring({ id: 'r-1', label: 'Loyer', amount: 750 }),
      recurring({ id: 'r-2', label: 'Assurance', amount: 42 }),
      recurring({ id: 'r-3', label: 'Taxe', amount: 120 }),
    ]);

    renderWithRoutes();

    // 912 owed, 200 held → 712 short.
    const btn = await screen.findByRole('button', { name: /712/ });
    expect(btn).toBeInTheDocument();
  });

  it('opens the transfer screen with the account and the amount already set', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 6, 28, 10, 0, 0));

    await db.accounts.clear();
    await db.accounts.add({ ...account(), name: 'CIC Locatif', openingBalance: 200 });
    await db.recurrings.add(recurring({ id: 'r-1', label: 'Loyer', amount: 750 }));

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithRoutes();

    await user.click(await screen.findByRole('button', { name: /550/ }));

    expect(screen.getByTestId('loc').textContent).toBe('/transfer?to=acc-1&amount=550');
  });

  it('offers nothing once the balance already covers the commitments', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 6, 28, 10, 0, 0));

    await db.accounts.clear();
    await db.accounts.add({ ...account(), openingBalance: 5000 });
    await db.recurrings.add(recurring({ id: 'r-1', label: 'Loyer', amount: 750 }));

    renderWithRoutes();

    await waitFor(() => expect(screen.getByText('Loyer')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /top up|alimenter/i })).not.toBeInTheDocument();
  });
});

describe('per-account totals in the group heading', () => {
  const heads = () => [...document.querySelectorAll('.section-head')].map((e) => e.textContent ?? '');

  it('nets recurring income against recurring expenses', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 6, 28, 10, 0, 0));

    await db.recurrings.bulkAdd([
      recurring({ id: 'r-1', label: 'Loyer', amount: 750 }),
      recurring({ id: 'r-2', label: 'Salaire', amount: 2000, direction: 'income' }),
    ]);

    renderScreen();

    await waitFor(() => expect(screen.getByText('Loyer')).toBeInTheDocument());
    expect(heads().some((h) => h.includes(formatSignedCurrency(1250)))).toBe(true);
  });

  it('counts a weekly item at its monthly equivalent, not its face value', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 6, 28, 10, 0, 0));

    // 100 a week is 433,33 a month — 52 weeks over 12 months, not four weeks.
    await db.recurrings.add(recurring({ label: 'Courses', amount: 100, cadence: 'hebdo' }));

    renderScreen();

    await waitFor(() => expect(screen.getByText('Courses')).toBeInTheDocument());
    expect(heads().some((h) => h.includes(formatSignedCurrency(-433.33)))).toBe(true);
  });

  it('totals only the rows actually listed under it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 6, 28, 10, 0, 0));

    await db.recurrings.bulkAdd([
      recurring({ id: 'r-1', label: 'Loyer', amount: 750 }),
      // Already settled this month, so it is not listed on the To confirm tab
      // and must not be counted in the figure above it either.
      recurring({
        id: 'r-2',
        label: 'Internet',
        amount: 40,
        history: [{ month: '2026-07', amount: 40, transactionId: 'tx-1', occurrence: '2026-07-01' }],
      }),
    ]);

    renderScreen();

    await waitFor(() => expect(screen.getByText('Loyer')).toBeInTheDocument());
    expect(screen.queryByText('Internet')).not.toBeInTheDocument();
    expect(heads().some((h) => h.includes(formatSignedCurrency(-750)))).toBe(true);
  });
});

describe('an item logged mid-month, then given a due day of 30', () => {
  it('comes back into To confirm, because that payment settled June’s instalment', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 6, 28, 10, 0, 0)); // 28 Jul 2026

    // Logged on 10 July, back when the entry only recorded "July".
    await db.transactions.add({
      id: 'tx-old',
      kind: 'expense',
      accountId: 'acc-1',
      amount: 42,
      date: '2026-07-10',
      createdAt: '2026-07-10T10:00:00.000Z',
      updatedAt: '2026-07-10T10:00:00.000Z',
    });
    await db.recurrings.add(
      recurring({
        label: 'Loyer',
        dueDay: 30,
        history: [{ month: '2026-07', amount: 42, transactionId: 'tx-old' }],
      }),
    );

    // Before the backfill it reads as "July is done" and stays hidden.
    expect(await backfillOccurrences()).toBe(1);

    renderScreen();

    await waitFor(() => expect(screen.getByText('Loyer')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /log/i })).toBeInTheDocument();
    expect(document.querySelector('.row-between')?.textContent ?? '').toContain('1');
  });
});

describe('a due day that has not arrived yet', () => {
  it('still lists the template under To confirm, it does not hide the month’s work', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 6, 28, 10, 0, 0)); // 28 Jul 2026, two days early

    await db.recurrings.bulkAdd([
      recurring({ id: 'r-1', label: 'Loyer', dueDay: 30 }),
      recurring({ id: 'r-2', label: 'EDF', dueDay: 30 }),
    ]);

    renderScreen();

    await waitFor(() => expect(screen.getByText('Loyer')).toBeInTheDocument());
    expect(screen.getByText('EDF')).toBeInTheDocument();

    // Both are confirmable, and neither is exiled to a separate section.
    expect(screen.getAllByRole('button', { name: /log/i })).toHaveLength(2);
    const headings = [...document.querySelectorAll('.section-head .label')].map((el) => el.textContent);
    expect(headings).not.toContain('Upcoming');

    // The count is the month's real workload, not zero.
    expect(document.querySelector('.row-between')?.textContent ?? '').toContain('2');
  });

  it('shows the date on the row so the day is still visible', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 6, 28, 10, 0, 0));

    await db.recurrings.add(recurring({ label: 'Loyer', dueDay: 30 }));
    renderScreen();

    await waitFor(() => expect(screen.getByText('Loyer')).toBeInTheDocument());
    expect(document.body.textContent).toMatch(/Jul 30/);
  });
});

describe('a recurring logged last month, given a due day of 28', () => {
  it('is listed as due again on the 28th of this month', async () => {
    // Only Date is faked — faking the timer queue deadlocks Dexie.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 6, 28, 10, 0, 0)); // 28 Jul 2026

    await db.recurrings.add(
      recurring({
        dueDay: 28,
        history: [{ month: '2026-06', amount: 42, transactionId: 'tx-june' }],
      }),
    );

    renderScreen();

    await waitFor(() => expect(screen.getByText('Garantie décès TRAN')).toBeInTheDocument());
    // Due, not upcoming: it must offer the Log action, not sit out the month.
    expect(screen.getByRole('button', { name: /log/i })).toBeInTheDocument();
    // Check the section headings themselves — the footer hint also contains
    // the word "upcoming" and would make a plain text query lie.
    const headings = [...document.querySelectorAll('.section-head .label')].map((el) => el.textContent);
    expect(headings).not.toContain('Upcoming');
  });

  it('is counted in the To confirm summary, not the Confirmed one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 6, 28, 10, 0, 0));

    await db.recurrings.add(
      recurring({
        dueDay: 28,
        history: [{ month: '2026-06', amount: 42, transactionId: 'tx-june' }],
      }),
    );

    renderScreen();

    await waitFor(() => expect(screen.getByText('Garantie décès TRAN')).toBeInTheDocument());
    const summary = document.querySelector('.row-between')?.textContent ?? '';
    expect(summary).toMatch(/1/); // one to confirm
  });
});

describe('a month that already holds its two instalments', () => {
  const renderWithToasts = () =>
    render(
      <MemoryRouter>
        <ToastProvider>
          <AccountScopeProvider>
            <Recurring />
            <ToastContainer />
          </AccountScopeProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

  /**
   * August already holds its instalment, but history names it not at all — what
   * the concurrent double-press left behind, and the one shape that can still
   * put a row in front of the ceiling. With history empty the month reads as
   * unsettled, so the row sits in To confirm and offers Log again.
   */
  const seedFullMonth = async () => {
    await db.transactions.add({
      id: 'tx-1', kind: 'expense', accountId: 'acc-1', amount: 42,
      date: '2026-08-05', recurringSourceId: 'r-1',
      createdAt: '2026-08-05T10:00:00.000Z', updatedAt: '2026-08-05T10:00:00.000Z',
    });
    await db.recurrings.add(
      recurring({ createdAt: '2026-08-01T00:00:00.000Z', dueDay: 15, history: [] }),
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
    await waitFor(() => expect(screen.getByText('Garantie décès TRAN')).toBeInTheDocument());

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
    await waitFor(() => expect(screen.getByText('Garantie décès TRAN')).toBeInTheDocument());

    await pressLog();

    await waitFor(() => expect(screen.getByText(/already holds an entry/i)).toBeInTheDocument());
    expect(await db.transactions.count()).toBe(1);
  });
});
