// Localized label helpers. Default seed entities localize via i18n keys;
// user-created entities fall back to their stored name. Income-type keys are
// free-form strings (defaults keep their i18n keys; customs use stored labels).
import type { TFunction } from 'i18next';
import type { Account, Category, IncomeType, Transaction } from '@/types/models';

const CATEGORY_KEY_PREFIX = 'cat-';

/** True if a translation key exists (i18next returns the key itself when missing). */
function hasKey(t: TFunction, key: string): boolean {
  const v = t(key);
  return typeof v === 'string' && v !== key;
}

/** Localized category name: a user rename (`customName`) wins; otherwise the
 *  `category.<id>` i18n key if present (defaults); otherwise the stored name. */
export function categoryLabel(t: TFunction, cat: Category): string {
  if (cat.customName?.trim()) return cat.customName.trim();
  const key = `category.${cat.id.replace(CATEGORY_KEY_PREFIX, '')}`;
  return hasKey(t, key) ? (t(key) as string) : cat.name;
}

/** Localized income-type name from its record: the `incomeType.<key>` i18n key
 *  if present (seeded defaults), otherwise the stored label. */
export function incomeTypeLabel(t: TFunction, it: IncomeType): string {
  const k = `incomeType.${it.key}`;
  return hasKey(t, k) ? (t(k) as string) : it.label;
}

/** Alias kept for callers that already hold the record. */
export function incomeTypeRecordLabel(t: TFunction, it: IncomeType): string {
  return incomeTypeLabel(t, it);
}

/** Best display label for a transaction row. `incomeTypeByKey` resolves a
 *  transaction's income-type key to its record (needed for custom types, whose
 *  label is stored on the record rather than in i18n). */
export function transactionLabel(
  t: TFunction,
  tx: Transaction,
  categoryById: Map<string, Category>,
  incomeTypeByKey: Map<string, IncomeType> = new Map(),
): string {
  if (tx.merchant?.trim()) return tx.merchant.trim();
  if (tx.categoryId) {
    const cat = categoryById.get(tx.categoryId);
    if (cat) return categoryLabel(t, cat);
  }
  if (tx.incomeType) {
    const it = incomeTypeByKey.get(tx.incomeType);
    return it ? incomeTypeLabel(t, it) : tx.incomeType;
  }
  return t('common.other');
}

/** Label for a transfer leg: arrow + the counter-account name. */
export function transferLabel(
  t: TFunction,
  tx: Transaction,
  counterAccount?: Account,
): string {
  const name = counterAccount?.name ?? t('common.other');
  // 'in' leg = money arrived from counter (←); 'out' leg = money sent to counter (→).
  const arrow = tx.transferRole === 'in' ? '←' : '→';
  return `${arrow} ${name}`;
}
