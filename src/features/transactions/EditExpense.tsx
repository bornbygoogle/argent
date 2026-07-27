import { useNavigate, useParams } from 'react-router-dom';
import { useGoBack } from '@/hooks/useGoBack';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/ui/TopBar';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useTransaction } from '@/hooks/selectors';
import { TransactionForm } from './TransactionForm';

export function EditExpense() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const goBack = useGoBack('/expenses');
  const tx = useTransaction(id);

  if (tx === undefined || tx === null) {
    // `undefined` is still loading; `null` means there is no such movement —
    // deleted on another device, or a stale link. Saying "Loading…" for the
    // second case leaves the user on a spinner that never resolves.
    const missing = tx === null;
    return (
      <>
        <TopBar
          title={t('screens.editExpense')}
          left={
            <button
              type="button"
              onClick={() => goBack()}
              className="icon-btn"
              aria-label={t('common.back')}
            >
              <Icon name="ChevronLeft" size={22} />
            </button>
          }
        />
        <div className="content">
          {missing ? (
            <EmptyState
              icon="Search"
              title={t('movements.notFound')}
              hint={t('movements.notFoundHint')}
              action={
                <Button onClick={() => navigate('/expenses', { replace: true })}>
                  {t('screens.movements')}
                </Button>
              }
            />
          ) : (
            <EmptyState icon="Search" title={t('common.loading')} />
          )}
        </div>
      </>
    );
  }

  return <TransactionForm kind={tx.kind === 'income' ? 'income' : 'expense'} transaction={tx} />;
}
