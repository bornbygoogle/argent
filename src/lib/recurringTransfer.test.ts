// A recurring charge that names a receiver settles as a real transfer between
// two of the user's own accounts, not as an expense leaving the system.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@/db/db';
import {
  createRecurring,
  updateRecurring,
  confirmRecurring,
  unconfirmRecurring,
} from '@/lib/recurring';
import type { Recurring, RecurringInput } from '@/lib/recurring';
import { dueDateFor } from '@/lib/recurringSchedule';
import { exportBackup, importBackup } from '@/lib/data';
import { currentMonth } from '@/lib/date';
import type { Transaction } from '@/types/models';

const base: RecurringInput = {
  accountId: 'acc-payer',
  direction: 'expense',
  label: 'Épargne',
  amount: 200,
  cadence: 'mensuel',
  icon: 'PiggyBank',
  color: '#000000',
};

const load = async (id: string): Promise<Recurring> => {
  const r = await db.recurrings.get(id);
  if (!r) throw new Error(`recurring ${id} vanished`);
  return r;
};

const linked = async (id: string): Promise<Transaction[]> =>
  db.transactions.where('recurringSourceId').equals(id).toArray();

/** Only Date is faked — faking the timer queue deadlocks Dexie. */
const freeze = (y: number, monthIndex: number, day: number, hour = 12) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(y, monthIndex, day, hour, 0, 0));
};

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the receiver on a template', () => {
  it('is absent by default — every existing charge simply debits its account', async () => {
    const id = await createRecurring(base);
    expect((await load(id)).receiverAccountId).toBeUndefined();
  });

  it('is stored when given', async () => {
    const id = await createRecurring({ ...base, receiverAccountId: 'acc-savings' });
    expect((await load(id)).receiverAccountId).toBe('acc-savings');
  });

  it('is dropped when it names the paying account — a transfer to itself moves nothing', async () => {
    const id = await createRecurring({ ...base, receiverAccountId: base.accountId });
    expect((await load(id)).receiverAccountId).toBeUndefined();
  });

  it('is dropped on an income template — money arriving cannot also be sent on', async () => {
    const id = await createRecurring({
      ...base,
      direction: 'income',
      receiverAccountId: 'acc-savings',
    });
    expect((await load(id)).receiverAccountId).toBeUndefined();
  });

  it('can be added to an existing template, and cleared again with null', async () => {
    const id = await createRecurring(base);
    await updateRecurring(id, { receiverAccountId: 'acc-savings' });
    expect((await load(id)).receiverAccountId).toBe('acc-savings');

    await updateRecurring(id, { receiverAccountId: null });
    expect((await load(id)).receiverAccountId).toBeUndefined();
  });

  it('is left untouched by an edit that does not mention it', async () => {
    const id = await createRecurring({ ...base, receiverAccountId: 'acc-savings' });
    await updateRecurring(id, { amount: 250 });
    const r = await load(id);
    expect(r.amount).toBe(250);
    expect(r.receiverAccountId).toBe('acc-savings');
  });
});

describe('settling a charge that has no receiver', () => {
  it('still writes exactly one expense on its own account, as it always has', async () => {
    freeze(2026, 7, 10);
    const id = await createRecurring(base);
    await confirmRecurring(await load(id));

    const rows = await linked(id);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('expense');
    expect(rows[0].accountId).toBe('acc-payer');
    expect(rows[0].transferGroupId).toBeUndefined();
  });
});

