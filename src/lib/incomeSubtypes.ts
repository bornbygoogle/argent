// Income sub-type write helpers — the income-side mirror of lib/subcategories.
// A sub-type refines exactly one income type and is owned by it: no defaults
// are seeded, and deleting the parent takes its children with it (see
// deleteIncomeType in lib/incomeTypes.ts).
//
// The parent is referenced by `key`, not `id`, because that is what
// Transaction.incomeType already stores and because a key survives relabelling.
import { db } from '@/db/db';
import { uid } from '@/lib/id';
import type { IncomeSubtype } from '@/types/models';

export interface IncomeSubtypeInput {
  incomeTypeKey: string;
  name: string;
}

/** Sub-types of one income type, ordered. */
export async function listIncomeSubtypes(incomeTypeKey: string): Promise<IncomeSubtype[]> {
  const rows = await db.incomeSubtypes.where('incomeTypeKey').equals(incomeTypeKey).toArray();
  return rows.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function createIncomeSubtype(input: IncomeSubtypeInput): Promise<string> {
  const name = input.name.trim();
  // The pair renders as "Type(name)", and "Type()" says nothing.
  if (!name) throw new Error('income-subtype-name-required');

  const s: IncomeSubtype = {
    id: uid(),
    incomeTypeKey: input.incomeTypeKey,
    name,
    sortOrder: await db.incomeSubtypes
      .where('incomeTypeKey')
      .equals(input.incomeTypeKey)
      .count(),
  };
  await db.incomeSubtypes.add(s);
  return s.id;
}

/** Id of the income type's sub-type with this name, creating it if absent.
 *  Matching ignores case and surrounding space so typing the same word twice
 *  never yields two entries; the name first chosen is the one kept. */
export async function ensureIncomeSubtype(
  incomeTypeKey: string,
  name: string,
): Promise<string> {
  const clean = name.trim();
  if (!clean) throw new Error('income-subtype-name-required');

  const existing = (await listIncomeSubtypes(incomeTypeKey)).find(
    (s) => s.name.toLowerCase() === clean.toLowerCase(),
  );
  return existing ? existing.id : createIncomeSubtype({ incomeTypeKey, name: clean });
}

export interface IncomeSubtypePatch {
  name?: string;
}

export async function updateIncomeSubtype(
  id: string,
  patch: IncomeSubtypePatch,
): Promise<void> {
  const next: Partial<IncomeSubtype> = {};
  if (patch.name !== undefined) {
    const clean = patch.name.trim();
    // A blank rename is a no-op rather than a way to erase the label.
    if (clean) next.name = clean;
  }
  if (Object.keys(next).length === 0) return;
  await db.incomeSubtypes.update(id, next);
}

/** Delete a sub-type and detach it from its transactions. The transactions keep
 *  their income type — only the refinement is lost. */
export async function deleteIncomeSubtype(id: string): Promise<void> {
  await db.transaction('rw', db.incomeSubtypes, db.transactions, async () => {
    await db.transactions
      .where('incomeSubtypeId')
      .equals(id)
      .modify((tx) => {
        delete tx.incomeSubtypeId;
      });
    await db.incomeSubtypes.delete(id);
  });
}

/** Delete every sub-type of an income type and detach them from transactions.
 *  Runs inside the caller's transaction (see deleteIncomeType). */
export async function deleteIncomeSubtypesOfType(incomeTypeKey: string): Promise<void> {
  const ids = (
    await db.incomeSubtypes.where('incomeTypeKey').equals(incomeTypeKey).toArray()
  ).map((s) => s.id);
  if (ids.length === 0) return;
  const doomed = new Set(ids);
  await db.transactions
    .where('incomeSubtypeId')
    .anyOf(ids)
    .modify((tx) => {
      if (tx.incomeSubtypeId && doomed.has(tx.incomeSubtypeId)) delete tx.incomeSubtypeId;
    });
  await db.incomeSubtypes.bulkDelete(ids);
}
