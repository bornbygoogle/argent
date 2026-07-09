import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/ui/Sheet';
import { Icon } from '@/components/ui/Icon';
import { TintedIcon } from '@/components/ui/TintedIcon';
import { useAccounts, useAllTransactions } from '@/hooks/selectors';
import { accountBalance } from '@/lib/calc';
import { formatCurrency } from '@/lib/format';
import type { Account, AccountScope } from '@/types/models';

interface AccountSwitcherProps {
  open: boolean;
  onClose: () => void;
  scope: AccountScope;
  onPick: (scope: AccountScope) => void;
}

const rowBtn = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 4px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: 'inherit',
} as const;

/** Below this many accounts the sheet scrolls fine on its own; a search field
 *  would just be noise. Above it, the sticky search keeps every account one
 *  tap away, so none is ever unreachable — even with dozens. */
const SEARCH_THRESHOLD = 6;

/** Pick the active account scope: "All accounts" or a specific account.
 *  Bottom sheet anchored to the phone column; the filter only narrows the
 *  account list — "All accounts" and "Manage" stay pinned at the ends. */
export function AccountSwitcher({ open, onClose, scope, onPick }: AccountSwitcherProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const accounts = useAccounts();
  const allTx = useAllTransactions();
  const [query, setQuery] = useState('');

  // Reset the filter on every close (any path: pick, Manage, scrim, Escape)
  // so reopening always shows the full list.
  const close = () => {
    setQuery('');
    onClose();
  };
  const pick = (s: AccountScope) => {
    onPick(s);
    close();
  };
  const total = accounts.reduce((acc, a) => acc + accountBalance(a, allTx), 0);

  const q = query.trim().toLowerCase();
  const showSearch = accounts.length > SEARCH_THRESHOLD;
  const filtered = q ? accounts.filter((a) => a.name.toLowerCase().includes(q)) : accounts;

  return (
    <Sheet open={open} onClose={close} title={t('form.account')}>
      <div className="col" style={{ paddingBottom: 8 }}>
        {showSearch && (
          <input
            type="search"
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('accounts.searchPlaceholder')}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 1,
              background: 'var(--white)',
              marginBottom: 6,
            }}
          />
        )}

        <button type="button" style={rowBtn} onClick={() => pick('all')}>
          <span
            className="acct-icon"
            style={{ background: 'linear-gradient(90deg,#4F46E5,#10B981,#F59E0B)', color: '#fff' }}
          >
            <Icon name="Wallet" size={18} strokeWidth={2} />
          </span>
          <span className="acct-name">{t('scope.all')}</span>
          <span className="acct-amount tnum">{formatCurrency(total)}</span>
          {scope === 'all' && <Icon name="Check" size={18} color="var(--primary-600)" />}
        </button>

        {filtered.length > 0 && <div className="divider" />}

        {filtered.map((a: Account) => (
          <button key={a.id} type="button" style={rowBtn} onClick={() => pick(a.id)}>
            <TintedIcon hex={a.color} icon={a.icon} variant="acct" />
            <span className="acct-name">{a.name}</span>
            <span className="acct-amount tnum">{formatCurrency(accountBalance(a, allTx))}</span>
            {scope === a.id && <Icon name="Check" size={18} color="var(--primary-600)" />}
          </button>
        ))}

        {q && filtered.length === 0 && (
          <span className="body-sm muted" style={{ padding: '10px 4px' }}>
            {t('accounts.noMatch')}
          </span>
        )}

        <div className="divider" />
        <button
          type="button"
          style={rowBtn}
          onClick={() => {
            close();
            navigate('/accounts');
          }}
        >
          <span className="acct-icon" style={{ background: 'var(--neutral-100)', color: 'var(--neutral-500)' }}>
            <Icon name="Pencil" size={16} strokeWidth={2} />
          </span>
          <span className="acct-name">{t('common.manage')}</span>
          <Icon name="ChevronRight" size={16} color="var(--neutral-300)" />
        </button>
      </div>
    </Sheet>
  );
}
