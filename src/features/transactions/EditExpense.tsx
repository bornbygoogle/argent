import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/ui/TopBar';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { useTransaction } from '@/hooks/selectors';
import { TransactionForm } from './TransactionForm';

export function EditExpense() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const tx = useTransaction(id);

  if (!tx) {
    // undefined while loading, or genuinely missing → show a safe fallback.
    return (
      <>
        <TopBar
          title={t('screens.editExpense')}
          left={
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="icon-btn"
              aria-label={t('common.back')}
            >
              <Icon name="ChevronLeft" size={22} />
            </button>
          }
        />
        <div className="content">
          <EmptyState icon="Search" title={t('common.loading')} />
        </div>
      </>
    );
  }

  return <TransactionForm kind={tx.kind === 'income' ? 'income' : 'expense'} transaction={tx} />;
}
