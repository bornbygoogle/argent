// Every case here is a thing a user actually does. If the fingerprint does not
// move, the auto-backup never fires and that edit is silently absent from the
// next restore — which is how backup features lose data quietly.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/db';
import { computeSyncFingerprint, SYNCED_TABLES } from '@/lib/syncFingerprint';
import { exportBackup, importBackup } from '@/lib/data';
import type { Account, Transaction, Category, Budget } from '@/types/models';

const account = (id: string, name = 'Courant'): Account => ({
  id, name, type: 'courant', color: '#3F8F6B', icon: 'Wallet',
  openingBalance: 0, order: 0, archived: false, createdAt: '2026-01-01T00:00:00.000Z',
});

const tx = (id: string, date: string, amount = 10): Transaction => ({
  id, kind: 'expense', accountId: 'a1', amount, date,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
});

const category = (id: string, name: string): Category => ({
  id, name, icon: 'ShoppingCart', color: '#3F8F6B', isDefault: false, sortOrder: 0,
});

const budget = (id: string): Budget => ({
  id, accountId: 'a1', monthlyBudget: 100, categoryLimits: [],
  warningThreshold: { mode: 'percent', value: 80 }, rolloverEnabled: false,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.accounts.put(account('a1'));
  await db.transactions.bulkPut([tx('t1', '2026-03-01'), tx('t2', '2026-03-05')]);
});

/** Assert that `mutate` moves the fingerprint. */
async function expectDetected(mutate: () => Promise<unknown>) {
  const before = await computeSyncFingerprint();
  await mutate();
  expect(await computeSyncFingerprint()).not.toBe(before);
}

describe('computeSyncFingerprint', () => {
  describe('detects row-level changes', () => {
    it('adding a transaction', () =>
      expectDetected(() => db.transactions.put(tx('t3', '2026-04-01'))));

    it('deleting a transaction', () => expectDetected(() => db.transactions.delete('t1')));

    it('deleting one transaction and adding another the same day', () =>
      expectDetected(async () => {
        await db.transactions.delete('t1');
        await db.transactions.put(tx('t9', '2026-03-01'));
      }));
  });

  // The whole class the old row-count heartbeat missed.
  describe('detects in-place edits', () => {
    it('a corrected amount', () =>
      expectDetected(() => db.transactions.update('t1', { amount: 999 })));

    it('a re-categorised transaction', () =>
      expectDetected(() => db.transactions.update('t1', { categoryId: 'cat-x' })));

    it('an added note', () => expectDetected(() => db.transactions.update('t2', { note: 'hi' })));

    it('a moved date', () =>
      expectDetected(() => db.transactions.update('t1', { date: '2026-03-02' })));

    it('a renamed account', () =>
      expectDetected(() => db.accounts.update('a1', { name: 'Renamed' })));

    it('a changed opening balance', () =>
      expectDetected(() => db.accounts.update('a1', { openingBalance: 500 })));

    it('an archived account', () =>
      expectDetected(() => db.accounts.update('a1', { archived: true })));

    it('an edited budget', async () => {
      await db.budgets.put(budget('b1'));
      await expectDetected(() => db.budgets.update('b1', { monthlyBudget: 250 }));
    });
  });

  // These tables are in the backup payload, so a change to them must trigger
  // one — the old heartbeat did not look at them at all.
  describe('detects changes in every backed-up table', () => {
    it('a new category', () => expectDetected(() => db.categories.put(category('c1', 'Courses'))));

    it('a renamed category', async () => {
      await db.categories.put(category('c1', 'Courses'));
      await expectDetected(() => db.categories.update('c1', { name: 'Groceries' }));
    });

    it('a new subcategory', () =>
      expectDetected(() =>
        db.subcategories.put({ id: 's1', categoryId: 'c1', name: 'Midi', sortOrder: 0 })));

    it('a new income type', () =>
      expectDetected(() =>
        db.incomeTypes.put({ id: 'i1', key: 'salaire', label: 'Salaire', order: 0 })));

    it('a new income subtype', () =>
      expectDetected(() =>
        db.incomeSubtypes.put({ id: 'is1', incomeTypeKey: 'salaire', name: 'Prime', sortOrder: 0 })));

    it('a closed month', () =>
      expectDetected(() =>
        db.monthClosures.put({ accountId: 'a1', month: '2026-03', closedAt: '2026-04-01', rolloverAmount: 0 })));

    it('a new recurring', () =>
      expectDetected(() =>
        db.recurrings.put({ id: 'r1', accountId: 'a1', direction: 'expense', label: 'Loyer',
          amount: 700, cadence: 'mensuel', icon: 'Home', color: '#000',
          createdAt: '2026-01-01T00:00:00.000Z', history: [] })));

    it('covers exactly the tables a backup carries', async () => {
      const payload = await exportBackup('device-1');
      expect([...SYNCED_TABLES].sort()).toEqual(Object.keys(payload.tables).sort());
    });
  });

  describe('stays put when nothing changed', () => {
    it('is stable across repeated reads', async () => {
      const a = await computeSyncFingerprint();
      expect(await computeSyncFingerprint()).toBe(a);
    });

    it('does not move when a write rewrites identical content', async () => {
      const before = await computeSyncFingerprint();
      await db.accounts.put(account('a1'));
      expect(await computeSyncFingerprint()).toBe(before);
    });

    // This is what stops the pull -> push -> pull churn: after restoring a
    // backup, the local state equals the remote one, so no re-upload is due.
    it('returns to the same value after exporting and restoring', async () => {
      const before = await computeSyncFingerprint();
      const payload = await exportBackup('device-1');
      await db.transactions.put(tx('t5', '2026-05-01'));
      expect(await computeSyncFingerprint()).not.toBe(before);

      await importBackup(payload);
      expect(await computeSyncFingerprint()).toBe(before);
    });
  });
});
