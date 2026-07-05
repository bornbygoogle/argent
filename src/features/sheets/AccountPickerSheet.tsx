import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/ui/Sheet';
import { Icon } from '@/components/ui/Icon';
import { TintedIcon } from '@/components/ui/TintedIcon';
import { useAccounts, useAllTransactions } from '@/hooks/selectors';
import { accountBalance } from '@/lib/calc';
import { formatCurrency } from '@/lib/format';

interface AccountPickerSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  selectedId?: string;
  excludeId?: string;
  onPick: (accountId: string) => void;
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

/** Single-select account picker (used by the transfer screen for from/to). */
export function AccountPickerSheet({
  open,
  onClose,
  title,
  selectedId,
  excludeId,
  onPick,
}: AccountPickerSheetProps) {
  const { t } = useTranslation();
  const accounts = useAccounts();
  const allTx = useAllTransactions();
  const choices = accounts.filter((a) => a.id !== excludeId);

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="col" style={{ paddingBottom: 8 }}>
        {choices.map((a) => (
          <button
            key={a.id}
            type="button"
            style={rowBtn}
            onClick={() => {
              onPick(a.id);
              onClose();
            }}
          >
            <TintedIcon hex={a.color} icon={a.icon} variant="acct" />
            <span className="r-main">
              <span className="r-title">{a.name}</span>
              <span className="r-sub tnum">{formatCurrency(accountBalance(a, allTx))}</span>
            </span>
            {selectedId === a.id && <Icon name="Check" size={18} color="var(--primary-600)" />}
          </button>
        ))}
        {choices.length === 0 && (
          <p className="body-sm text-center" style={{ padding: '24px 12px' }}>
            {t('accounts.needTwo')}
          </p>
        )}
      </div>
    </Sheet>
  );
}
