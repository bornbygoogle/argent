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

/**
 * The donut's two <text> nodes were left behind when the palette moved from
 * cold slate to the warm "Ink & Signal" ramp. Hardcoded #0F172A measured
 * 1.01:1 against the dark card — the month total, invisible — and #94A3B8
 * measured 2.56:1 on the light card. The legend beside them was already on
 * tokens, which is why nobody noticed. These keep both on tokens, where the
 * theme can follow them.
 */
describe('MonthlyOverview donut labels', () => {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const seedOneCategorisedExpense = async () => {
    await db.categories.add({
      id: 'cat-1', name: 'Courses', icon: 'ShoppingCart',
      color: '#2F8F62', isDefault: false, sortOrder: 0,
    });
    await db.transactions.add({
      id: 'tx-1', kind: 'expense', accountId: 'acc-1', amount: 42,
      categoryId: 'cat-1', date: iso,
      createdAt: `${iso}T00:00:00.000Z`, updatedAt: `${iso}T00:00:00.000Z`,
    });
  };

  const donutText = () => [...document.querySelectorAll('svg text')];

  it('paints both donut labels from theme tokens, never a fixed hex', async () => {
    await seedOneCategorisedExpense();
    renderOverview();

    await waitFor(() => expect(donutText().length).toBeGreaterThan(0));

    for (const node of donutText()) {
      expect(node.getAttribute('fill')).toMatch(/^var\(--/);
    }
  });

  it('gives the month total the same ink as every other headline figure', async () => {
    await seedOneCategorisedExpense();
    renderOverview();

    await waitFor(() => expect(donutText().length).toBeGreaterThan(0));

    expect(donutText()[0].getAttribute('fill')).toBe('var(--neutral-900)');
  });
});
