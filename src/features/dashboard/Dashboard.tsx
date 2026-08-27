import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { computeRunway } from '@/lib/runway';
import { Runway } from '@/components/ui/Runway';
import { useAccountScope } from '@/store/AccountScopeContext';
import {
  useAccounts,
  useAccountMap,
  useAllTransactions,
  useCategoryMap,
  useMonthSummary,
  useRecentMovements,
  useRecurrings,
  useScopedRecurrings,
  useBudgetPeriod,
  useVariableExpenses,
} from '@/hooks/selectors';
import { accountBalance, isTransfer, totalBalance } from '@/lib/calc';
import { currentMonth } from '@/lib/date';
import { formatCurrency, formatSignedCurrency } from '@/lib/format';
import { isConfirmedIn, confirmRecurring } from '@/lib/recurring';
import { upcomingCommitments } from '@/lib/budget';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useScopedPath } from '@/hooks/useScopedPath';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import { Icon } from '@/components/ui/Icon';
import { TopBar } from '@/components/ui/TopBar';
import { AccountChip } from '@/components/ui/AccountChip';
import { Banner } from '@/components/ui/Banner';
import { TintedIcon } from '@/components/ui/TintedIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { SyncPill } from '@/components/ui/SyncPill';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { MovementRow } from '@/features/transactions/MovementRow';
import { AccountSwitcher } from '@/features/sheets/AccountSwitcher';
import { InstallPrompt } from '@/features/install/InstallPrompt';
import { useToast } from '@/store/ToastContext';
import type { Recurring } from '@/types/models';

