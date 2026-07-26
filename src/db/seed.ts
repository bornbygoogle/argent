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
  { id: 'cat-courses', name: 'Courses', icon: 'ShoppingCart', color: '#3F8F6B' },
  { id: 'cat-restaurant', name: 'Restaurant', icon: 'Utensils', color: '#C97E2C' },
  { id: 'cat-transport', name: 'Transport', icon: 'Car', color: '#3C7A8C' },
  { id: 'cat-logement', name: 'Logement', icon: 'Home', color: '#6B7F5C' },
  { id: 'cat-loisirs', name: 'Loisirs', icon: 'BookOpen', color: '#7A6A9B' },
  { id: 'cat-sante', name: 'Santé', icon: 'Heart', color: '#B0627A' },
  { id: 'cat-factures', name: 'Factures', icon: 'Receipt', color: '#B35341' },
  { id: 'cat-autre', name: 'Autre', icon: 'CircleDashed', color: '#8A8378' },
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
  courant: { color: '#2B2823', icon: 'Wallet' },
  épargne: { color: '#3F8F6B', icon: 'PiggyBank' },
  espèces: { color: '#C97E2C', icon: 'Banknote' },
  autre: { color: '#8A8378', icon: 'CircleDashed' },
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
