// Income-type write helpers. Seeded defaults (Salaire, Autre, …) are editable
// like any other; only "Autre" is non-deletable because it is the reassignment
// fallback when a type is removed. `key` is a free-form unique slug (the
// Transaction/Recurring tables reference it); labels live on the record so
// custom types render correctly even without an i18n entry.
import { db } from '@/db/db';
import { uid } from '@/lib/id';
import type { IncomeType } from '@/types/models';

/** The fallback key expenses/income are reassigned to on deletion. */
export const INCOME_TYPE_FALLBACK_KEY = 'Autre';

export interface IncomeTypeInput {
  label: string;
  icon?: string;
  color?: string;
}

export interface IncomeTypePatch {
  label?: string;
  icon?: string;
  color?: string;
}

/** ASCII slug from a label, with a uniqueness suffix if needed. */
async function uniqueKey(label: string): Promise<string> {
  const base =
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // strip combining accents
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'type';
  const existing = await db.incomeTypes.toArray();
  const taken = new Set(existing.map((it) => it.key));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export async function createIncomeType(input: IncomeTypeInput): Promise<string> {
  const key = await uniqueKey(input.label);
  const order = await db.incomeTypes.count();
  const it: IncomeType = {
    id: uid(),
    key,
    label: input.label.trim() || 'Type',
    order,
    icon: input.icon,
    color: input.color,
  };
  await db.incomeTypes.add(it);
  return it.id;
}

export async function updateIncomeType(id: string, patch: IncomeTypePatch): Promise<void> {
  const next: Partial<IncomeType> = {};
  if (patch.label !== undefined) next.label = patch.label.trim() || 'Type';
  if (patch.icon !== undefined) next.icon = patch.icon;
  if (patch.color !== undefined) next.color = patch.color;
  await db.incomeTypes.update(id, next);
}

export async function deleteIncomeType(id: string): Promise<void> {
  const target = await db.incomeTypes.get(id);
  // Never delete the fallback type ("Autre") — it's the reassignment sink.
  if (!target || target.key === INCOME_TYPE_FALLBACK_KEY) return;

  await db.transaction('rw', db.transactions, db.recurrings, db.incomeTypes, async () => {
    // Reassign every usage to the fallback. `transactions.incomeType` is indexed;
    // `recurrings` is not, so filter in-memory (the set is small).
    await db.transactions
      .where('incomeType')
      .equals(target.key)
      .modify({ incomeType: INCOME_TYPE_FALLBACK_KEY });
    const affected = await db.recurrings.filter((r) => r.incomeType === target.key).toArray();
    if (affected.length > 0) {
      await Promise.all(
        affected.map((r) => db.recurrings.update(r.id, { incomeType: INCOME_TYPE_FALLBACK_KEY })),
      );
    }
    await db.incomeTypes.delete(id);
  });
}
