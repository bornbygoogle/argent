import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/ui/TopBar';
import { Icon } from '@/components/ui/Icon';
import { AccountChip } from '@/components/ui/AccountChip';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState } from '@/components/ui/EmptyState';
import { MovementRow } from './MovementRow';
import { AccountSwitcher } from '@/features/sheets/AccountSwitcher';
import { useAccountScope } from '@/store/AccountScopeContext';
import { useAccountMap, useCategoryMap, useScopedTransactions } from '@/hooks/selectors';
import { formatCurrency, formatDayHeader } from '@/lib/format';
import { isExpense, isIncome, isTransfer, signedAmount } from '@/lib/calc';
import type { AccountScope, Transaction } from '@/types/models';

type Filter = 'all' | 'expense' | 'income' | 'transfer';

interface DayGroup {
  date: string;
  rows: Transaction[];
  net: number;
}

export function MovementsList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { scope, setScope } = useAccountScope();
  const accountMap = useAccountMap();
  const categoryMap = useCategoryMap();
  const allTx = useScopedTransactions(scope);
  const [filter, setFilter] = useState<Filter>('all');
  const [scopeOpen, setScopeOpen] = useState(false);

  const groups: DayGroup[] = useMemo(() => {
    const filtered = allTx.filter((tx) => {
      if (filter === 'expense') return isExpense(tx);
      if (filter === 'income') return isIncome(tx);
      if (filter === 'transfer') return isTransfer(tx);
      return true;
    });
    const sorted = [...filtered].sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : a.createdAt < b.createdAt ? 1 : -1,
    );
    const map = new Map<string, Transaction[]>();
    for (const tx of sorted) {
      const arr = map.get(tx.date) ?? [];
      arr.push(tx);
      map.set(tx.date, arr);
    }
    return [...map.entries()].map(([date, rows]) => ({
      date,
      rows,
      net: rows.reduce((acc, tx) => acc + signedAmount(tx), 0),
    }));
  }, [allTx, filter]);

  const scopeLabel = scope === 'all' ? t('scope.all') : accountMap.get(scope)?.name ?? t('scope.all');
  const activeAccount = scope === 'all' ? undefined : accountMap.get(scope);
  const totalCount = groups.reduce((s, g) => s + g.rows.length, 0);
  const totalNet = groups.reduce((s, g) => s + g.net, 0);
  const hasAnyMovements = allTx.length > 0;

  return (
    <>
      <TopBar
        title={t('screens.movements')}
        left={
          <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label={t('common.back')}>
            <Icon name="ChevronLeft" size={22} />
          </button>
        }
      />

      <div className="content" style={{ gap: 14, paddingBottom: 24 }}>
        {/* Scope + filter */}
        <div className="col gap-2">
          <AccountChip
            dot={scope === 'all' ? 'tri' : activeAccount?.color}
            name={scopeLabel}
            onClick={() => setScopeOpen(true)}
          />
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: t('movements.filterAll') },
              { value: 'expense', label: t('movements.filterExpenses') },
              { value: 'income', label: t('movements.filterIncome') },
              { value: 'transfer', label: t('movements.filterTransfers') },
            ]}
          />
        </div>

        {groups.length === 0 ? (
          hasAnyMovements ? (
            <EmptyState icon="Filter" title={t('movements.emptyFilter')} hint={t('movements.emptyFilterHint')} />
          ) : (
            <EmptyState icon="Receipt" title={t('movements.empty')} hint={t('movements.emptyHint')} />
          )
        ) : (
          <>
            {/* Running total */}
            <div className="card tight row-between" style={{ background: 'var(--primary-50)' }}>
              <span className="body-sm" style={{ fontWeight: 600, color: 'var(--neutral-700)' }}>
                {totalCount} · {t('screens.movements')}
              </span>
              <span className="amount-md" style={{ color: 'var(--primary-700)' }}>
                {formatCurrency(totalNet)}
              </span>
            </div>

            {/* Day groups */}
            {groups.map((g) => (
              <section key={g.date}>
                <div className="section-head" style={{ marginBottom: 4 }}>
                  <span className="label">{formatDayHeader(g.date)}</span>
                  <span className="body-sm tnum">{formatCurrency(g.net)}</span>
                </div>
                <div className="card tight">
                  {g.rows.map((tx) => (
                    <MovementRow
                      key={tx.id}
                      tx={tx}
                      account={accountMap.get(tx.accountId)}
                      category={tx.categoryId ? categoryMap.get(tx.categoryId) : undefined}
                      counterAccount={tx.counterAccountId ? accountMap.get(tx.counterAccountId) : undefined}
                      showAccount={scope === 'all'}
                      onClick={() =>
                        navigate(
                          isTransfer(tx) ? `/transfer/${tx.transferGroupId}` : `/expenses/${tx.id}`,
                        )
                      }
                    />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>

      <AccountSwitcher
        open={scopeOpen}
        onClose={() => setScopeOpen(false)}
        scope={scope as AccountScope}
        onPick={setScope}
      />
    </>
  );
}
