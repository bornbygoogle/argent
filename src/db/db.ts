import Dexie, { type Table } from 'dexie';
import type {
  Account,
  Transaction,
  Recurring,
  Budget,
  Category,
  IncomeType,
  MonthClosure,
} from '@/types/models';

/** Single-row settings wrapper (key = 'app'). */
export interface SettingsRecord {
  key: 'app';
  state: import('@/types/models').SettingsState;
}

export const DEFAULT_SETTINGS: SettingsRecord['state'] = {
  theme: 'system',
  locale: null,
  currency: 'EUR',
  customCurrencies: [],
  dateFormat: 'long',
  hasOnboarded: false,
  installPromptDismissed: null,
  engagement: { expensesAdded: 0, sessions: 0, lastShown: null },
  lastUsedAccountId: null,
  defaultExpenseAccountId: null,
  defaultIncomeAccountId: null,
};

export class AppDB extends Dexie {
  accounts!: Table<Account, string>;
  transactions!: Table<Transaction, string>;
  recurrings!: Table<Recurring, string>;
  budgets!: Table<Budget, string>;
  categories!: Table<Category, string>;
  incomeTypes!: Table<IncomeType, string>;
  monthClosures!: Table<MonthClosure, [string, string]>;
  settings!: Table<SettingsRecord, 'app'>;

  constructor() {
    super('argent');
    this.version(1).stores({
      // Primary key first (string ids we generate); then secondary indices.
      accounts: 'id, name, archived, order',
      transactions:
        'id, accountId, date, [accountId+date], kind, [kind+accountId+date], transferGroupId, recurringSourceId, incomeType, [incomeType+date], categoryId',
      recurrings: 'id, accountId, direction',
      budgets: 'id, &accountId',
      categories: 'id, sortOrder',
      incomeTypes: 'id, order',
      monthClosures: '[accountId+month], accountId, month',
      settings: 'key',
    });
  }
}

export const db = new AppDB();
