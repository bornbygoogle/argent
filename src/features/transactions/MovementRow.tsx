import { useTranslation } from 'react-i18next';
import { Row } from '@/components/ui/Row';
import { TintedIcon } from '@/components/ui/TintedIcon';
import { DirectionBadge } from '@/components/ui/DirectionBadge';
import { formatSignedCurrency } from '@/lib/format';
import { transactionLabel, transferLabel } from '@/lib/labels';
import { direction, isExpense, isTransfer } from '@/lib/calc';
import { useIncomeTypeMap } from '@/hooks/selectors';
import type { Account, Category, Transaction } from '@/types/models';

interface MovementRowProps {
  tx: Transaction;
  account?: Account;
  category?: Category;
  /** For transfer legs: the account on the other side (drives the label). */
  counterAccount?: Account;
  showAccount?: boolean;
  showDir?: boolean;
  onClick?: () => void;
}

/** A single movement line built on the validated mock `.row` classes. */
export function MovementRow({
  tx,
  account,
  category,
  counterAccount,
  showAccount,
  showDir = false,
  onClick,
}: MovementRowProps) {
  const { t } = useTranslation();
  const incomeTypeMap = useIncomeTypeMap();
  const dir = direction(tx);
  const transfer = isTransfer(tx);
  const expense = isExpense(tx);

  const icon = transfer ? 'ArrowLeftRight' : expense ? category?.icon ?? 'ShoppingCart' : 'Banknote';
  const tint = transfer ? '#4F46E5' : expense ? category?.color ?? '#64748B' : '#10B981';

  const label = transfer
    ? transferLabel(t, tx, counterAccount)
    : transactionLabel(
        t,
        tx,
        new Map(category ? [[category.id, category]] : []),
        incomeTypeMap,
      );
  const sub = showAccount && account ? account.name : undefined;

  const dirKey: 'in' | 'out' | 'trf' = transfer ? 'trf' : dir;
  const dirLabel = transfer
    ? t('screens.transfer')
    : dir === 'in'
      ? t('quickAction.income')
      : t('quickAction.expense');
  const amtClass = transfer ? 'amt-trf' : dir === 'in' ? 'amt-in' : 'amt-out';
  const signed = dir === 'in' ? tx.amount : -tx.amount;

  return (
    <Row
      icon={<TintedIcon hex={tint} icon={icon} variant="cat" />}
      title={
        showDir ? (
          <>
            {label}
            <span style={{ marginLeft: 6 }}>
              <DirectionBadge dir={dirKey}>{dirLabel}</DirectionBadge>
            </span>
          </>
        ) : (
          label
        )
      }
      sub={sub}
      trailing={<span className={['r-amt', amtClass].join(' ')}>{formatSignedCurrency(signed)}</span>}
      onClick={onClick}
    />
  );
}
