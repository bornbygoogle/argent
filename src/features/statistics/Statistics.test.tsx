// happy-dom ships no IndexedDB, so Dexie needs a shim. This import must come
// before anything that pulls in '@/db/db'.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import i18n from '@/i18n';
import { exportBackup, downloadBackup } from '@/lib/data';

vi.mock('@/lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data')>()),
  exportBackup: vi.fn(),
  downloadBackup: vi.fn(),
}));
import { AccountScopeProvider } from '@/store/AccountScopeContext';
import { Statistics } from '@/features/statistics/Statistics';
import { currentMonth } from '@/lib/date';
import { db } from '@/db/db';
import type { Account, Category, Subcategory, Transaction } from '@/types/models';

const account: Account = {
  id: 'acc-1',
  name: 'Courant',
  type: 'courant',
  color: '#2B2823',
  icon: 'Wallet',
  openingBalance: 1000,
  order: 0,
  archived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const category = (id: string, name: string, sortOrder: number): Category => ({
  id,
  name,
  icon: 'ShoppingCart',
  color: '#3F8F6B',
  isDefault: false,
  sortOrder,
});

const sub = (id: string, categoryId: string, name: string, sortOrder: number): Subcategory => ({
  id,
  categoryId,
  name,
  sortOrder,
});

const day = (d: string) => `${currentMonth()}-${d}`;

const expense = (
  id: string,
  amount: number,
  categoryId: string,
  subcategoryId?: string,
): Transaction => ({
  id,
  kind: 'expense',
  accountId: 'acc-1',
  amount,
  categoryId,
  subcategoryId,
  date: day('05'),
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

beforeEach(async () => {
  await i18n.changeLanguage('en');
  await Promise.all(db.tables.map((t) => t.clear()));
  await db.accounts.add(account);
  await db.categories.bulkAdd([
    category('cat-alpha', 'Alpha', 0),
    category('cat-beta', 'Beta', 1),
    category('cat-gamma', 'Gamma', 2),
    category('cat-delta', 'Delta', 3),
    category('cat-epsilon', 'Epsilon', 4),
    category('cat-zeta', 'Zeta', 5),
    category('cat-omega', 'Omega', 6),
  ]);
  await db.subcategories.bulkAdd([
    sub('sub-lunch', 'cat-alpha', 'Lunch', 0),
    sub('sub-delivery', 'cat-alpha', 'Delivery', 1),
  ]);
  await db.transactions.bulkAdd([
    expense('t1', 30, 'cat-alpha', 'sub-lunch'),
    expense('t2', 20, 'cat-alpha', 'sub-delivery'),
    expense('t3', 10, 'cat-alpha'),
    expense('t4', 50, 'cat-beta'),
    expense('t5', 40, 'cat-gamma'),
    expense('t6', 25, 'cat-delta'),
    expense('t7', 15, 'cat-epsilon'),
    expense('t8', 5, 'cat-zeta'),
  ]);
});

const renderStats = () =>
  render(
    <MemoryRouter>
      <AccountScopeProvider>
        <Statistics />
      </AccountScopeProvider>
    </MemoryRouter>,
  );

/** The headline figure of the trend card. */
const trendAmount = () => document.querySelector('.amount-lg')?.textContent ?? '';

const pick = async (user: ReturnType<typeof userEvent.setup>, picker: RegExp, option: string) => {
  await user.click(screen.getByRole('button', { name: picker }));
  await user.click(await screen.findByRole('button', { name: option }));
};

describe('Statistics category filter', () => {
  it('lists only the top five categories, with the rest behind "show all"', async () => {
    const user = userEvent.setup();
    renderStats();

    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    expect(screen.queryByText('Zeta')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Show all 6 categories/i }));

    expect(screen.getByText('Zeta')).toBeInTheDocument();
  });

  it('filters the whole screen to the chosen category', async () => {
    const user = userEvent.setup();
    renderStats();
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());

    await pick(user, /^Category/i, 'Alpha');

    // 30 + 20 + 10, not the 195 of every category.
    await waitFor(() => expect(trendAmount()).toMatch(/60[.,]00/));
    expect(screen.getByText('Top subcategories')).toBeInTheDocument();
    expect(screen.getByText('Lunch')).toBeInTheDocument();
    expect(screen.getByText('Delivery')).toBeInTheDocument();
    expect(screen.getByText('No subcategory')).toBeInTheDocument();
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
  });

  it('narrows to a single sub-category of the chosen category', async () => {
    const user = userEvent.setup();
    renderStats();
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());

    await pick(user, /^Category/i, 'Alpha');
    await pick(user, /^Subcategory/i, 'Lunch');

    await waitFor(() => expect(trendAmount()).toMatch(/30[.,]00/));
    // One row restating the headline is noise, so the breakdown card goes away.
    expect(screen.queryByText('Top subcategories')).not.toBeInTheDocument();
  });

  it('drops the sub-category when the category changes', async () => {
    const user = userEvent.setup();
    renderStats();
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());

    await pick(user, /^Category/i, 'Alpha');
    await pick(user, /^Subcategory/i, 'Lunch');
    await pick(user, /^Category/i, 'Beta');

    // Beta's whole total — not zero, which is what a stale "Lunch" would give.
    await waitFor(() => expect(trendAmount()).toMatch(/50[.,]00/));
  });

  it('shows no breakdown for a category that has no sub-categories', async () => {
    const user = userEvent.setup();
    renderStats();
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());

    await pick(user, /^Category/i, 'Beta');

    await waitFor(() => expect(trendAmount()).toMatch(/50[.,]00/));
    // A single "No subcategory" row is a card that says nothing.
    expect(screen.queryByText('Top subcategories')).not.toBeInTheDocument();
    expect(screen.queryByText('No subcategory')).not.toBeInTheDocument();
  });

  it('keeps the pickers reachable when the filter matches nothing', async () => {
    const user = userEvent.setup();
    renderStats();
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());

    await pick(user, /^Category/i, 'Omega');

    expect(await screen.findByText('No spend for this filter')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Category/i })).toBeInTheDocument();
  });
});

