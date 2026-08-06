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
  /** When set, the list opens with a row that picks *no* account, reported as
   *  an empty id. Omit it and the choice stays mandatory, as it is for a
   *  transfer's own two ends. */
  noneLabel?: string;
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
  noneLabel,
  onPick,
}: AccountPickerSheetProps) {
  const { t } = useTranslation();
  const accounts = useAccounts();
  const allTx = useAllTransactions();
  const choices = accounts.filter((a) => a.id !== excludeId);

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="col" style={{ paddingBottom: 8 }}>
        {noneLabel !== undefined && (
          <button
            type="button"
            style={rowBtn}
            onClick={() => {
              onPick('');
              onClose();
            }}
          >
            <TintedIcon hex="#94A3B8" icon="Ban" variant="acct" />
            <span
              style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, color: 'var(--neutral-900)' }}
            >
              {noneLabel}
            </span>
            <span style={{ width: 18, display: 'inline-flex', justifyContent: 'flex-end' }}>
              {!selectedId && <Icon name="Check" size={18} color="var(--primary-600)" />}
            </span>
          </button>
        )}
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
            {/* Name left, balance right. These were nested in an .r-main span,
                but the rule that stacks title over subtitle is scoped to .row,
                which this button is not — so they rendered as one run of text,
                "CIC Commun6 044,23 €". */}
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 15,
                fontWeight: 500,
                color: 'var(--neutral-900)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {a.name}
            </span>
            <span className="tnum" style={{ fontSize: 15, color: 'var(--neutral-500)' }}>
              {formatCurrency(accountBalance(a, allTx))}
            </span>
            {/* A fixed slot, so the balances stay in one column whether or not
                a row carries the tick. */}
            <span style={{ width: 18, display: 'inline-flex', justifyContent: 'flex-end' }}>
              {selectedId === a.id && <Icon name="Check" size={18} color="var(--primary-600)" />}
            </span>
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
