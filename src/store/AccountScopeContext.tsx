import {
  createContext,
  useContext,
  useEffect,
  useMemo,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import type { Account, AccountScope } from '@/types/models';

interface AccountScopeValue {
  scope: AccountScope;
  setScope: (s: AccountScope) => void;
  accounts: Account[]; // non-archived, ordered
}

const AccountScopeContext = createContext<AccountScopeValue | null>(null);

export function AccountScopeProvider({ children }: { children: React.ReactNode }) {
  const [params, setParams] = useSearchParams();
  const rawScope = params.get('account') ?? 'all';

  // Booleans don't index well in Dexie; fetch all and filter/sort in memory.
  const allAccounts = useLiveQuery(() => db.accounts.toArray(), []) ?? [];
  const activeAccounts = useMemo(
    () => allAccounts.filter((a) => !a.archived).sort((a, b) => a.order - b.order),
    [allAccounts],
  );

  const validIds = useMemo(() => new Set(activeAccounts.map((a) => a.id)), [activeAccounts]);
  const scope: AccountScope =
    rawScope === 'all' || validIds.has(rawScope) ? rawScope : 'all';

  // Drop an invalid account= param (e.g. account was archived/deleted).
  useEffect(() => {
    if (rawScope !== 'all' && !validIds.has(rawScope) && activeAccounts.length >= 0) {
      const next = new URLSearchParams(params);
      next.delete('account');
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawScope, validIds.size]);

  const setScope = (s: AccountScope) => {
    const next = new URLSearchParams(params);
    if (s === 'all') next.delete('account');
    else next.set('account', s);
    setParams(next, { replace: true });
  };

  const value = useMemo(
    () => ({ scope, setScope, accounts: activeAccounts }),
    [scope, activeAccounts],
  );

  return (
    <AccountScopeContext.Provider value={value}>{children}</AccountScopeContext.Provider>
  );
}

export function useAccountScope(): AccountScopeValue {
  const ctx = useContext(AccountScopeContext);
  if (!ctx) throw new Error('useAccountScope must be used within AccountScopeProvider');
  return ctx;
}
