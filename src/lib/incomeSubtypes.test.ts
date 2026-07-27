// happy-dom ships no IndexedDB, so Dexie needs a shim. This import must come
// before '@/db/db' — that module constructs the Dexie instance at load time.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/db';
import {
  createIncomeSubtype,
  updateIncomeSubtype,
  deleteIncomeSubtype,
  listIncomeSubtypes,
  ensureIncomeSubtype,
} from '@/lib/incomeSubtypes';
import { deleteIncomeType } from '@/lib/incomeTypes';
import { addTransaction, updateTransaction } from '@/lib/transactions';
import type { IncomeType } from '@/types/models';

const itype = (id: string, key: string, order: number): IncomeType => ({
  id,
  key,
  label: key,
  order,
});

beforeEach(async () => {
  await db.transaction(
    'rw',
    [db.incomeTypes, db.incomeSubtypes, db.transactions, db.recurrings],
    async () => {
      await db.incomeTypes.clear();
      await db.incomeSubtypes.clear();
      await db.transactions.clear();
      await db.recurrings.clear();
      await db.incomeTypes.bulkAdd([
        itype('it-salaire', 'Salaire', 0),
        itype('it-cadeau', 'Cadeau', 1),
        itype('it-autre', 'Autre', 2),
      ]);
    },
  );
});

describe('createIncomeSubtype', () => {
  it('stores the sub-type against its parent income type key', async () => {
    const id = await createIncomeSubtype({ incomeTypeKey: 'Salaire', name: 'Bonus' });
    expect(await db.incomeSubtypes.get(id)).toMatchObject({
      incomeTypeKey: 'Salaire',
      name: 'Bonus',
      sortOrder: 0,
    });
  });

  it('appends, numbering sortOrder within each income type independently', async () => {
    await createIncomeSubtype({ incomeTypeKey: 'Salaire', name: 'Bonus' });
    await createIncomeSubtype({ incomeTypeKey: 'Salaire', name: '13e mois' });
    const first = await createIncomeSubtype({ incomeTypeKey: 'Cadeau', name: 'Anniversaire' });

    expect((await listIncomeSubtypes('Salaire')).map((s) => [s.name, s.sortOrder])).toEqual([
      ['Bonus', 0],
      ['13e mois', 1],
    ]);
    expect((await db.incomeSubtypes.get(first))?.sortOrder).toBe(0);
  });

  it('trims the name', async () => {
    const id = await createIncomeSubtype({ incomeTypeKey: 'Salaire', name: '  Prime  ' });
    expect((await db.incomeSubtypes.get(id))?.name).toBe('Prime');
  });

  it('refuses a blank name — "Salaire()" is not a label', async () => {
    await expect(
      createIncomeSubtype({ incomeTypeKey: 'Salaire', name: '  ' }),
    ).rejects.toThrow();
    expect(await db.incomeSubtypes.count()).toBe(0);
  });
});

describe('listIncomeSubtypes', () => {
  it('returns only the given income type, ordered', async () => {
    await createIncomeSubtype({ incomeTypeKey: 'Cadeau', name: 'Noël' });
    await createIncomeSubtype({ incomeTypeKey: 'Salaire', name: 'Bonus' });
    await createIncomeSubtype({ incomeTypeKey: 'Cadeau', name: 'Anniversaire' });

    expect((await listIncomeSubtypes('Cadeau')).map((s) => s.name)).toEqual([
      'Noël',
      'Anniversaire',
    ]);
  });

  it('returns an empty list for a type with none', async () => {
    expect(await listIncomeSubtypes('Autre')).toEqual([]);
  });
});

describe('ensureIncomeSubtype', () => {
  it('creates when the income type has no match', async () => {
    const id = await ensureIncomeSubtype('Salaire', 'Bonus');
    expect((await db.incomeSubtypes.get(id))?.name).toBe('Bonus');
    expect(await db.incomeSubtypes.count()).toBe(1);
  });

  it('reuses an existing name regardless of case and space', async () => {
    const first = await createIncomeSubtype({ incomeTypeKey: 'Salaire', name: 'Bonus' });
    expect(await ensureIncomeSubtype('Salaire', '  bONUs ')).toBe(first);
    expect(await db.incomeSubtypes.count()).toBe(1);
    // The name the user first chose is the one kept.
    expect((await db.incomeSubtypes.get(first))?.name).toBe('Bonus');
  });

  it('only matches within the same income type', async () => {
    const salaire = await createIncomeSubtype({ incomeTypeKey: 'Salaire', name: 'Bonus' });
    const cadeau = await ensureIncomeSubtype('Cadeau', 'Bonus');
    expect(cadeau).not.toBe(salaire);
    expect((await db.incomeSubtypes.get(cadeau))?.incomeTypeKey).toBe('Cadeau');
  });

  it('refuses a blank name', async () => {
    await expect(ensureIncomeSubtype('Salaire', ' ')).rejects.toThrow();
    expect(await db.incomeSubtypes.count()).toBe(0);
  });
});

describe('updateIncomeSubtype', () => {
  it('renames, trimming the input', async () => {
    const id = await createIncomeSubtype({ incomeTypeKey: 'Salaire', name: 'Bonus' });
    await updateIncomeSubtype(id, { name: '  Prime ' });
    expect((await db.incomeSubtypes.get(id))?.name).toBe('Prime');
  });

  it('leaves the name alone when handed a blank one', async () => {
    const id = await createIncomeSubtype({ incomeTypeKey: 'Salaire', name: 'Bonus' });
    await updateIncomeSubtype(id, { name: '   ' });
    expect((await db.incomeSubtypes.get(id))?.name).toBe('Bonus');
  });
});

