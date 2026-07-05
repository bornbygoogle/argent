// Category write helpers. Default categories are read-only; customs are fully
// editable. Deleting a custom reassigns its expenses to "Autre" (cat-autre).
import { db } from '@/db/db';
import { uid } from '@/lib/id';
import type { Category } from '@/types/models';

export interface CategoryInput {
  name: string;
  icon: string;
  color: string;
}

export async function createCategory(input: CategoryInput): Promise<string> {
  const count = await db.categories.count();
  const c: Category = {
    id: uid(),
    name: input.name.trim() || 'Catégorie',
    icon: input.icon,
    color: input.color,
    isDefault: false,
    sortOrder: count, // append
  };
  await db.categories.add(c);
  return c.id;
}

export interface CategoryPatch {
  name?: string;
  icon?: string;
  color?: string;
}

export async function updateCategory(id: string, patch: CategoryPatch): Promise<void> {
  const next: Partial<Category> = {};
  if (patch.name !== undefined) {
    const clean = patch.name.trim() || 'Catégorie';
    next.name = clean;
    // A default's name normally localizes via i18n; a user rename is stored as
    // `customName` so the label resolver can prefer it over the i18n key.
    const cur = await db.categories.get(id);
    if (cur?.isDefault) next.customName = clean;
  }
  if (patch.icon !== undefined) next.icon = patch.icon;
  if (patch.color !== undefined) next.color = patch.color;
  await db.categories.update(id, next);
}

export async function deleteCategory(id: string): Promise<void> {
  if (id === 'cat-autre') return; // never delete the fallback
  await db.transaction('rw', db.transactions, db.categories, db.budgets, async () => {
    // Reassign expenses, then strip the limit from every budget.
    await db.transactions.where('categoryId').equals(id).modify({ categoryId: 'cat-autre' });
    const budgets = await db.budgets.toArray();
    for (const b of budgets) {
      const limits = b.categoryLimits.filter((c) => c.categoryId !== id);
      if (limits.length !== b.categoryLimits.length) {
        await db.budgets.update(b.id, { categoryLimits: limits });
      }
    }
    await db.categories.delete(id);
  });
}
