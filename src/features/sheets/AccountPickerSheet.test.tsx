// happy-dom ships no IndexedDB, so Dexie needs a shim. This import must come
// before anything that pulls in '@/db/db'.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import i18n from '@/i18n';
import { AccountPickerSheet } from '@/features/sheets/AccountPickerSheet';
import { db } from '@/db/db';
import type { Account } from '@/types/models';

const account = (id: string, name: string, balance: number): Account => ({
  id,
  name,
  type: 'courant',
  color: '#4F46E5',
  icon: 'Wallet',
  openingBalance: balance,
  order: 0,
  archived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
});

beforeEach(async () => {
  await i18n.changeLanguage('fr');
  await Promise.all(db.tables.map((t) => t.clear()));
  await db.accounts.bulkAdd([account('a1', 'CIC Commun', 6044.23), account('a2', 'CA', 681.8)]);
});

const renderSheet = () =>
  render(
    <AccountPickerSheet open title="From" selectedId="a1" onClose={() => {}} onPick={() => {}} />,
  );

describe('AccountPickerSheet layout', () => {
  /**
   * The name and the balance must be siblings inside the row, not nested in a
   * shared wrapper. The rule that stacks a title over its subtitle is scoped to
   * `.row` in index.css, and this button is not a `.row` — so nesting them made
   * two inline spans run together as "CIC Commun6 044,23 €" on screen.
   */
  it('keeps the name and the balance in separate cells of the row', async () => {
    renderSheet();
    await waitFor(() => expect(screen.getByText('CIC Commun')).toBeInTheDocument());

    const name = screen.getByText('CIC Commun');
    const balance = [...document.querySelectorAll('.tnum')].find((el) =>
      /6\s*044/.test(el.textContent ?? ''),
    );

    expect(balance).toBeTruthy();
    // Both must be *direct children of the row button*, which is the flex
    // container — that is what pushes them to opposite ends. Nesting them in a
    // shared wrapper (the old .r-main span) is exactly the broken state, and
    // would still leave them siblings, so sibling-ness alone proves nothing.
    expect(name.parentElement?.tagName).toBe('BUTTON');
    expect(balance!.parentElement?.tagName).toBe('BUTTON');
  });

  it('reserves the tick column so balances line up whether or not a row is selected', async () => {
    renderSheet();
    await waitFor(() => expect(screen.getByText('CIC Commun')).toBeInTheDocument());

    // Account rows only — the sheet's own close button is not one of them.
    const rows = screen.getAllByRole('button').filter((b) => b.querySelector('.tnum'));
    expect(rows).toHaveLength(2);
    const cellCounts = rows.map((r) => r.children.length);
    // Same number of cells on the selected row and the unselected one.
    expect(new Set(cellCounts).size).toBe(1);
  });
});
