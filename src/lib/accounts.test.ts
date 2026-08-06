// Deleting an account must leave every recurring template still meaningful —
// including the ones that name a receiver.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/db';
import { deleteAccountWithReassign } from '@/lib/accounts';
import type { Account, Recurring } from '@/types/models';

const account = (id: string, over: Partial<Account> = {}): Account => ({
  id,
  name: id,
  type: 'courant',
  color: '#000',
  icon: 'Wallet',
  openingBalance: 0,
  order: 0,
  archived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const rec = (over: Partial<Recurring> = {}): Recurring => ({
  id: 'r-1',
  accountId: 'acc-payer',
  direction: 'expense',
  label: 'Épargne',
  amount: 200,
  cadence: 'mensuel',
  icon: 'PiggyBank',
  color: '#000',
  createdAt: '2026-01-01T00:00:00.000Z',
  history: [],
  ...over,
});

const load = async (id = 'r-1'): Promise<Recurring> => {
  const r = await db.recurrings.get(id);
  if (!r) throw new Error(`recurring ${id} vanished`);
  return r;
};

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await db.accounts.bulkAdd([
    account('acc-payer'),
    account('acc-savings'),
    account('acc-other'),
  ]);
});

describe('deleting an account named by a recurring template', () => {
  it('moves a plain template to the target, as it always has', async () => {
    await db.recurrings.add(rec());
    await deleteAccountWithReassign('acc-payer', 'acc-other');
    expect((await load()).accountId).toBe('acc-other');
  });

  it('follows the receiver to the target when the receiving account goes', async () => {
    await db.recurrings.add(rec({ receiverAccountId: 'acc-savings' }));
    await deleteAccountWithReassign('acc-savings', 'acc-other');

    const r = await load();
    expect(r.accountId).toBe('acc-payer');
    expect(r.receiverAccountId).toBe('acc-other');
  });

  it('follows the payer to the target when the paying account goes', async () => {
    await db.recurrings.add(rec({ receiverAccountId: 'acc-savings' }));
    await deleteAccountWithReassign('acc-payer', 'acc-other');

    const r = await load();
    expect(r.accountId).toBe('acc-other');
    expect(r.receiverAccountId).toBe('acc-savings');
  });

  it('clears the receiver when payer and receiver collapse onto one account', async () => {
    // Reassigning the receiver onto the payer would leave a charge transferring
    // to itself: it moves nothing, and the write refuses it — so the row could
    // never be logged again. It goes back to being an ordinary charge.
    await db.recurrings.add(rec({ receiverAccountId: 'acc-savings' }));
    await deleteAccountWithReassign('acc-savings', 'acc-payer');

    const r = await load();
    expect(r.accountId).toBe('acc-payer');
    expect(r.receiverAccountId).toBeUndefined();
  });

  it('clears the receiver when the payer is the one folded into it', async () => {
    await db.recurrings.add(rec({ receiverAccountId: 'acc-savings' }));
    await deleteAccountWithReassign('acc-payer', 'acc-savings');

    const r = await load();
    expect(r.accountId).toBe('acc-savings');
    expect(r.receiverAccountId).toBeUndefined();
  });

  it('leaves templates that name neither account untouched', async () => {
    await db.recurrings.add(rec({ accountId: 'acc-payer', receiverAccountId: 'acc-savings' }));
    await deleteAccountWithReassign('acc-other', 'acc-payer');

    const r = await load();
    expect(r.accountId).toBe('acc-payer');
    expect(r.receiverAccountId).toBe('acc-savings');
  });
});
