// happy-dom ships no IndexedDB, so Dexie needs a shim. This import must come
// before anything that pulls in '@/db/db'.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import i18n from '@/i18n';
import { ToastProvider } from '@/store/ToastContext';
import { AccountScopeProvider } from '@/store/AccountScopeContext';
import { Recurring } from '@/features/recurring/Recurring';
import { db } from '@/db/db';
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
