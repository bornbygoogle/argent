// ---- Core domain types (mirror Dexie schema in db/db.ts) ----

export type AccountType = 'courant' | 'épargne' | 'espèces' | 'autre';

export type TransactionKind = 'expense' | 'income' | 'transfer';

/** Derived display direction. */
export type Direction = 'in' | 'out' | 'trf';

export type IncomeTypeKey =
  | 'Salaire'
  | 'Remboursement'
  | 'Cadeau'
  | 'Freelance'
  | 'Vente'
  | 'Autre';

export type RecurringDirection = 'expense' | 'income';
export type Cadence = 'mensuel' | 'hebdo' | 'annuel';
export type WarningMode = 'percent' | 'amount';

/** 'all' = aggregate across accounts; otherwise an account id. */
export type AccountScope = 'all' | string;

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  color: string; // hex
  icon: string; // lucide icon name
  openingBalance: number; // may be negative
  order: number;
  archived: boolean;
  createdAt: string; // ISO
}

export interface Transaction {
  id: string;
  kind: TransactionKind;
  accountId: string;
  /** For transfers: the other leg's account. */
  counterAccountId?: string;
  /** For transfers: links the two legs of one transfer. */
  transferGroupId?: string;
  /** For transfers: this leg's effect on its own account ('out' = leaves, 'in' = arrives). */
  transferRole?: 'out' | 'in';
  amount: number; // positive magnitude; sign derived from kind+role
  categoryId?: string;
  /** Optional refinement of `categoryId`. Always belongs to that category —
   *  changing or clearing the category clears this too. */
  subcategoryId?: string;
  incomeType?: string;
  /** Optional refinement of `incomeType`. Always belongs to that type —
   *  changing or clearing the income type clears this too. */
  incomeSubtypeId?: string;
  merchant?: string;
  note?: string;
  date: string; // 'YYYY-MM-DD'
  recurringSourceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringHistoryEntry {
  month: string; // 'YYYY-MM' — kept so older backups keep restoring
  amount: number;
  transactionId?: string;
  /** The due date this payment covers, 'YYYY-MM-DD'. Absent on entries written
   *  before occurrences were tracked; those read as their month's due date. */
  occurrence?: string;
}

export interface Recurring {
  id: string;
  accountId: string;
  direction: RecurringDirection;
  label: string;
  amount: number; // editable forward-only
  cadence: Cadence;
  cadenceMeta?: string;
  /** Day of the month this falls due, 1–31. Absent = due from the 1st. */
  dueDay?: number;
  icon: string;
  color: string;
  categoryId?: string;
  incomeType?: string;
  createdAt: string;
  history: RecurringHistoryEntry[];
}

export interface CategoryLimit {
  categoryId: string;
  limit: number | null; // null = unlimited
}

export interface WarningThreshold {
  mode: WarningMode;
  value: number; // percent 1-100, or amount >=0
}

export interface Budget {
  id: string;
  accountId: string; // unique
  monthlyBudget: number;
  categoryLimits: CategoryLimit[];
  warningThreshold: WarningThreshold;
  rolloverEnabled: boolean;
}

export interface Category {
  id: string;
  name: string;
  icon: string; // lucide icon name
  color: string; // hex
  isDefault: boolean;
  sortOrder: number;
  /** User override of a default category's localized name. When set, the label
   *  resolver prefers it over the i18n key. Undefined for untouched defaults
   *  and for custom categories (which use `name`). */
  customName?: string;
}

/** A user-defined refinement of one category ("Restaurant" → "Midi", "Livraison").
 *  Owned entirely by its parent: no defaults are seeded, none survive the
 *  parent's deletion, and icon/color are inherited rather than stored. */
export interface Subcategory {
  id: string;
  categoryId: string;
  name: string;
  sortOrder: number;
}

export interface IncomeType {
  id: string;
  /** Stable unique key (slug for defaults, generated slug for customs).
   *  Referenced by Transaction/Recurring. Free-form string so users can create
   *  their own types beyond the seeded enum. */
  key: string;
  label: string; // localized fallback label (used when no i18n key matches)
  order: number;
  icon?: string; // lucide icon name (defaults to 'Coins' in the UI)
  color?: string; // hex (defaults to the income accent in the UI)
}

/** A user-defined refinement of one income type ("Salaire" → "Prime", "13e mois").
 *  The income-type counterpart of [Subcategory]: no defaults are seeded, none
 *  survive the parent's deletion, and icon/color are inherited.
 *  Parent is referenced by `key`, matching how Transaction.incomeType does — a
 *  key is stable across relabelling, an id would be redundant indirection. */
export interface IncomeSubtype {
  id: string;
  incomeTypeKey: string;
  name: string;
  sortOrder: number;
}

export interface MonthClosure {
  accountId: string;
  month: string; // 'YYYY-MM' — compound key [accountId+month]
  closedAt: string;
  rolloverAmount: number; // 0 when rollover OFF
  rolloverSourceMonth?: string;
}

// ---- Settings (key → value store) ----

export type ThemePref = 'light' | 'dark' | 'system';
export type Locale = 'fr' | 'en';

export interface SettingsState {
  theme: ThemePref;
  locale: Locale | null; // null = follow browser detection
  /** ISO 4217 currency code (default 'EUR'). Read by the format layer. */
  currency: string;
  /** User-added ISO codes beyond the curated quick-pick list. */
  customCurrencies: string[];
  dateFormat: 'short' | 'long';
  hasOnboarded: boolean;
  installPromptDismissed: null | 'session' | 'permanent';
  engagement: {
    expensesAdded: number;
    sessions: number;
    lastShown: number | null; // epoch ms
  };
  lastUsedAccountId: string | null;
  /** Account preset for every NEW expense. null = fall back to current logic. */
  defaultExpenseAccountId: string | null;
  /** Account preset for every NEW income. null = fall back to current logic. */
  defaultIncomeAccountId: string | null;
}

/** A month string 'YYYY-MM'. */
export type Month = string;