describe('settling a charge that names a receiver', () => {
  it('writes both legs of one transfer, out of the payer and into the receiver', async () => {
    freeze(2026, 7, 10);
    const id = await createRecurring({ ...base, receiverAccountId: 'acc-savings', dueDay: 5 });
    await confirmRecurring(await load(id));

    const all = await db.transactions.toArray();
    expect(all).toHaveLength(2);
    expect(all.every((t) => t.kind === 'transfer')).toBe(true);

    const out = all.find((t) => t.transferRole === 'out');
    const inn = all.find((t) => t.transferRole === 'in');
    if (!out || !inn) throw new Error('both legs must exist');

    expect(out.accountId).toBe('acc-payer');
    expect(out.counterAccountId).toBe('acc-savings');
    expect(inn.accountId).toBe('acc-savings');
    expect(inn.counterAccountId).toBe('acc-payer');
    expect(out.transferGroupId).toBe(inn.transferGroupId);
    expect(out.amount).toBe(200);
    expect(inn.amount).toBe(200);
  });

  it('dates both legs on the instalment they settle, and notes them with the label', async () => {
    freeze(2026, 7, 20);
    const id = await createRecurring({ ...base, receiverAccountId: 'acc-savings', dueDay: 5 });
    const r = await load(id);
    await confirmRecurring(r);

    const occurrence = dueDateFor(r, currentMonth());
    const all = await db.transactions.toArray();
    expect(all.map((t) => t.date)).toEqual([occurrence, occurrence]);
    expect(all.every((t) => t.note === 'Épargne')).toBe(true);
  });

  it('tags only the outgoing leg as the instalment, so one settlement counts once', async () => {
    // The month ceiling and the startup repair pass both count transactions
    // carrying recurringSourceId. Tagging both legs would read as a double
    // charge and get one of them deleted from under the user.
    freeze(2026, 7, 10);
    const id = await createRecurring({ ...base, receiverAccountId: 'acc-savings' });
    await confirmRecurring(await load(id));

    const tagged = await linked(id);
    expect(tagged).toHaveLength(1);
    expect(tagged[0].transferRole).toBe('out');
  });

  it('records the instalment in history, so the month reads as settled', async () => {
    freeze(2026, 7, 10);
    const id = await createRecurring({ ...base, receiverAccountId: 'acc-savings' });
    await confirmRecurring(await load(id));

    const r = await load(id);
    expect(r.history).toHaveLength(1);
    expect(r.history[0].transactionId).toBeDefined();
    expect(r.history[0].month).toBe(currentMonth());
  });

  it('is idempotent — a second press writes no second pair', async () => {
    freeze(2026, 7, 10);
    const id = await createRecurring({ ...base, receiverAccountId: 'acc-savings' });
    await confirmRecurring(await load(id));
    await confirmRecurring(await load(id));

    expect(await db.transactions.count()).toBe(2);
  });
});

describe('undoing a settled transfer', () => {
  it('takes back both legs — the receiver must not keep money never sent', async () => {
    freeze(2026, 7, 10);
    const id = await createRecurring({ ...base, receiverAccountId: 'acc-savings' });
    await confirmRecurring(await load(id));
    expect(await db.transactions.count()).toBe(2);

    const r = await load(id);
    await unconfirmRecurring(r, dueDateFor(r, currentMonth()));

    expect(await db.transactions.count()).toBe(0);
    expect((await load(id)).history).toHaveLength(0);
  });

  it('still takes back the single expense of a charge with no receiver', async () => {
    freeze(2026, 7, 10);
    const id = await createRecurring(base);
    await confirmRecurring(await load(id));

    const r = await load(id);
    await unconfirmRecurring(r, dueDateFor(r, currentMonth()));

    expect(await db.transactions.count()).toBe(0);
    expect((await load(id)).history).toHaveLength(0);
  });
});

describe('a receiver through a backup', () => {
  it('comes back naming the same account, and an ordinary charge comes back plain', async () => {
    // Backups are how this data reaches the next phone. A field the export
    // carried but the import dropped would silently turn every transfer back
    // into a plain expense, and only the balances would ever say so.
    const withReceiver = await createRecurring({ ...base, receiverAccountId: 'acc-savings' });
    const plain = await createRecurring({ ...base, label: 'Loyer' });

    const payload = await exportBackup();
    await Promise.all(db.tables.map((t) => t.clear()));
    await importBackup(payload);

    expect((await load(withReceiver)).receiverAccountId).toBe('acc-savings');
    expect((await load(plain)).receiverAccountId).toBeUndefined();
  });
});
