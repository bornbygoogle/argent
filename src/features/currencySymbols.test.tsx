// happy-dom ships no IndexedDB, so Dexie needs a shim. This import must come
// before anything that pulls in '@/db/db'.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import i18n from '@/i18n';
import { SettingsProvider } from '@/store/SettingsContext';
import { ToastProvider } from '@/store/ToastContext';
import { AccountScopeProvider } from '@/store/AccountScopeContext';
import { db, DEFAULT_SETTINGS } from '@/db/db';
import { setCurrencyStore } from '@/lib/currency';
import { currentMonth } from '@/lib/date';
import { Accounts } from '@/features/accounts/Accounts';
import { Budget } from '@/features/budget/Budget';
import { Onboarding } from '@/features/onboarding/Onboarding';
import { MonthlyOverview } from '@/features/overview/MonthlyOverview';
import { RecurringFormSheet } from '@/features/recurring/RecurringFormSheet';
import { TransactionForm } from '@/features/transactions/TransactionForm';
import { Transfer } from '@/features/transactions/Transfer';
import type { Account, Category, Transaction } from '@/types/models';

/**
 * The euro sign used to be typed straight into the markup, so a user who chose
 * another currency still saw "€" on amount inputs and captions while the
 * formatted amounts beside them followed the setting. Every screen below runs
 * with USD active: the symbol must be "$" and never "€".
 */

const EURO = '€';

const account = (id: string, name: string, order: number): Account => ({
  id,
  name,
  type: 'courant',
  color: '#4F46E5',
  icon: 'Wallet',
  openingBalance: 1000,
  order,
  archived: false,
  createdAt: '2020-01-01T00:00:00.000Z',
});

const category: Category = {
  id: 'cat-test',
  name: 'Test category',
  icon: 'Tag',
  color: '#4F46E5',
  isDefault: false,
  sortOrder: 0,
};

const shell = (ui: React.ReactNode) =>
  render(
    <MemoryRouter>
      <SettingsProvider>
        <ToastProvider>
          <AccountScopeProvider>{ui}</AccountScopeProvider>
        </ToastProvider>
      </SettingsProvider>
    </MemoryRouter>,
  );

/** The element that holds the suffix: the sibling of the amount input. */
const suffixOf = (input: HTMLElement) => input.parentElement as HTMLElement;

beforeEach(async () => {
  await i18n.changeLanguage('en');
  await Promise.all(db.tables.map((t) => t.clear()));
  // Persist USD so SettingsProvider hydrates it instead of resetting to EUR.
  await db.settings.put({ key: 'app', state: { ...DEFAULT_SETTINGS, currency: 'USD' } });
  setCurrencyStore('USD');
  await db.accounts.bulkAdd([account('a1', 'CIC Commun', 0), account('a2', 'CIC Locatif', 1)]);
});

afterEach(() => {
  setCurrencyStore('EUR');
});

describe('Currency symbol follows the active currency', () => {
  it('shows $ instead of the euro sign on the Accounts caption', async () => {
    shell(<Accounts />);

    const caption = await screen.findByText(/·/);
    expect(caption.textContent).toContain('$');
    expect(caption.textContent).not.toContain(EURO);
  });

  it('shows $ instead of the euro sign on the Accounts opening balance input', async () => {
    const user = userEvent.setup();
    shell(<Accounts />);

    await user.click(await screen.findByRole('button', { name: /^\+ add$/i }));
    const input = await screen.findByLabelText(i18n.t('onboarding.openingBalance'));

    expect(suffixOf(input).textContent).toContain('$');
    expect(suffixOf(input).textContent).not.toContain(EURO);
  });

  it('shows $ instead of the euro sign on the Budget category limit input', async () => {
    const user = userEvent.setup();
    await db.categories.add(category);
    shell(<Budget />);

    await user.click(await screen.findByText(category.name));
    const input = await screen.findByLabelText(i18n.t('common.amount'));

    expect(suffixOf(input).textContent).toContain('$');
    expect(suffixOf(input).textContent).not.toContain(EURO);
  });

  it('shows $ instead of the euro sign on the Onboarding sample amounts', async () => {
    shell(<Onboarding />);

    const first = await screen.findByText(/8,40/);
    const second = await screen.findByText(/14,00/);

    expect(first.textContent).toContain('$');
    expect(first.textContent).not.toContain(EURO);
    expect(second.textContent).toContain('$');
    expect(second.textContent).not.toContain(EURO);
  });

  it('shows $ instead of the euro sign on the Onboarding opening balance input', async () => {
    const user = userEvent.setup();
    shell(<Onboarding />);

    await user.click(await screen.findByRole('button', { name: i18n.t('common.continue') }));
    const input = await screen.findByLabelText(i18n.t('onboarding.openingBalance'));

    expect(suffixOf(input).textContent).toContain('$');
    expect(suffixOf(input).textContent).not.toContain(EURO);
  });

  it('shows $ instead of the euro sign on the MonthlyOverview ring total', async () => {
    const tx: Transaction = {
      id: 't1',
      kind: 'expense',
      accountId: 'a1',
      amount: 1234,
      categoryId: 'cat-test',
      date: `${currentMonth()}-01`,
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    };
    await db.categories.add(category);
    await db.transactions.add(tx);
    shell(<MonthlyOverview />);

    await waitFor(() => expect(document.querySelector('svg text')?.textContent).toMatch(/1\s?234/));
    const total = document.querySelector('svg text') as Element;

    expect(total.textContent).toContain('$');
    expect(total.textContent).not.toContain(EURO);
  });

  it('shows $ instead of the euro sign on the RecurringFormSheet amount input', async () => {
    shell(<RecurringFormSheet target="new" onClose={() => {}} />);

    const input = await screen.findByLabelText(i18n.t('common.amount'));

    expect(suffixOf(input).textContent).toContain('$');
    expect(suffixOf(input).textContent).not.toContain(EURO);
  });

  it('shows $ instead of the euro sign on the TransactionForm amount', async () => {
    shell(<TransactionForm kind="expense" />);

    await waitFor(() => expect(document.querySelector('.h2.muted')).toBeTruthy());
    const suffix = document.querySelector('.h2.muted') as Element;

    expect(suffix.textContent).toContain('$');
    expect(suffix.textContent).not.toContain(EURO);
  });

  it('shows $ instead of the euro sign on the Transfer amount', async () => {
    shell(<Transfer />);

    await waitFor(() => expect(document.querySelector('.h2.muted')).toBeTruthy());
    const suffix = document.querySelector('.h2.muted') as Element;

    expect(suffix.textContent).toContain('$');
    expect(suffix.textContent).not.toContain(EURO);
  });

  it('has no literal euro glyph in non-test src/features tsx files', () => {
    const root = resolve(__dirname);
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = resolve(dir, e.name);
        if (e.isDirectory()) return walk(full);
        return e.isFile() && e.name.endsWith('.tsx') && !e.name.includes('.test.') ? [full] : [];
      });

    const offenders = walk(root).filter((f) => readFileSync(f, 'utf8').includes(EURO));

    expect(offenders).toEqual([]);
  });
});
