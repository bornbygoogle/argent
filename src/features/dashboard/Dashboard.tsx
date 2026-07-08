import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAccountScope } from '@/store/AccountScopeContext';
import {
  useAccounts,
  useAccountMap,
  useAllTransactions,
  useCategoryMap,
  useMonthSummary,
  useRecentMovements,
  useRecurrings,
} from '@/hooks/selectors';
import { accountBalance, isTransfer, totalBalance } from '@/lib/calc';
import { currentMonth } from '@/lib/date';
import { formatCurrency, formatSignedCurrency } from '@/lib/format';
import { isConfirmedIn, confirmRecurring } from '@/lib/recurring';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import { Icon } from '@/components/ui/Icon';
import { TopBar } from '@/components/ui/TopBar';
import { AccountChip } from '@/components/ui/AccountChip';
import { Hero } from '@/components/ui/Hero';
import { Banner } from '@/components/ui/Banner';
import { TintedIcon } from '@/components/ui/TintedIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { SyncPill } from '@/components/ui/SyncPill';
import { MovementRow } from '@/features/transactions/MovementRow';
import { AccountSwitcher } from '@/features/sheets/AccountSwitcher';
import { InstallPrompt } from '@/features/install/InstallPrompt';

export function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { scope, setScope } = useAccountScope();
  const accounts = useAccounts();
  const accountMap = useAccountMap();
  const categoryMap = useCategoryMap();
  const allTx = useAllTransactions();
  const summary = useMonthSummary(currentMonth(), scope);
  const recent = useRecentMovements(scope, 6);
  const recurrings = useRecurrings();
  const month = currentMonth();
  const todoRecurring = recurrings.filter((r) => !isConfirmedIn(r, month)).slice(0, 4);
  const online = useOnlineStatus();
  const { needsReconnect, signIn, busy: googleBusy } = useGoogleAuth();

  const [scopeOpen, setScopeOpen] = useState(false);
  const [reconnectDismissed, setReconnectDismissed] = useState(false);

  const activeAccount = scope === 'all' ? undefined : accountMap.get(scope);
  const balance = activeAccount ? accountBalance(activeAccount, allTx) : totalBalance(accounts, allTx);
  const scopeLabel = scope === 'all' ? t('scope.all') : activeAccount?.name ?? t('scope.all');
  const heroLabel =
    scope === 'all' && accounts.length > 0
      ? `${t('dashboard.balance')} · ${accounts.length}`
      : t('dashboard.balance');

  return (
    <>
      <TopBar
        left={
          <AccountChip
            dot={scope === 'all' ? 'tri' : activeAccount?.color}
            name={scopeLabel}
            onClick={() => setScopeOpen(true)}
          />
        }
        right={<SyncPill />}
      />

      <div className="content" style={{ paddingBottom: 96, gap: 14 }}>
        {!online && (
          <Banner tone="warn" icon="WifiOff">
            {t('dashboard.offline')}
          </Banner>
        )}

        {needsReconnect && !reconnectDismissed && (
          <Banner
            tone="warn"
            icon="CloudOff"
            onDismiss={() => setReconnectDismissed(true)}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {t('settings.google.reconnectBanner')}
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void signIn()}
                disabled={googleBusy}
              >
                {t('settings.google.reconnectBtn')}
              </button>
            </span>
          </Banner>
        )}

        {/* Balance hero */}
        <Hero label={heroLabel}>
          <div className="amount" style={{ color: '#fff', fontSize: 36, marginTop: 4 }}>
            {formatCurrency(balance)}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 14 }}>
            <div>
              <div className="caption" style={{ color: 'rgba(255,255,255,.8)' }}>
                {t('dashboard.income')}
              </div>
              <div className="amount-md" style={{ color: '#fff' }}>
                {formatCurrency(summary.income)}
              </div>
            </div>
            <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,.25)' }} />
            <div>
              <div className="caption" style={{ color: 'rgba(255,255,255,.8)' }}>
                {t('dashboard.expenses')}
              </div>
              <div className="amount-md" style={{ color: '#fff' }}>
                {formatCurrency(summary.expense)}
              </div>
            </div>
          </div>
        </Hero>

        {/* Recurring — to confirm this month */}
        {todoRecurring.length > 0 && (
          <div>
            <div className="section-head" style={{ marginBottom: 4 }}>
              <span className="h3">{t('recurring.toConfirm')}</span>
              <button
                type="button"
                onClick={() => navigate('/recurring')}
                className="body-sm"
                style={{ color: 'var(--primary-600)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                {t('common.manage')}
              </button>
            </div>
            <div className="card tight">
              {todoRecurring.map((r) => {
                const acct = accountMap.get(r.accountId);
                return (
                  <div className="recur" key={r.id}>
                    <TintedIcon hex={r.color} icon={r.icon} variant="cat-sm" />
                    <div className="r-main">
                      <div className="r-title">{r.label}</div>
                      <div className="r-sub">
                        {t(`recurring.cadence.${r.cadence}`)}
                        {acct ? ` · ${acct.name}` : ''}
                      </div>
                    </div>
                    <span
                      className="amount-md"
                      style={{ fontSize: 14, color: r.direction === 'income' ? 'var(--success-600)' : undefined }}
                    >
                      {formatSignedCurrency(r.direction === 'income' ? r.amount : -r.amount)}
                    </span>
                    <button
                      type="button"
                      className="confirm-btn"
                      onClick={() => confirmRecurring(r, month)}
                    >
                      <Icon name="Check" size={14} strokeWidth={2.5} />
                      {t('recurring.confirmBtn')}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent movements */}
        <div>
          <div className="section-head" style={{ marginBottom: 4 }}>
            <span className="h3">{t('dashboard.recent')}</span>
            {recent.length > 0 && (
              <button
                type="button"
                onClick={() => navigate('/expenses')}
                className="body-sm"
                style={{
                  color: 'var(--primary-600)',
                  fontWeight: 600,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {t('common.seeAll')}
              </button>
            )}
          </div>

          {recent.length === 0 ? (
            <div className="card">
              <EmptyState icon="Receipt" title={t('dashboard.empty')} hint={t('dashboard.emptyHint')} />
            </div>
          ) : (
            <div className="card tight">
              {recent.map((tx) => (
                <MovementRow
                  key={tx.id}
                  tx={tx}
                  account={accountMap.get(tx.accountId)}
                  category={tx.categoryId ? categoryMap.get(tx.categoryId) : undefined}
                  counterAccount={tx.counterAccountId ? accountMap.get(tx.counterAccountId) : undefined}
                  showAccount={scope === 'all'}
                  showDir
                  onClick={() =>
                    navigate(isTransfer(tx) ? `/transfer/${tx.transferGroupId}` : `/expenses/${tx.id}`)
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <AccountSwitcher open={scopeOpen} onClose={() => setScopeOpen(false)} scope={scope} onPick={setScope} />
      <InstallPrompt />
    </>
  );
}
