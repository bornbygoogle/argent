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
  incomeType?: string;
  merchant?: string;
  note?: string;
  date: string; // 'YYYY-MM-DD'
  recurringSourceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringHistoryEntry {
  month: string; // 'YYYY-MM'
  amount: number;
  transactionId?: string;
}

export interface Recurring {
  id: string;
  accountId: string;
  direction: RecurringDirection;
  label: string;
  amount: number; // editable forward-only
  cadence: Cadence;
  cadenceMeta?: string;
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