export function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const scopedPath = useScopedPath();
  const toast = useToast();
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
  const [pendingRecur, setPendingRecur] = useState<Recurring | null>(null);

  const activeAccount = scope === 'all' ? undefined : accountMap.get(scope);
  const balance = activeAccount ? accountBalance(activeAccount, allTx) : totalBalance(accounts, allTx);
  const scopeLabel = scope === 'all' ? t('scope.all') : activeAccount?.name ?? t('scope.all');

  // The home screen's job is to answer "what can I still spend?". It starts
  // from the balance — every euro that has landed, whenever it landed — and
  // subtracts only the bills of the cycle not yet debited. A settled bill is
  // already out of the balance, so subtracting it too would count the same
  // rent twice; when one is debited, balance and bills-to-come drop together
  // and the figure holds still. Only real spending moves it.
  // The cycle runs payday to payday (see useBudgetPeriod), which is what "days
  // left" and the pace notch measure against.
  const period = useBudgetPeriod();
  const scopedRecurrings = useScopedRecurrings(scope);
  const stillDue = upcomingCommitments(scopedRecurrings, period.month, period.anchor);
  const left = balance - stillDue;
  const variableSpent = useVariableExpenses(scope, period.month, period.anchor)
    .reduce((s, t) => s + t.amount, 0);
  // The cycle's "budget" is what was free when it started: what is left now
  // plus what has been spent since. That keeps the bar's fill meaning "share
  // of the cycle's free money already gone".
  const runway = computeRunway(left + variableSpent, variableSpent, new Date(), period);
  // With no commitments the figure would just repeat the balance, so the hero
  // falls back to the plain balance and the set-a-budget nudge.
  const hasBudget = scopedRecurrings.some((r) => r.direction === 'expense');

  const heroLabel = hasBudget
    ? t('dashboard.leftToSpend')
    : scope === 'all' && accounts.length > 0
      ? `${t('dashboard.balance')} · ${accounts.length}`
      : t('dashboard.balance');
  const heroFigure = hasBudget ? runway.remaining : balance;
  // With a single account its name appears on every row and tells you nothing —
  // pure noise in a list whose whole job is to be scannable.
  const showRowAccount = scope === 'all' && accounts.length > 1;

  // Most-used expense categories this month, so the commonest entry is one tap
  // from the home screen instead of three.
  const topCategories = (() => {
    const counts = new Map<string, number>();
    for (const tx of allTx) {
      if (tx.kind !== 'expense' || !tx.categoryId) continue;
      counts.set(tx.categoryId, (counts.get(tx.categoryId) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([id]) => categoryMap.get(id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));
  })();

  return (
    <>
      <TopBar
        screenName={t('screens.dashboard')}
        left={
          <AccountChip
            dot={scope === 'all' ? 'tri' : activeAccount?.color}
            name={scopeLabel}
            onClick={() => setScopeOpen(true)}
          />
        }
        right={<SyncPill />}
      />

      <main className="content" style={{ paddingBottom: 96, gap: 14 }}>
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
                onClick={() => signIn()}
                disabled={googleBusy}
              >
                {t('settings.google.reconnectBtn')}
              </button>
            </span>
          </Banner>
        )}

        {/* Hero — one figure that answers "what can I still spend?", the runway
            that gives it context, and the two supporting totals underneath. */}
        <div className="hero">
          <div className="hero-label">{heroLabel}</div>
          <div className={['amount', 'hero-figure', hasBudget && !runway.over ? 'is-signal' : ''].join(' ').trim()}>
            {formatCurrency(heroFigure)}
          </div>

          {hasBudget ? (
            <Runway data={runway} />
          ) : (
            <button type="button" className="hero-cta" onClick={() => navigate(scopedPath('/budget'))}>
              {t('dashboard.setBudget')}
            </button>
          )}

          <div className="hero-foot">
            <div>
              <div className="hf-k">{t('dashboard.income')}</div>
              <div className="hf-v">{formatCurrency(summary.income)}</div>
            </div>
            <div>
              <div className="hf-k">{t('dashboard.expenses')}</div>
              <div className="hf-v">{formatCurrency(summary.expense)}</div>
            </div>
            {hasBudget && (
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div className="hf-k">{t('dashboard.balance')}</div>
                <div className="hf-v">{formatCurrency(balance)}</div>
              </div>
            )}
          </div>
        </div>

        {/* Quick log — the commonest entry, one tap from home. */}
        {topCategories.length > 0 && (
          <div className="quicklog">
            {topCategories.map((c) => (
              <button
                key={c.id}
                type="button"
                className="ql-tile"
                onClick={() => navigate(`/add?category=${encodeURIComponent(c.id)}`)}
              >
                <TintedIcon color={c.color} icon={c.icon} variant="cat-sm" />
                <span className="ql-lbl">{c.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Recurring — to confirm this month */}
        {todoRecurring.length > 0 && (
          <div>
            <div className="section-head" style={{ marginBottom: 4 }}>
              <h2 className="h3">{t('recurring.toConfirm')}</h2>
              <button
                type="button"
                onClick={() => navigate(scopedPath('/recurring'))}
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
                    <TintedIcon color={r.color} icon={r.icon} variant="cat-sm" />
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
                      onClick={() => setPendingRecur(r)}
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
            <h2 className="h3">{t('dashboard.recent')}</h2>
            {recent.length > 0 && (
              <button
                type="button"
                onClick={() => navigate(scopedPath('/expenses'))}
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
                  showAccount={showRowAccount}
                  showDir
                  onClick={() =>
                    navigate(isTransfer(tx) ? `/transfer/${tx.transferGroupId}` : `/expenses/${tx.id}`)
                  }
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <AccountSwitcher open={scopeOpen} onClose={() => setScopeOpen(false)} scope={scope} onPick={setScope} />
      <InstallPrompt />

      <Sheet open={!!pendingRecur} onClose={() => setPendingRecur(null)}>
        <div className="text-center" style={{ paddingBottom: 8 }}>
          <h2 className="h3" style={{ marginBottom: 4 }}>
            {t('recurring.confirmTitle')}
          </h2>
          <p className="body-sm" style={{ marginBottom: 20 }}>
            {/* A charge naming a receiver is a transfer, not a payment out —
                saying "recorded on Courant" would hide half of what happens. */}
            {pendingRecur &&
              t(
                pendingRecur.receiverAccountId
                  ? 'recurring.confirmTransferBody'
                  : 'recurring.confirmBody',
                {
                  amount: formatSignedCurrency(
                    pendingRecur.direction === 'income' ? pendingRecur.amount : -pendingRecur.amount,
                  ),
                  account: accountMap.get(pendingRecur.accountId)?.name ?? '',
                  receiver: accountMap.get(pendingRecur.receiverAccountId ?? '')?.name ?? '',
                },
              )}
          </p>
          <div className="col gap-2">
            <Button
              full
              onClick={async () => {
                if (!pendingRecur) return;
                const row = pendingRecur;
                setPendingRecur(null);
                // A full month comes back null and writes nothing. Reporting
                // that as "recorded" told the user a charge was paid when it
                // was not — the one lie a money app must never tell. Same
                // reading as the Recurring screen's own Log button.
                const written = await confirmRecurring(row);
                if (written === null) {
                  toast.error(t('recurring.monthFullToast', { label: row.label }));
                } else {
                  toast.success(t('recurring.confirmedToast'));
                }
              }}
            >
              {t('common.confirm')}
            </Button>
            <Button variant="secondary" full onClick={() => setPendingRecur(null)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
