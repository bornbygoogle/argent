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

describe('RecurringFormSheet — the receiving account', () => {
  const twoAccounts = () =>
    db.accounts.bulkAdd([account('acc-1', 'Courant'), account('acc-2', 'Épargne')]);

  const receiverRow = () => screen.getByRole('button', { name: /to account/i });

  const fillAndSave = async (user: ReturnType<typeof userEvent.setup>) => {
    const [label, amount] = textboxes();
    await user.type(label, 'Virement épargne');
    await user.type(amount, '200');
    await user.click(saveButton());
    await waitFor(async () => expect(await db.recurrings.count()).toBe(1));
    return (await db.recurrings.toArray())[0];
  };

  it('starts empty, so an ordinary charge simply debits its account', async () => {
    await twoAccounts();
    const user = userEvent.setup();
    renderSheet();
    await waitFor(() => expect(screen.getByText('Courant')).toBeInTheDocument());

    expect(receiverRow()).toHaveTextContent(/none/i);
    expect((await fillAndSave(user)).receiverAccountId).toBeUndefined();
  });

  it('records the charge against the account the user picks', async () => {
    await twoAccounts();
    const user = userEvent.setup();
    renderSheet();
    await waitFor(() => expect(screen.getByText('Courant')).toBeInTheDocument());

    await user.click(receiverRow());
    await user.click(await screen.findByRole('button', { name: /Épargne/ }));

    expect((await fillAndSave(user)).receiverAccountId).toBe('acc-2');
  });

  it('lets the user take the receiver back off again', async () => {
    await twoAccounts();
    const user = userEvent.setup();
    renderSheet();
    await waitFor(() => expect(screen.getByText('Courant')).toBeInTheDocument());

    await user.click(receiverRow());
    await user.click(await screen.findByRole('button', { name: /Épargne/ }));
    await user.click(receiverRow());
    await user.click(await screen.findByRole('button', { name: /^none$/i }));

    expect(receiverRow()).toHaveTextContent(/none/i);
    expect((await fillAndSave(user)).receiverAccountId).toBeUndefined();
  });

  it('never offers the paying account as its own receiver', async () => {
    await twoAccounts();
    const user = userEvent.setup();
    renderSheet();
    await waitFor(() => expect(screen.getByText('Courant')).toBeInTheDocument());

    await user.click(receiverRow());
    // 'Courant' is the payer, so the picker must not list it — the only text
    // naming it is the account row behind the sheet, which is not a choice.
    await waitFor(() => expect(screen.getByRole('button', { name: /Épargne/ })).toBeInTheDocument());
    expect(screen.queryAllByRole('button', { name: /^Courant/ })).toHaveLength(0);
  });

  it('is offered only for an expense — income arriving is not money being sent on', async () => {
    await twoAccounts();
    const user = userEvent.setup();
    renderSheet();
    await waitFor(() => expect(screen.getByText('Courant')).toBeInTheDocument());

    expect(receiverRow()).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^income$/i }));
    expect(screen.queryByRole('button', { name: /to account/i })).not.toBeInTheDocument();
  });
});
