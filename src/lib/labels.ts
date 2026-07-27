// Localized label helpers. Default seed entities localize via i18n keys;
// user-created entities fall back to their stored name. Income-type keys are
// free-form strings (defaults keep their i18n keys; customs use stored labels).
import type { TFunction } from 'i18next';
import type {
  Account,
  Category,
  IncomeSubtype,
  IncomeType,
  Subcategory,
  Transaction,
} from '@/types/models';

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

/** Sub-category name. Always user-created, so there is no i18n key to try. */
export function subcategoryLabel(sub: Subcategory): string {
  return sub.name.trim();
}

/** The single place the `parent(child)` display format is defined. Falls back
 *  to the bare parent when the child is missing or blank — empty parens would
 *  read as a rendering bug. */
function joinSub(parent: string, child: string | undefined): string {
  return child ? `${parent}(${child})` : parent;
}

/** The display pair `category(sub-category)`. */
export function categoryWithSubLabel(
  t: TFunction,
  cat: Category,
  sub?: Subcategory,
): string {
  return joinSub(categoryLabel(t, cat), sub && subcategoryLabel(sub));
}

/** Localized income-type name from its record: the `incomeType.<key>` i18n key
 *  if present (seeded defaults), otherwise the stored label. */
export function incomeTypeLabel(t: TFunction, it: IncomeType): string {
  const k = `incomeType.${it.key}`;
  return hasKey(t, k) ? (t(k) as string) : it.label;
}

/** Income sub-type name. Always user-created, so there is no i18n key to try. */
export function incomeSubtypeLabel(sub: IncomeSubtype): string {
  return sub.name.trim();
}

/** The display pair `incomeType(sub-type)`, mirroring [categoryWithSubLabel]. */
export function incomeTypeWithSubLabel(
  t: TFunction,
  it: IncomeType,
  sub?: IncomeSubtype,
): string {
  return joinSub(incomeTypeLabel(t, it), sub && incomeSubtypeLabel(sub));
}

/** Alias kept for callers that already hold the record. */
export function incomeTypeRecordLabel(t: TFunction, it: IncomeType): string {
  return incomeTypeLabel(t, it);
}

/** Lookup tables a transaction label may need. Passed by name rather than
 *  position: a row needs two axes (category and income type), each with its own
 *  sub-level, and four positional maps invite silent argument swaps. */
export interface TransactionLabelMaps {
  categoryById?: Map<string, Category>;
  /** Resolves a transaction's income-type key to its record — needed for custom
   *  types, whose label lives on the record rather than in i18n. */
  incomeTypeByKey?: Map<string, IncomeType>;
  subcategoryById?: Map<string, Subcategory>;
  incomeSubtypeById?: Map<string, IncomeSubtype>;
}

/** Best display label for a transaction row: an explicit merchant if there is
 *  one, otherwise `category(sub-category)` or `incomeType(sub-type)`. */
export function transactionLabel(
  t: TFunction,
  tx: Transaction,
  maps: TransactionLabelMaps = {},
): string {
  if (tx.merchant?.trim()) return tx.merchant.trim();

  if (tx.categoryId) {
    const cat = maps.categoryById?.get(tx.categoryId);
    if (cat) {
      const sub = tx.subcategoryId ? maps.subcategoryById?.get(tx.subcategoryId) : undefined;
      // A sub that no longer belongs to this parent is stale data, not a label:
      // show the parent alone rather than an impossible pair.
      return categoryWithSubLabel(t, cat, sub?.categoryId === cat.id ? sub : undefined);
    }
  }

  if (tx.incomeType) {
    const sub = tx.incomeSubtypeId ? maps.incomeSubtypeById?.get(tx.incomeSubtypeId) : undefined;
    const own = sub?.incomeTypeKey === tx.incomeType ? sub : undefined;
    const it = maps.incomeTypeByKey?.get(tx.incomeType);
    // An unknown key still renders (the raw key is better than "Other"), and
    // still takes its sub-type — the pair is keyed on the transaction, not on
    // the type record existing.
    return it
      ? incomeTypeWithSubLabel(t, it, own)
      : joinSub(tx.incomeType, own && incomeSubtypeLabel(own));
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