describe('Statistics week view and export', () => {
  const realTZ = process.env.TZ;

  afterEach(() => {
    vi.useRealTimers();
    if (realTZ === undefined) delete process.env.TZ;
    else process.env.TZ = realTZ;
    vi.mocked(exportBackup).mockReset();
    vi.mocked(downloadBackup).mockReset();
  });

  it('labels the week bars with the right weekday west of UTC', async () => {
    process.env.TZ = 'America/New_York';
    // Local noon on Friday 2026-10-30.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 30, 12, 0, 0));
    await db.transactions.add({ ...expense('t-today', 12, 'cat-alpha'), date: '2026-10-30' });

    const user = userEvent.setup({ advanceTimers: () => {} });
    renderStats();
    await user.click(await screen.findByRole('button', { name: 'Week' }));

    // Sat, Sun, Mon, Tue, Wed, Thu, Fri (stats.weekShort is Monday-first).
    const expected = [5, 6, 0, 1, 2, 3, 4].map((i) => i18n.t(`stats.weekShort.${i}`));
    await waitFor(() => {
      const titles = Array.from(document.querySelectorAll('div[title]')).map((el) =>
        el.getAttribute('title'),
      );
      expect(titles).toEqual(expected);
    });
  });

  it('shows the export error banner when the backup export fails', async () => {
    vi.mocked(exportBackup).mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    renderStats();

    await user.click(screen.getByRole('button', { name: i18n.t('settings.export') }));

    expect(await screen.findByText(i18n.t('settings.exportError'))).toBeInTheDocument();
    expect(downloadBackup).not.toHaveBeenCalled();
  });

  it('does not show the export error banner when the export succeeds', async () => {
    vi.mocked(exportBackup).mockResolvedValue({} as Awaited<ReturnType<typeof exportBackup>>);
    const user = userEvent.setup();
    renderStats();

    await user.click(screen.getByRole('button', { name: i18n.t('settings.export') }));

    await waitFor(() => expect(downloadBackup).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(i18n.t('settings.exportError'))).not.toBeInTheDocument();
  });
});
