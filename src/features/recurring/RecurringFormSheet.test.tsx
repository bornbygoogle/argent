// happy-dom ships no IndexedDB, so Dexie needs a shim. This import must come
// before anything that pulls in '@/db/db'.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import i18n from '@/i18n';
import { AccountScopeProvider } from '@/store/AccountScopeContext';
import { RecurringFormSheet } from '@/features/recurring/RecurringFormSheet';
import { db } from '@/db/db';
import type { Account } from '@/types/models';

const account = (id: string, name: string): Account => ({
  id,
  name,
  type: 'courant',
  color: '#2B2823',
  icon: 'Wallet',
  openingBalance: 0,
  order: 0,
  archived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const renderSheet = () =>
  render(
    <MemoryRouter>
      <AccountScopeProvider>
        <RecurringFormSheet target="new" onClose={() => {}} />
      </AccountScopeProvider>
    </MemoryRouter>,
  );

/** [label, amount, due day] in DOM order — robust to the active language. */
const textboxes = () => screen.getAllByRole('textbox') as HTMLInputElement[];
const saveButton = () => screen.getByRole('button', { name: /^save$/i });

beforeEach(async () => {
  await i18n.changeLanguage('en');
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('RecurringFormSheet — new recurring', () => {
  it('saves onto the first account without the user opening the account picker', async () => {
    await db.accounts.add(account('acc-1', 'Courant'));
    const user = userEvent.setup();
    renderSheet();

    // The account list arrives from a live query, one tick after first render.
    await waitFor(() => expect(screen.getByText('Courant')).toBeInTheDocument());

    const [label, amount, dueDay] = textboxes();
    await user.type(label, 'Garantie décès TRAN');
    await user.type(amount, '42');
    await user.type(dueDay, '28');
    await user.click(saveButton());

    // The whole point: pressing an enabled Save must write something.
    await waitFor(async () => {
      const rows = await db.recurrings.toArray();
      expect(rows).toHaveLength(1);
    });
    const [saved] = await db.recurrings.toArray();
    expect(saved.label).toBe('Garantie décès TRAN');
    expect(saved.accountId).toBe('acc-1');
    expect(saved.dueDay).toBe(28);
  });

  it('disables Save rather than failing silently when there is no account at all', async () => {
    const user = userEvent.setup();
    renderSheet();

    const [label, amount] = textboxes();
    await user.type(label, 'Orphan');
    await user.type(amount, '10');

    // With no account to attach it to, saving cannot succeed — say so with a
    // dead button instead of swallowing the click.
    expect(saveButton()).toBeDisabled();
    expect(await db.recurrings.count()).toBe(0);
  });
});
