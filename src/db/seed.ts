import { db, DEFAULT_SETTINGS, type SettingsRecord } from '@/db/db';
import type { AccountType, IncomeTypeKey } from '@/types/models';

interface SeedCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
}

// Default expense categories (global). Colors/icons aligned to the validated
// mocks (05/06/07/08). "Autre" is non-deletable (reassign target).
export const DEFAULT_CATEGORIES: SeedCategory[] = [
  { id: 'cat-courses', name: 'Courses', icon: 'ShoppingCart', color: '#10B981' },
  { id: 'cat-restaurant', name: 'Restaurant', icon: 'Utensils', color: '#F59E0B' },
  { id: 'cat-transport', name: 'Transport', icon: 'Car', color: '#0EA5E9' },
  { id: 'cat-logement', name: 'Logement', icon: 'Home', color: '#14B8A6' },
  { id: 'cat-loisirs', name: 'Loisirs', icon: 'BookOpen', color: '#8B5CF6' },
  { id: 'cat-sante', name: 'Santé', icon: 'Heart', color: '#EC4899' },
  { id: 'cat-factures', name: 'Factures', icon: 'Receipt', color: '#EF4444' },
  { id: 'cat-autre', name: 'Autre', icon: 'CircleDashed', color: '#64748B' },
];

export const INCOME_TYPE_KEYS: IncomeTypeKey[] = [
  'Salaire',
  'Remboursement',
  'Cadeau',
  'Freelance',
  'Vente',
  'Autre',
];

/** Default color + icon per account type (derived, not user-editable at creation). */
export const ACCOUNT_TYPE_DEFAULTS: Record<
  AccountType,
  { color: string; icon: string }
> = {
  courant: { color: '#4F46E5', icon: 'Wallet' },
  épargne: { color: '#10B981', icon: 'PiggyBank' },
  espèces: { color: '#F59E0B', icon: 'Banknote' },
  autre: { color: '#64748B', icon: 'CircleDashed' },
};

/** Seed default categories, income types, and a settings row if missing.
 *  Each check+write runs in a transaction so concurrent callers (e.g. React
 *  StrictMode double-mount) serialize and never collide on existing keys. */
export async function seedDefaults(): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    if ((await db.categories.count()) === 0) {
      await db.categories.bulkAdd(
        DEFAULT_CATEGORIES.map((c, i) => ({
          id: c.id,
          name: c.name,
          icon: c.icon,
          color: c.color,
          isDefault: true,
          sortOrder: i,
        })),
      );
    }
  });

  await db.transaction('rw', db.incomeTypes, async () => {
    if ((await db.incomeTypes.count()) === 0) {
      await db.incomeTypes.bulkAdd(
        INCOME_TYPE_KEYS.map((key, i) => ({
          id: `it-${key.toLowerCase()}`,
          key,
          label: key,
          order: i,
        })),
      );
    }
  });

  await db.transaction('rw', db.settings, async () => {
    if (!(await db.settings.get('app'))) {
      const rec: SettingsRecord = { key: 'app', state: { ...DEFAULT_SETTINGS } };
      await db.settings.put(rec);
    }
  });
}
