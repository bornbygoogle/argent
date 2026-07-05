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

/** Pick the active account scope: "All accounts" or a specific account. */
export function AccountSwitcher({ open, onClose, scope, onPick }: AccountSwitcherProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const accounts = useAccounts();
  const allTx = useAllTransactions();
  const pick = (s: AccountScope) => {
    onPick(s);
    onClose();
  };
  const total = accounts.reduce((acc, a) => acc + accountBalance(a, allTx), 0);

  return (
    <Sheet open={open} onClose={onClose} title={t('form.account')}>
      <div className="col" style={{ paddingBottom: 8 }}>
        <button type="button" style={rowBtn} onClick={() => pick('all')}>
          <span
            className="acct-icon"
            style={{ background: 'linear-gradient(90deg,#4F46E5,#10B981,#F59E0B)', color: '#fff' }}
          >
            <Icon name="Wallet" size={18} strokeWidth={2} />
          </span>
          <span className="r-main">
            <span className="r-title">{t('scope.all')}</span>
            <span className="r-sub tnum">{formatCurrency(total)}</span>
          </span>
          {scope === 'all' && <Icon name="Check" size={18} color="var(--primary-600)" />}
        </button>

        {accounts.length > 0 && <div className="divider" />}

        {accounts.map((a: Account) => (
          <button key={a.id} type="button" style={rowBtn} onClick={() => pick(a.id)}>
            <TintedIcon hex={a.color} icon={a.icon} variant="acct" />
            <span className="r-main">
              <span className="r-title">{a.name}</span>
              <span className="r-sub tnum">{formatCurrency(accountBalance(a, allTx))}</span>
            </span>
            {scope === a.id && <Icon name="Check" size={18} color="var(--primary-600)" />}
          </button>
        ))}

        <div className="divider" />
        <button
          type="button"
          style={rowBtn}
          onClick={() => {
            onClose();
            navigate('/accounts');
          }}
        >
          <span className="acct-icon" style={{ background: 'var(--neutral-100)', color: 'var(--neutral-500)' }}>
            <Icon name="Pencil" size={16} strokeWidth={2} />
          </span>
          <span className="r-main">
            <span className="r-title">{t('common.manage')}</span>
          </span>
          <Icon name="ChevronRight" size={16} color="var(--neutral-300)" />
        </button>
      </div>
    </Sheet>
  );
}
