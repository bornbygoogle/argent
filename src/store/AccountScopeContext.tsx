import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { useLocation, useNavigate } from 'react-router';
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
  const location = useLocation();
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const rawScope = params.get('account') ?? 'all';

  // This provider sits above <Routes>, so it has no route match of its own and
  // any relative navigation would resolve against "/". Everything below writes
  // an absolute pathname, and reads it through a ref that is refreshed on every
  // render — so even a `setScope` captured on a previous screen targets the
  // screen the user is actually looking at.
  const locationRef = useRef(location);
  locationRef.current = location;

  // Booleans don't index well in Dexie; fetch all and filter/sort in memory.
  // `undefined` means "not read yet" and must not be mistaken for "none exist".
  const allAccounts = useLiveQuery(() => db.accounts.toArray(), []);
  const loaded = allAccounts !== undefined;
  const activeAccounts = useMemo(
    () => (allAccounts ?? []).filter((a) => !a.archived).sort((a, b) => a.order - b.order),
    [allAccounts],
  );

  const validIds = useMemo(() => new Set(activeAccounts.map((a) => a.id)), [activeAccounts]);
  // Until the accounts are read, honour the URL: a deep link or a reload says
  // which account the user means, and treating it as invalid mid-load would
  // silently reset the screen to "All accounts".
  const scope: AccountScope =
    rawScope === 'all' || !loaded || validIds.has(rawScope) ? rawScope : 'all';

  const writeScope = useCallback(
    (s: AccountScope, replace: boolean) => {
      const { pathname, search, hash } = locationRef.current;
      const next = new URLSearchParams(search);
      if (s === 'all') next.delete('account');
      else next.set('account', s);
      const qs = next.toString();
      navigate({ pathname, search: qs ? `?${qs}` : '', hash }, { replace });
    },
    [navigate],
  );

  // Drop an account= param that no longer resolves (archived or deleted), but
  // only once the accounts have actually been read.
  useEffect(() => {
    if (!loaded) return;
    if (rawScope === 'all' || validIds.has(rawScope)) return;
    writeScope('all', true);
  }, [loaded, rawScope, validIds, writeScope]);

  const setScope = useCallback((s: AccountScope) => writeScope(s, true), [writeScope]);

  const value = useMemo(
    () => ({ scope, setScope, accounts: activeAccounts }),
    [scope, setScope, activeAccounts],
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
