// happy-dom ships no IndexedDB, so Dexie needs a shim. This import must come
// before anything that pulls in '@/db/db'.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import i18n from '@/i18n';
import { AccountScopeProvider } from '@/store/AccountScopeContext';
import { MonthlyOverview } from '@/features/overview/MonthlyOverview';
import { db } from '@/db/db';
import type { Account, Recurring } from '@/types/models';

const account: Account = {
  id: 'acc-1',
  name: 'Courant',
  type: 'courant',
  color: '#2B2823',
  icon: 'Wallet',
  openingBalance: 1000,
  order: 0,
  archived: false,
  createdAt: '2020-01-01T00:00:00.000Z',
};

const rec = (id: string, over: Partial<Recurring> = {}): Recurring => ({
  id,
  accountId: 'acc-1',
  direction: 'expense',
  label: 'Rent',
  amount: 100,
  cadence: 'mensuel',
  icon: 'Home',
  color: '#7C3AED',
  createdAt: '2020-01-01T00:00:00.000Z',
  history: [],
  ...over,
});

beforeEach(async () => {
  await i18n.changeLanguage('en');
  await Promise.all(db.tables.map((t) => t.clear()));
  await db.accounts.add(account);
});

const renderOverview = () =>
  render(
    <MemoryRouter>
      <AccountScopeProvider>
        <MonthlyOverview />
      </AccountScopeProvider>
    </MemoryRouter>,
  );

/** A day cell of the month on screen — trailing next-month cells excluded. */
const cell = (day: string) =>
  [...document.querySelectorAll('.cal:not(.dim)')].find((el) => el.textContent === day);

describe('MonthlyOverview recurring markers', () => {
  it('marks the day a recurring charge falls due, and only that day', async () => {
    await db.recurrings.add(rec('r1', { dueDay: 5 }));
    renderOverview();

    await waitFor(() => expect(cell('5')?.querySelector('.cal-dot')).toBeTruthy());
    expect(cell('6')?.querySelector('.cal-dot')).toBeFalsy();
    expect(cell('4')?.querySelector('.cal-dot')).toBeFalsy();
  });

  it('leaves every day bare when nothing recurs', async () => {
    renderOverview();

    await waitFor(() => expect(cell('5')).toBeTruthy());
    expect(document.querySelectorAll('.cal-dot')).toHaveLength(0);
  });

  it('says what the marker means', async () => {
    await db.recurrings.add(rec('r1', { dueDay: 5 }));
    renderOverview();

    expect(await screen.findByText('Recurring')).toBeInTheDocument();
  });
});
