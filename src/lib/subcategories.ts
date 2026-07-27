// Sub-category write helpers. A sub-category refines exactly one category and
// is owned by it: no defaults are seeded, and deleting the parent takes its
// children with it (see deleteCategory in lib/categories.ts).
import { db } from '@/db/db';
import { uid } from '@/lib/id';
import type { Subcategory } from '@/types/models';

export interface SubcategoryInput {
  categoryId: string;
  name: string;
}

/** Sub-categories of one category, ordered. */
export async function listSubcategories(categoryId: string): Promise<Subcategory[]> {
  const rows = await db.subcategories.where('categoryId').equals(categoryId).toArray();
  return rows.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function createSubcategory(input: SubcategoryInput): Promise<string> {
  const name = input.name.trim();
  // Unlike a category there is no sensible default name to fall back on: the
  // pair renders as "Category(name)", and "Category()" says nothing.
  if (!name) throw new Error('subcategory-name-required');

  const s: Subcategory = {
    id: uid(),
    categoryId: input.categoryId,
    name,
    sortOrder: await db.subcategories.where('categoryId').equals(input.categoryId).count(),
  };
  await db.subcategories.add(s);
  return s.id;
}

/** Id of the category's sub-category with this name, creating it if absent.
 *  Matching ignores case and surrounding space so typing "lunch" twice never
 *  yields two entries; the name the user first chose is the one kept. */
export async function ensureSubcategory(categoryId: string, name: string): Promise<string> {
  const clean = name.trim();
  if (!clean) throw new Error('subcategory-name-required');

  const existing = (await listSubcategories(categoryId)).find(
    (s) => s.name.toLowerCase() === clean.toLowerCase(),
  );
  return existing ? existing.id : createSubcategory({ categoryId, name: clean });
}

export interface SubcategoryPatch {
  name?: string;
}

export async function updateSubcategory(id: string, patch: SubcategoryPatch): Promise<void> {
  const next: Partial<Subcategory> = {};
  if (patch.name !== undefined) {
    const clean = patch.name.trim();
    // A blank rename is a no-op rather than a way to erase the label.
    if (clean) next.name = clean;
  }
  if (Object.keys(next).length === 0) return;
  await db.subcategories.update(id, next);
}

/** Delete a sub-category and detach it from its transactions. The transactions
 *  keep their category — only the refinement is lost. */
export async function deleteSubcategory(id: string): Promise<void> {
  await db.transaction('rw', db.subcategories, db.transactions, async () => {
    await db.transactions
      .where('subcategoryId')
      .equals(id)
      .modify((tx) => {
        delete tx.subcategoryId;
      });
    await db.subcategories.delete(id);
  });
}

/** Delete every sub-category of a category and detach them from transactions.
 *  Runs inside the caller's transaction (see deleteCategory). */
export async function deleteSubcategoriesOfCategory(categoryId: string): Promise<void> {
  const ids = (await db.subcategories.where('categoryId').equals(categoryId).toArray()).map(
    (s) => s.id,
  );
  if (ids.length === 0) return;
  const doomed = new Set(ids);
  await db.transactions
    .where('subcategoryId')
    .anyOf(ids)
    .modify((tx) => {
      if (tx.subcategoryId && doomed.has(tx.subcategoryId)) delete tx.subcategoryId;
    });
  await db.subcategories.bulkDelete(ids);
}