describe('deleteIncomeSubtype', () => {
  it('removes the row and detaches it, keeping the income type', async () => {
    const subId = await createIncomeSubtype({ incomeTypeKey: 'Salaire', name: 'Bonus' });
    const txId = await addTransaction('income', {
      amount: 2000,
      accountId: 'acc-1',
      incomeType: 'Salaire',
      incomeSubtypeId: subId,
    });

    await deleteIncomeSubtype(subId);

    expect(await db.incomeSubtypes.get(subId)).toBeUndefined();
    const tx = await db.transactions.get(txId);
    expect(tx?.incomeType).toBe('Salaire');
    expect(tx?.incomeSubtypeId).toBeUndefined();
  });

  it('leaves sibling sub-types untouched', async () => {
    const doomed = await createIncomeSubtype({ incomeTypeKey: 'Salaire', name: 'Bonus' });
    const kept = await createIncomeSubtype({ incomeTypeKey: 'Salaire', name: 'Prime' });
    const txId = await addTransaction('income', {
      amount: 500,
      accountId: 'acc-1',
      incomeType: 'Salaire',
      incomeSubtypeId: kept,
    });

    await deleteIncomeSubtype(doomed);

    expect((await db.transactions.get(txId))?.incomeSubtypeId).toBe(kept);
  });
});

describe('deleteIncomeType cascade', () => {
  it('deletes its sub-types and clears them off reassigned income', async () => {
    const subId = await createIncomeSubtype({ incomeTypeKey: 'Salaire', name: 'Bonus' });
    const txId = await addTransaction('income', {
      amount: 1000,
      accountId: 'acc-1',
      incomeType: 'Salaire',
      incomeSubtypeId: subId,
    });

    await deleteIncomeType('it-salaire');

    expect(await listIncomeSubtypes('Salaire')).toEqual([]);
    const tx = await db.transactions.get(txId);
    // The income survives under the fallback type, but its sub-type belonged to
    // the deleted parent and cannot follow it there.
    expect(tx?.incomeType).toBe('Autre');
    expect(tx?.incomeSubtypeId).toBeUndefined();
  });

  it('leaves another income type sub-types alone', async () => {
    await createIncomeSubtype({ incomeTypeKey: 'Salaire', name: 'Bonus' });
    await createIncomeSubtype({ incomeTypeKey: 'Cadeau', name: 'Noël' });

    await deleteIncomeType('it-salaire');

    expect((await listIncomeSubtypes('Cadeau')).map((s) => s.name)).toEqual(['Noël']);
  });

  it('refuses to delete the fallback type, so its sub-types survive', async () => {
    await createIncomeSubtype({ incomeTypeKey: 'Autre', name: 'Divers' });
    await deleteIncomeType('it-autre');
    expect((await listIncomeSubtypes('Autre')).map((s) => s.name)).toEqual(['Divers']);
  });
});

describe('income transaction writes', () => {
  it('stores the sub-type on new income', async () => {
    const subId = await createIncomeSubtype({ incomeTypeKey: 'Salaire', name: 'Bonus' });
    const txId = await addTransaction('income', {
      amount: 100,
      accountId: 'acc-1',
      incomeType: 'Salaire',
      incomeSubtypeId: subId,
    });
    expect((await db.transactions.get(txId))?.incomeSubtypeId).toBe(subId);
  });

  it('never stores an income sub-type on an expense', async () => {
    const subId = await createIncomeSubtype({ incomeTypeKey: 'Salaire', name: 'Bonus' });
    const txId = await addTransaction('expense', {
      amount: 10,
      accountId: 'acc-1',
      categoryId: 'cat-autre',
      incomeSubtypeId: subId,
    });
    expect((await db.transactions.get(txId))?.incomeSubtypeId).toBeUndefined();
  });

  it('drops a stale sub-type when the income type changes', async () => {
    const subId = await createIncomeSubtype({ incomeTypeKey: 'Salaire', name: 'Bonus' });
    const txId = await addTransaction('income', {
      amount: 100,
      accountId: 'acc-1',
      incomeType: 'Salaire',
      incomeSubtypeId: subId,
    });

    await updateTransaction(txId, { incomeType: 'Cadeau' });

    expect((await db.transactions.get(txId))?.incomeSubtypeId).toBeUndefined();
  });

  it('keeps a sub-type supplied alongside its own income type', async () => {
    const bonus = await createIncomeSubtype({ incomeTypeKey: 'Salaire', name: 'Bonus' });
    const noel = await createIncomeSubtype({ incomeTypeKey: 'Cadeau', name: 'Noël' });
    const txId = await addTransaction('income', {
      amount: 100,
      accountId: 'acc-1',
      incomeType: 'Salaire',
      incomeSubtypeId: bonus,
    });

    await updateTransaction(txId, { incomeType: 'Cadeau', incomeSubtypeId: noel });

    const tx = await db.transactions.get(txId);
    expect(tx?.incomeType).toBe('Cadeau');
    expect(tx?.incomeSubtypeId).toBe(noel);
  });

  it('clears the sub-type when explicitly emptied', async () => {
    const subId = await createIncomeSubtype({ incomeTypeKey: 'Salaire', name: 'Bonus' });
    const txId = await addTransaction('income', {
      amount: 100,
      accountId: 'acc-1',
      incomeType: 'Salaire',
      incomeSubtypeId: subId,
    });

    await updateTransaction(txId, { incomeSubtypeId: '' });

    expect((await db.transactions.get(txId))?.incomeSubtypeId).toBeUndefined();
  });
});
